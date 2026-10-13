// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {Closure, Phase, Side, Terms} from "./Types.sol";

/// @title MarketEscrow
/// @notice One autocallable barrier note. Earn deposits stable principal;
///  Protect deposits the underlying token plus a premium reserve in stable.
///  The escrow holds everything the market can ever owe.
///
/// @dev Payoff (identical to the TypeScript model in web/src/lib/payoff.ts):
///  - Observation i, in order and once each. Price P_i against barrier B and
///    autocall A (compared exactly: P*10_000 >= strike*bps):
///      P >= B  -> gross coupon G = matched * c from the reserve to Earn,
///                 minus fee floor(G * feeBps / 10_000).
///      P <  B  -> no coupon, no memory.
///    An intermediate observation at or above A (autocall on) closes early.
///    The last observation closes Normal (P >= B) or Downside (P < B).
///  - Early / Normal: Earn gets N back, Protect gets Q plus remaining reserve.
///  - Downside: Earn gets Q tokens, Protect gets N (at the strike) plus
///    remaining reserve. Coupons already accrued stay with Earn in every case.
///  - Unwind (data missing past the window): Earn gets N, Protect gets Q plus
///    remaining reserve; accrued coupons stay, later coupons are cancelled.
///
///  Trust model: the terms are immutable, there is no owner, no upgrade path
///  and no function that moves principal other than the claim paths below.
///  Observation and unwind are permissionless.
///
///  Rounding: every pro-rata amount is floored, so the sum of claims never
///  exceeds a pool; the few base units of dust stay in the contract.
contract MarketEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------- errors
    error InvalidTerms(string reason);
    error WrongPhase(Phase actual);
    error SubscriptionClosed();
    error SubscriptionStillOpen();
    error ZeroLots();
    error NotEnoughLots(uint256 have, uint256 want);
    error ObservationNotDue(uint32 index, uint64 dueAt);
    error NoObservationsLeft();
    error InvalidOraclePrice();
    error DataOutsideWindow(uint32 index, uint256 updatedAt, uint64 from, uint64 to);
    error ValidDataAvailable(uint32 index);
    error WindowStillOpen(uint32 index, uint64 until);
    error NothingToClaim();

    // ------------------------------------------------------------- events
    event Subscribed(address indexed account, Side side, uint256 lots);
    event Cancelled(address indexed account, Side side, uint256 lots);
    event Activated(uint256 matchedLots);
    event MarketCancelled();
    event Observed(
        uint32 indexed index, uint256 price, uint256 updatedAt, bool couponPaid, bool autocalled
    );
    event Closed(Closure closure, uint32 atIndex);
    event Claimed(address indexed account, uint256 stableAmount, uint256 tokenAmount);
    event Refunded(address indexed account, uint256 stableAmount, uint256 tokenAmount);
    event FeesCollected(address indexed to, uint256 amount);

    // ----------------------------------------------------- immutable terms
    uint256 public constant BPS = 10_000;

    IERC20 public immutable stable;
    IERC20 public immutable underlying;
    IPriceOracle public immutable oracle;
    address public immutable feeRecipient;
    uint256 public immutable lotTokens;
    uint256 public immutable strike;
    uint256 public immutable couponPerLot;
    uint256 public immutable capLots;
    /// N per lot: lotTokens * strike / 10**underlyingDecimals.
    uint256 public immutable lotPrincipal;
    /// R per lot: observationCount * couponPerLot. Also the max protection cost.
    uint256 public immutable lotReserve;
    uint64 public immutable subscribeDeadline;
    uint32 public immutable observationWindow;
    uint32 public immutable observationCount;
    uint16 public immutable barrierBps;
    uint16 public immutable autocallBps;
    uint16 public immutable feeBps;

    uint64[] private _observationTimes;

    // ---------------------------------------------------------------- state
    Phase public phase;
    Closure public closure;

    uint256 public totalEarnLots;
    uint256 public totalProtectLots;
    uint256 public matchedLots;
    mapping(address => uint256) public earnLots;
    mapping(address => uint256) public protectLots;
    mapping(address => bool) public earnSettled;
    mapping(address => bool) public protectSettled;

    uint32 public nextObservation;
    uint32 public closedAtIndex;
    uint32 public couponsPaid;
    uint256[] public observedPrices;
    uint64[] public observedAt;

    uint256 public grossPaid;
    uint256 public couponsNet;
    uint256 public feeAccrued;
    uint256 public feeCollected;

    // Pools fixed at close, for the matched lots.
    uint256 public earnCash;
    uint256 public earnTokens;
    uint256 public protectCash;
    uint256 public protectTokens;

    // Custody accounting (what came in and what has gone out).
    uint256 public stableIn;
    uint256 public stableOut;
    uint256 public tokensIn;
    uint256 public tokensOut;
    uint256 private _stableOutAtActivation;
    uint256 private _tokensOutAtActivation;

    constructor(Terms memory t) {
        uint256 n = t.observationTimes.length;
        if (address(t.stable) == address(0) || address(t.underlying) == address(0)) {
            revert InvalidTerms("token is zero");
        }
        if (address(t.stable) == address(t.underlying)) revert InvalidTerms("same token");
        if (address(t.oracle) == address(0) || t.feeRecipient == address(0)) {
            revert InvalidTerms("oracle or fee recipient is zero");
        }
        if (t.lotTokens == 0 || t.strike == 0 || t.capLots == 0) revert InvalidTerms("zero size");
        if (t.barrierBps == 0 || t.barrierBps >= BPS) {
            revert InvalidTerms("barrier not in (0, 100%)");
        }
        if (t.autocallBps != 0 && t.autocallBps < BPS) revert InvalidTerms("autocall below 100%");
        if (t.feeBps > BPS) revert InvalidTerms("fee above 100%");
        if (n == 0 || n > type(uint32).max) revert InvalidTerms("observation count");
        if (t.observationWindow == 0) revert InvalidTerms("window is zero");
        if (t.subscribeDeadline <= block.timestamp) revert InvalidTerms("deadline in the past");
        if (t.observationTimes[0] <= t.subscribeDeadline) {
            revert InvalidTerms("first observation before lock");
        }
        for (uint256 i = 1; i < n; i++) {
            // A price must belong to exactly one observation window.
            if (t.observationTimes[i] <= uint256(t.observationTimes[i - 1]) + t.observationWindow) {
                revert InvalidTerms("observations overlap");
            }
        }

        uint256 unit = 10 ** uint256(IERC20Metadata(address(t.underlying)).decimals());
        if ((t.lotTokens * t.strike) % unit != 0) {
            revert InvalidTerms("lot notional is not whole stable units");
        }

        stable = t.stable;
        underlying = t.underlying;
        oracle = t.oracle;
        feeRecipient = t.feeRecipient;
        lotTokens = t.lotTokens;
        strike = t.strike;
        couponPerLot = t.couponPerLot;
        capLots = t.capLots;
        lotPrincipal = (t.lotTokens * t.strike) / unit;
        lotReserve = n * t.couponPerLot;
        subscribeDeadline = t.subscribeDeadline;
        observationWindow = t.observationWindow;
        observationCount = uint32(n);
        barrierBps = t.barrierBps;
        autocallBps = t.autocallBps;
        feeBps = t.feeBps;
        _observationTimes = t.observationTimes;

        if (lotPrincipal == 0) revert InvalidTerms("lot principal rounds to zero");
    }

    // ============================================================ subscribe

    /// @notice Deposit stable principal for `lots` lots as Earn.
    function subscribeEarn(uint256 lots) external nonReentrant {
        _requireSubscribing();
        if (lots == 0) revert ZeroLots();
        earnLots[msg.sender] += lots;
        totalEarnLots += lots;
        uint256 amount = lots * lotPrincipal;
        _pullStable(msg.sender, amount);
        emit Subscribed(msg.sender, Side.Earn, lots);
    }

    /// @notice Deposit `lots * lotTokens` underlying plus the premium reserve
    ///  `lots * observationCount * couponPerLot` in stable, as Protect.
    function subscribeProtect(uint256 lots) external nonReentrant {
        _requireSubscribing();
        if (lots == 0) revert ZeroLots();
        protectLots[msg.sender] += lots;
        totalProtectLots += lots;
        _pullStable(msg.sender, lots * lotReserve);
        _pullTokens(msg.sender, lots * lotTokens);
        emit Subscribed(msg.sender, Side.Protect, lots);
    }

    /// @notice Withdraw lots before the market is activated.
    function cancel(Side side, uint256 lots) external nonReentrant {
        if (phase != Phase.Subscription) revert WrongPhase(phase);
        if (lots == 0) revert ZeroLots();
        if (side == Side.Earn) {
            uint256 have = earnLots[msg.sender];
            if (lots > have) revert NotEnoughLots(have, lots);
            earnLots[msg.sender] = have - lots;
            totalEarnLots -= lots;
            _payStable(msg.sender, lots * lotPrincipal);
        } else {
            uint256 have = protectLots[msg.sender];
            if (lots > have) revert NotEnoughLots(have, lots);
            protectLots[msg.sender] = have - lots;
            totalProtectLots -= lots;
            _payStable(msg.sender, lots * lotReserve);
            _payTokens(msg.sender, lots * lotTokens);
        }
        emit Cancelled(msg.sender, side, lots);
    }

    /// @notice Lock the market after the subscription deadline. Matched lots
    ///  are min(Earn lots, Protect lots, cap); the excess is refundable via
    ///  `claim`. Nothing matched means the market is cancelled.
    function activate() external nonReentrant {
        if (phase != Phase.Subscription) revert WrongPhase(phase);
        if (block.timestamp < subscribeDeadline) revert SubscriptionStillOpen();

        uint256 m = totalEarnLots < totalProtectLots ? totalEarnLots : totalProtectLots;
        if (m > capLots) m = capLots;

        _stableOutAtActivation = stableOut;
        _tokensOutAtActivation = tokensOut;

        if (m == 0) {
            phase = Phase.Cancelled;
            emit MarketCancelled();
            return;
        }
        matchedLots = m;
        phase = Phase.Active;
        emit Activated(m);
    }

    // ============================================================ observe

    /// @notice Record the next observation from the oracle. Anyone may call.
    ///  The price must carry a timestamp inside this observation's window.
    function observe() external nonReentrant {
        if (phase != Phase.Active) revert WrongPhase(phase);
        uint32 i = nextObservation;
        if (i >= observationCount) revert NoObservationsLeft();
        uint64 due = _observationTimes[i];
        if (block.timestamp < due) revert ObservationNotDue(i, due);

        (uint256 price, uint256 updatedAt) = oracle.latest();
        // The interface promises a positive price. A zero would read as "below the
        // barrier" and could force a downside, so refuse it rather than trust it.
        if (price == 0) revert InvalidOraclePrice();
        uint64 until = due + observationWindow;
        if (updatedAt < due || updatedAt > until) {
            revert DataOutsideWindow(i, updatedAt, due, until);
        }
        _record(i, price, updatedAt);
    }

    /// @notice Unwind when an observation's window has closed with no valid
    ///  data. Reverts while valid data for it still sits in the oracle, so a
    ///  late `observe` always wins over a hostile unwind.
    function triggerUnwind() external nonReentrant {
        if (phase != Phase.Active) revert WrongPhase(phase);
        uint32 i = nextObservation;
        if (i >= observationCount) revert NoObservationsLeft();
        uint64 due = _observationTimes[i];
        uint64 until = due + observationWindow;
        if (block.timestamp <= until) revert WindowStillOpen(i, until);
        if (_hasValidData(due, until)) revert ValidDataAvailable(i);
        _close(Closure.Unwind, i);
    }

    function _hasValidData(uint64 from, uint64 to) private view returns (bool) {
        try oracle.latest() returns (uint256 price, uint256 updatedAt) {
            return price != 0 && updatedAt >= from && updatedAt <= to;
        } catch {
            return false;
        }
    }

    function _record(uint32 i, uint256 price, uint256 updatedAt) private {
        observedPrices.push(price);
        // updatedAt was checked against `until` (a uint64) in observe(), so this cannot truncate.
        // forge-lint: disable-next-line(unsafe-typecast)
        observedAt.push(uint64(updatedAt));
        nextObservation = i + 1;

        bool eligible = price * BPS >= strike * barrierBps;
        if (eligible) {
            uint256 gross = matchedLots * couponPerLot;
            uint256 fee = (gross * feeBps) / BPS;
            grossPaid += gross;
            feeAccrued += fee;
            couponsNet += gross - fee;
            couponsPaid += 1;
        }

        bool maturity = i == observationCount - 1;
        bool called = !maturity && autocallBps != 0 && price * BPS >= strike * autocallBps;
        emit Observed(i, price, updatedAt, eligible, called);

        if (called) {
            _close(Closure.Early, i);
        } else if (maturity) {
            _close(eligible ? Closure.Normal : Closure.Downside, i);
        }
    }

    function _close(Closure outcome, uint32 atIndex) private {
        uint256 matchedPrincipal = matchedLots * lotPrincipal;
        uint256 matchedTokens = matchedLots * lotTokens;
        uint256 reserveRemaining = matchedLots * lotReserve - grossPaid;
        bool downside = outcome == Closure.Downside;

        earnCash = (downside ? 0 : matchedPrincipal) + couponsNet;
        earnTokens = downside ? matchedTokens : 0;
        protectCash = (downside ? matchedPrincipal : 0) + reserveRemaining;
        protectTokens = downside ? 0 : matchedTokens;

        closure = outcome;
        closedAtIndex = atIndex;
        phase = Phase.Closed;
        emit Closed(outcome, atIndex);
    }

    // ============================================================== claims

    /// @notice Collect everything owed to the caller after the market closed:
    ///  the settlement for matched lots plus the refund of unmatched lots,
    ///  on both sides if the caller holds both.
    function claim() external nonReentrant returns (uint256 stableAmount, uint256 tokenAmount) {
        if (phase != Phase.Closed) revert WrongPhase(phase);
        (uint256 s1, uint256 t1) = _earnClaim(msg.sender);
        (uint256 s2, uint256 t2) = _protectClaim(msg.sender);
        stableAmount = s1 + s2;
        tokenAmount = t1 + t2;
        if (stableAmount == 0 && tokenAmount == 0) revert NothingToClaim();

        if (earnLots[msg.sender] != 0) earnSettled[msg.sender] = true;
        if (protectLots[msg.sender] != 0) protectSettled[msg.sender] = true;
        _payStable(msg.sender, stableAmount);
        _payTokens(msg.sender, tokenAmount);
        emit Claimed(msg.sender, stableAmount, tokenAmount);
    }

    /// @notice Full refund when nothing was matched.
    function refund() external nonReentrant returns (uint256 stableAmount, uint256 tokenAmount) {
        if (phase != Phase.Cancelled) revert WrongPhase(phase);
        uint256 e = earnSettled[msg.sender] ? 0 : earnLots[msg.sender];
        uint256 p = protectSettled[msg.sender] ? 0 : protectLots[msg.sender];
        stableAmount = e * lotPrincipal + p * lotReserve;
        tokenAmount = p * lotTokens;
        if (stableAmount == 0 && tokenAmount == 0) revert NothingToClaim();

        if (e != 0) earnSettled[msg.sender] = true;
        if (p != 0) protectSettled[msg.sender] = true;
        _payStable(msg.sender, stableAmount);
        _payTokens(msg.sender, tokenAmount);
        emit Refunded(msg.sender, stableAmount, tokenAmount);
    }

    /// @notice Send the accrued protocol fee to the fixed recipient. Anyone may call.
    function collectFees() external nonReentrant returns (uint256 amount) {
        if (phase != Phase.Closed) revert WrongPhase(phase);
        amount = feeAccrued - feeCollected;
        if (amount == 0) revert NothingToClaim();
        feeCollected = feeAccrued;
        _payStable(feeRecipient, amount);
        emit FeesCollected(feeRecipient, amount);
    }

    // ============================================================== views

    /// @notice What `account` can still take out (settlement + unmatched refund).
    function claimable(address account)
        external
        view
        returns (uint256 stableAmount, uint256 tokenAmount)
    {
        if (phase == Phase.Closed) {
            (uint256 s1, uint256 t1) = _earnClaim(account);
            (uint256 s2, uint256 t2) = _protectClaim(account);
            return (s1 + s2, t1 + t2);
        }
        if (phase == Phase.Cancelled) {
            uint256 e = earnSettled[account] ? 0 : earnLots[account];
            uint256 p = protectSettled[account] ? 0 : protectLots[account];
            return (e * lotPrincipal + p * lotReserve, p * lotTokens);
        }
        return (0, 0);
    }

    /// @notice What the market still owes, computed from its terms and state
    ///  rather than read from balances. The escrow balance must always cover it.
    function obligations() public view returns (uint256 stableOwed, uint256 tokensOwed) {
        if (phase == Phase.Closed) {
            uint256 unmatchedEarn = totalEarnLots - matchedLots;
            uint256 unmatchedProtect = totalProtectLots - matchedLots;
            uint256 stableTotal = earnCash + protectCash + feeAccrued + unmatchedEarn * lotPrincipal
                + unmatchedProtect * lotReserve;
            uint256 tokenTotal = earnTokens + protectTokens + unmatchedProtect * lotTokens;
            stableOwed = stableTotal - (stableOut - _stableOutAtActivation);
            tokensOwed = tokenTotal - (tokensOut - _tokensOutAtActivation);
        } else {
            // Subscription, Active and Cancelled: everything deposited is owed.
            stableOwed = stableIn - stableOut;
            tokensOwed = tokensIn - tokensOut;
        }
    }

    function observationTime(uint256 index) external view returns (uint64) {
        return _observationTimes[index];
    }

    function observationsRecorded() external view returns (uint256) {
        return observedPrices.length;
    }

    // ============================================================ internals

    function _requireSubscribing() private view {
        if (phase != Phase.Subscription) revert WrongPhase(phase);
        if (block.timestamp >= subscribeDeadline) revert SubscriptionClosed();
    }

    function _earnClaim(address account) private view returns (uint256 cash, uint256 tokens) {
        uint256 l = earnLots[account];
        if (l == 0 || earnSettled[account]) return (0, 0);
        cash = (earnCash * l) / totalEarnLots + (l * lotPrincipal * (totalEarnLots - matchedLots))
            / totalEarnLots;
        tokens = (earnTokens * l) / totalEarnLots;
    }

    function _protectClaim(address account) private view returns (uint256 cash, uint256 tokens) {
        uint256 l = protectLots[account];
        if (l == 0 || protectSettled[account]) return (0, 0);
        uint256 unmatched = totalProtectLots - matchedLots;
        cash =
            (protectCash * l) / totalProtectLots + (l * lotReserve * unmatched) / totalProtectLots;
        tokens =
            (protectTokens * l) / totalProtectLots + (l * lotTokens * unmatched) / totalProtectLots;
    }

    function _pullStable(address from, uint256 amount) private {
        stableIn += amount;
        stable.safeTransferFrom(from, address(this), amount);
    }

    function _pullTokens(address from, uint256 amount) private {
        tokensIn += amount;
        underlying.safeTransferFrom(from, address(this), amount);
    }

    function _payStable(address to, uint256 amount) private {
        if (amount == 0) return;
        stableOut += amount;
        stable.safeTransfer(to, amount);
    }

    function _payTokens(address to, uint256 amount) private {
        if (amount == 0) return;
        tokensOut += amount;
        underlying.safeTransfer(to, amount);
    }
}
