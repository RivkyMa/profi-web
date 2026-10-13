// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {MarketEscrow} from "./MarketEscrow.sol";
import {MarketFactory} from "./MarketFactory.sol";
import {Phase} from "./Types.sol";

/// @title EpochVault
/// @notice Spreads stable deposits across approved Earn markets, one epoch at
///  a time. Shares are per epoch, 1:1 with the stable deposited, and are NOT
///  transferable (a mapping, not a token). When the markets resolve, stable and
///  any downside tokens are shared pro rata, in kind.
///
/// @dev The manager picks the markets and weights when an epoch is created and
///  nothing afterwards: it cannot move funds, cannot change an epoch, and
///  allocations may only point at markets the factory deployed. Funds leave the
///  vault only into those markets (at lock) or back to depositors.
contract EpochVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotManager();
    error InvalidEpoch(uint256 id);
    error WrongState(EpochState actual);
    error BadAllocation(string reason);
    error NotAFactoryMarket(address market);
    error DepositWindowClosed();
    error DepositWindowOpen();
    error LockWindowMissed();
    error LockWindowOpen();
    error CapExceeded();
    error ZeroAmount();
    error InsufficientShares(uint256 have, uint256 want);
    error MarketNotResolved(address market);

    enum EpochState {
        Open, // deposits and withdrawals
        Locked, // subscribed to markets, waiting for them to resolve
        Settled, // redemptions open
        Aborted // never locked in time: withdraw your deposit
    }

    struct Allocation {
        MarketEscrow market;
        uint16 weightBps;
        uint256 lots; // lots actually subscribed at lock (0 if it failed)
    }

    struct Epoch {
        uint64 depositCloses;
        uint64 lockBy; // earliest subscription deadline among the markets
        uint16 cashBufferBps;
        EpochState state;
        uint256 cap;
        uint256 deposited; // total stable deposited == total shares
        uint256 spent; // stable sent into markets at lock
        uint256 settledStable; // stable available to redeem once Settled
    }

    event EpochCreated(uint256 indexed id, uint64 depositCloses, uint16 cashBufferBps, uint256 cap);
    event Deposited(uint256 indexed id, address indexed account, uint256 amount);
    event Withdrawn(uint256 indexed id, address indexed account, uint256 amount);
    event Locked(uint256 indexed id, uint256 spent);
    event Aborted(uint256 indexed id);
    event Settled(uint256 indexed id, uint256 settledStable);
    event Redeemed(uint256 indexed id, address indexed account, uint256 stableAmount);

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_MARKETS = 8;

    IERC20 public immutable stable;
    MarketFactory public immutable factory;
    address public immutable manager;

    Epoch[] private _epochs;
    mapping(uint256 id => Allocation[]) private _allocations;
    mapping(uint256 id => address[]) private _tokens;
    mapping(uint256 id => mapping(address token => uint256)) public tokenAmount;
    mapping(uint256 id => mapping(address account => uint256)) public shares;

    constructor(IERC20 stable_, MarketFactory factory_, address manager_) {
        stable = stable_;
        factory = factory_;
        manager = manager_;
    }

    // ============================================================== manager

    function createEpoch(
        uint64 depositCloses,
        MarketEscrow[] calldata markets,
        uint16[] calldata weightsBps,
        uint16 cashBufferBps,
        uint256 cap
    ) external returns (uint256 id) {
        if (msg.sender != manager) revert NotManager();
        if (depositCloses <= block.timestamp) revert BadAllocation("deposit window in the past");
        if (markets.length == 0 || markets.length > MAX_MARKETS) {
            revert BadAllocation("market count");
        }
        if (markets.length != weightsBps.length) revert BadAllocation("length mismatch");
        if (cap == 0) revert BadAllocation("cap");

        uint256 weightSum = cashBufferBps;
        uint64 lockBy = type(uint64).max;
        id = _epochs.length;

        for (uint256 i = 0; i < markets.length; i++) {
            MarketEscrow m = markets[i];
            if (!factory.isMarket(address(m))) revert NotAFactoryMarket(address(m));
            if (address(m.stable()) != address(stable)) revert BadAllocation("stable mismatch");
            if (m.phase() != Phase.Subscription) revert BadAllocation("market not subscribing");
            if (depositCloses >= m.subscribeDeadline()) {
                revert BadAllocation("window after market lock");
            }
            if (m.subscribeDeadline() < lockBy) lockBy = m.subscribeDeadline();
            weightSum += weightsBps[i];
            _allocations[id].push(Allocation({market: m, weightBps: weightsBps[i], lots: 0}));
        }
        if (weightSum != BPS) revert BadAllocation("weights and buffer must sum to 100%");

        _epochs.push(
            Epoch({
                depositCloses: depositCloses,
                lockBy: lockBy,
                cashBufferBps: cashBufferBps,
                state: EpochState.Open,
                cap: cap,
                deposited: 0,
                spent: 0,
                settledStable: 0
            })
        );
        emit EpochCreated(id, depositCloses, cashBufferBps, cap);
    }

    // ============================================================ depositors

    function deposit(uint256 id, uint256 amount) external nonReentrant {
        Epoch storage e = _epoch(id);
        if (e.state != EpochState.Open) revert WrongState(e.state);
        if (block.timestamp >= e.depositCloses) revert DepositWindowClosed();
        if (amount == 0) revert ZeroAmount();
        if (e.deposited + amount > e.cap) revert CapExceeded();

        e.deposited += amount;
        shares[id][msg.sender] += amount;
        stable.safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(id, msg.sender, amount);
    }

    /// @notice Take a deposit back while the epoch is Open (even after the
    ///  window closed, until it is locked) or after it was Aborted.
    function withdraw(uint256 id, uint256 amount) external nonReentrant {
        Epoch storage e = _epoch(id);
        if (e.state != EpochState.Open && e.state != EpochState.Aborted) {
            revert WrongState(e.state);
        }
        if (amount == 0) revert ZeroAmount();
        uint256 have = shares[id][msg.sender];
        if (amount > have) revert InsufficientShares(have, amount);

        shares[id][msg.sender] = have - amount;
        e.deposited -= amount;
        stable.safeTransfer(msg.sender, amount);
        emit Withdrawn(id, msg.sender, amount);
    }

    /// @notice Subscribe the epoch to its markets once deposits have closed.
    ///  A market that refuses (full, closed) leaves its share as cash.
    function lock(uint256 id) external nonReentrant {
        Epoch storage e = _epoch(id);
        if (e.state != EpochState.Open) revert WrongState(e.state);
        if (block.timestamp < e.depositCloses) revert DepositWindowOpen();
        if (block.timestamp >= e.lockBy) revert LockWindowMissed();

        Allocation[] storage allocs = _allocations[id];
        uint256 spent;
        for (uint256 i = 0; i < allocs.length; i++) {
            Allocation storage a = allocs[i];
            uint256 principal = a.market.lotPrincipal();
            uint256 lots = ((e.deposited * a.weightBps) / BPS) / principal;
            if (lots == 0) continue;

            stable.forceApprove(address(a.market), lots * principal);
            try a.market.subscribeEarn(lots) {
                a.lots = lots;
                spent += lots * principal;
            } catch {
                stable.forceApprove(address(a.market), 0);
            }
        }
        e.spent = spent;
        e.state = EpochState.Locked;
        emit Locked(id, spent);
    }

    /// @notice Give up on an epoch that was never locked before its markets did.
    function abort(uint256 id) external {
        Epoch storage e = _epoch(id);
        if (e.state != EpochState.Open) revert WrongState(e.state);
        if (block.timestamp < e.lockBy) revert LockWindowOpen();
        e.state = EpochState.Aborted;
        emit Aborted(id);
    }

    /// @notice Pull the proceeds of every market once all of them resolved.
    function settle(uint256 id) external nonReentrant {
        Epoch storage e = _epoch(id);
        if (e.state != EpochState.Locked) revert WrongState(e.state);

        Allocation[] storage allocs = _allocations[id];
        for (uint256 i = 0; i < allocs.length; i++) {
            if (allocs[i].lots == 0) continue;
            Phase p = allocs[i].market.phase();
            if (p != Phase.Closed && p != Phase.Cancelled) {
                // forge-lint: disable-next-line(require-revert-in-loop)
                revert MarketNotResolved(address(allocs[i].market));
            }
        }

        uint256 received;
        for (uint256 i = 0; i < allocs.length; i++) {
            Allocation storage a = allocs[i];
            if (a.lots == 0) continue;

            (uint256 gotStable, uint256 gotTokens) =
                a.market.phase() == Phase.Closed ? a.market.claim() : a.market.refund();
            received += gotStable;
            if (gotTokens > 0) _addToken(id, address(a.market.underlying()), gotTokens);
        }

        e.settledStable = (e.deposited - e.spent) + received;
        e.state = EpochState.Settled;
        emit Settled(id, e.settledStable);
    }

    /// @notice Redeem all of the caller's shares in kind: stable plus a pro
    ///  rata slice of every downside token the epoch ended up holding.
    function redeem(uint256 id) external nonReentrant returns (uint256 stableAmount) {
        Epoch storage e = _epoch(id);
        if (e.state != EpochState.Settled) revert WrongState(e.state);
        uint256 s = shares[id][msg.sender];
        if (s == 0) revert ZeroAmount();

        shares[id][msg.sender] = 0;
        uint256 total = e.deposited;

        stableAmount = (e.settledStable * s) / total;
        if (stableAmount > 0) stable.safeTransfer(msg.sender, stableAmount);

        address[] storage tokens = _tokens[id];
        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 amount = (tokenAmount[id][tokens[i]] * s) / total;
            if (amount > 0) IERC20(tokens[i]).safeTransfer(msg.sender, amount);
        }
        emit Redeemed(id, msg.sender, stableAmount);
    }

    // =============================================================== views

    function epochCount() external view returns (uint256) {
        return _epochs.length;
    }

    function epoch(uint256 id) external view returns (Epoch memory) {
        return _epoch(id);
    }

    function allocations(uint256 id) external view returns (Allocation[] memory) {
        _epoch(id);
        return _allocations[id];
    }

    function epochTokens(uint256 id) external view returns (address[] memory) {
        return _tokens[id];
    }

    // ============================================================ internals

    function _epoch(uint256 id) private view returns (Epoch storage) {
        if (id >= _epochs.length) revert InvalidEpoch(id);
        return _epochs[id];
    }

    function _addToken(uint256 id, address token, uint256 amount) private {
        if (tokenAmount[id][token] == 0) _tokens[id].push(token);
        tokenAmount[id][token] += amount;
    }
}
