// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";
import {console2} from "forge-std/console2.sol";

import {MarketBase} from "./Base.t.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {Closure, Phase, Side} from "../src/Types.sol";

/// @dev Drives the escrow with arbitrary, bounded sequences of user and
///  keeper actions. Reverts are expected and swallowed: the invariants are
///  about what is true after ANY sequence, not about every call succeeding.
contract EscrowHandler is Test {
    MarketEscrow public immutable market;
    MockERC20 public immutable stable;
    MockERC20 public immutable token;
    MockOracle public immutable oracle;

    address[] public actors;

    // Ghosts: what we saw, to compare with what the contract now says.
    uint256[] public ghostPrices;
    uint8 public lastPhase;
    bool public phaseWentBackwards;
    uint256 public calls;

    // Coverage: how deep the random sequences actually get.
    uint256 public reachedActive;
    uint256 public reachedClosed;
    uint256 public reachedCancelled;
    uint256 public unwinds;
    uint256 public claimsSucceeded;
    uint256 public unmatchedClaims;

    constructor(MarketEscrow m, MockERC20 s, MockERC20 t, MockOracle o) {
        market = m;
        stable = s;
        token = t;
        oracle = o;
        for (uint256 i = 0; i < 4; i++) {
            address a = address(uint160(0xA000 + i));
            actors.push(a);
            s.mint(a, 1_000_000_000e6);
            t.mint(a, 1_000_000_000e6);
            vm.startPrank(a);
            s.approve(address(m), type(uint256).max);
            t.approve(address(m), type(uint256).max);
            vm.stopPrank();
        }
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function _note() internal {
        calls++;
        uint8 p = uint8(market.phase());
        if (p < lastPhase) phaseWentBackwards = true;
        if (p != lastPhase) {
            if (p == uint8(Phase.Active)) reachedActive++;
            if (p == uint8(Phase.Closed)) {
                reachedClosed++;
                if (market.closure() == Closure.Unwind) unwinds++;
                if (market.totalEarnLots() > market.matchedLots()) unmatchedClaims++;
            }
            if (p == uint8(Phase.Cancelled)) reachedCancelled++;
        }
        lastPhase = p;
        // Record any new observation exactly as the contract stored it.
        while (ghostPrices.length < market.observationsRecorded()) {
            ghostPrices.push(market.observedPrices(ghostPrices.length));
        }
    }

    function earn(uint256 actorSeed, uint256 lots) external {
        lots = bound(lots, 1, 25);
        vm.prank(_actor(actorSeed));
        try market.subscribeEarn(lots) {} catch {}
        _note();
    }

    function protect(uint256 actorSeed, uint256 lots) external {
        lots = bound(lots, 1, 25);
        vm.prank(_actor(actorSeed));
        try market.subscribeProtect(lots) {} catch {}
        _note();
    }

    function cancel(uint256 actorSeed, bool earnSide, uint256 lots) external {
        lots = bound(lots, 1, 25);
        vm.prank(_actor(actorSeed));
        try market.cancel(earnSide ? Side.Earn : Side.Protect, lots) {} catch {}
        _note();
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 9 days));
        _note();
    }

    function activate() external {
        // Jump to the deadline so activation is reachable in short sequences.
        if (block.timestamp < market.subscribeDeadline()) vm.warp(market.subscribeDeadline());
        try market.activate() {} catch {}
        _note();
    }

    /// @dev Publish a price and observe at the next due time.
    function observe(uint256 price) external {
        if (market.phase() == Phase.Active && market.nextObservation() < market.observationCount())
        {
            uint64 due = market.observationTime(market.nextObservation());
            if (block.timestamp < due) vm.warp(due);
            try oracle.submit(int256(bound(price, 1e6, 220e6)), block.timestamp) {} catch {}
            try market.observe() {} catch {}
        }
        _note();
    }

    /// @dev Also try to observe twice and out of turn: it must never record.
    function observeAgain() external {
        try market.observe() {} catch {}
        _note();
    }

    function unwind() external {
        if (market.phase() == Phase.Active && market.nextObservation() < market.observationCount())
        {
            uint256 until = uint256(market.observationTime(market.nextObservation()))
                + market.observationWindow();
            if (block.timestamp <= until) vm.warp(until + 1);
        }
        try market.triggerUnwind() {} catch {}
        _note();
    }

    function claim(uint256 actorSeed) external {
        vm.prank(_actor(actorSeed));
        try market.claim() {
            claimsSucceeded++;
        } catch {}
        _note();
    }

    function refund(uint256 actorSeed) external {
        vm.prank(_actor(actorSeed));
        try market.refund() {} catch {}
        _note();
    }

    function collect() external {
        try market.collectFees() {} catch {}
        _note();
    }

    /// @dev Push the lifecycle one step forward from wherever it is, so the
    ///  random sequences regularly reach Closed, claims and unmatched refunds
    ///  instead of idling in the subscription phase.
    function progress(uint256 seed) external {
        Phase p = market.phase();
        if (p == Phase.Subscription) {
            // Make sure there is something on both sides to match.
            if (market.totalEarnLots() == 0) {
                vm.prank(_actor(seed));
                try market.subscribeEarn(1 + (seed % 12)) {} catch {}
            }
            if (market.totalProtectLots() == 0) {
                vm.prank(_actor(seed + 1));
                try market.subscribeProtect(1 + ((seed / 7) % 12)) {} catch {}
            }
            if (block.timestamp < market.subscribeDeadline()) vm.warp(market.subscribeDeadline());
            try market.activate() {} catch {}
        } else if (p == Phase.Active) {
            if (seed % 9 == 0) {
                uint256 until = uint256(market.observationTime(market.nextObservation()))
                    + market.observationWindow();
                if (block.timestamp <= until) vm.warp(until + 1);
                try market.triggerUnwind() {} catch {}
            } else {
                uint64 due = market.observationTime(market.nextObservation());
                if (block.timestamp < due) vm.warp(due);
                uint256 px = 20e6 + (uint256(keccak256(abi.encode(seed))) % 160e6);
                try oracle.submit(int256(px), block.timestamp) {} catch {}
                try market.observe() {} catch {}
            }
        } else {
            for (uint256 i = 0; i < actors.length; i++) {
                vm.startPrank(actors[i]);
                if (p == Phase.Closed) {
                    try market.claim() {
                        claimsSucceeded++;
                    } catch {}
                } else {
                    try market.refund() {} catch {}
                }
                vm.stopPrank();
            }
            if (p == Phase.Closed) {
                try market.collectFees() {} catch {}
            }
        }
        _note();
    }

    function ghostLength() external view returns (uint256) {
        return ghostPrices.length;
    }
}

contract MarketEscrowInvariantTest is StdInvariant, MarketBase {
    MarketEscrow internal m;
    EscrowHandler internal handler;

    uint256 internal strike0;
    uint16 internal barrier0;
    uint16 internal autocall0;
    uint16 internal fee0;
    uint256 internal principal0;
    uint256 internal reserve0;
    uint64 internal firstObs0;

    function setUp() public {
        Shape memory s = _reference();
        s.capLots = 40; // low enough that matching and refunds both occur
        s.lotTokens = 7e6; // awkward amounts so rounding is exercised
        s.couponPerLot = 3_333_333;
        m = _deploy(s);

        strike0 = m.strike();
        barrier0 = m.barrierBps();
        autocall0 = m.autocallBps();
        fee0 = m.feeBps();
        principal0 = m.lotPrincipal();
        reserve0 = m.lotReserve();
        firstObs0 = m.observationTime(0);

        handler = new EscrowHandler(m, stable, token, oracle);
        targetContract(address(handler));
    }

    /// The escrow balance always covers everything it can still owe.
    function invariant_escrowAlwaysCoversItsObligations() public view {
        (uint256 owedStable, uint256 owedTokens) = m.obligations();
        assertGe(stable.balanceOf(address(m)), owedStable, "stable under-covered");
        assertGe(token.balanceOf(address(m)), owedTokens, "tokens under-covered");
    }

    /// Money out never exceeds money in.
    function invariant_nothingLeavesThatWasNotDeposited() public view {
        assertLe(m.stableOut(), m.stableIn());
        assertLe(m.tokensOut(), m.tokensIn());
    }

    /// One observation, once, in order: the counters can only move together.
    function invariant_observationsAreSequentialAndBounded() public view {
        assertEq(m.nextObservation(), m.observationsRecorded());
        assertLe(m.nextObservation(), m.observationCount());
        assertLe(m.couponsPaid(), m.nextObservation());
    }

    /// Recorded prices never change after they are written.
    function invariant_observationHistoryIsAppendOnly() public view {
        uint256 n = handler.ghostLength();
        assertLe(n, m.observationsRecorded());
        for (uint256 i = 0; i < n; i++) {
            assertEq(m.observedPrices(i), handler.ghostPrices(i), "history rewritten");
        }
    }

    /// Strike, barrier, fee, principal and schedule are fixed for life.
    function invariant_termsNeverChange() public view {
        assertEq(m.strike(), strike0);
        assertEq(m.barrierBps(), barrier0);
        assertEq(m.autocallBps(), autocall0);
        assertEq(m.feeBps(), fee0);
        assertEq(m.lotPrincipal(), principal0);
        assertEq(m.lotReserve(), reserve0);
        assertEq(m.observationTime(0), firstObs0);
    }

    /// The lifecycle only moves forward, and a closure exists only when Closed.
    function invariant_lifecycleOnlyMovesForward() public view {
        assertFalse(handler.phaseWentBackwards(), "phase went backwards");
        assertEq(m.closure() != Closure.None, m.phase() == Phase.Closed);
    }

    /// Matching never exceeds either side or the cap.
    function invariant_matchedLotsAreBounded() public view {
        if (m.phase() == Phase.Active || m.phase() == Phase.Closed) {
            assertLe(m.matchedLots(), m.totalEarnLots());
            assertLe(m.matchedLots(), m.totalProtectLots());
            assertLe(m.matchedLots(), m.capLots());
            assertGt(m.matchedLots(), 0);
        }
    }

    /// Fees are only ever paid to the recipient fixed at deployment.
    function invariant_feesGoOnlyToTheFixedRecipient() public view {
        assertEq(stable.balanceOf(feeTo), m.feeCollected());
        assertLe(m.feeCollected(), m.feeAccrued());
    }

    /// Printed with -vv: proves the random sequences reach the interesting states.
    function afterInvariant() public view {
        console2.log("calls", handler.calls());
        console2.log("reached Active", handler.reachedActive());
        console2.log("reached Closed", handler.reachedClosed());
        console2.log("reached Cancelled", handler.reachedCancelled());
        console2.log("unwinds", handler.unwinds());
        console2.log("claims ok", handler.claimsSucceeded());
        console2.log("closed with unmatched Earn lots", handler.unmatchedClaims());
    }
}
