// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketBase} from "./Base.t.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {IPriceOracle} from "../src/interfaces/IPriceOracle.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {Closure, Phase, Side, Terms} from "../src/Types.sol";

contract MarketEscrowTest is MarketBase {
    MarketEscrow internal m;

    function setUp() public {
        m = _deploy(_reference());
    }

    // ------------------------------------------------------------ terms

    function test_derivedPerLotAmounts() public view {
        // 100 tokens at 100 = 10,000 principal; reserve = 4 observations x 50.
        assertEq(m.lotPrincipal(), 10_000e6);
        assertEq(m.lotReserve(), 200e6);
        assertEq(m.observationCount(), 4);
        assertEq(m.observationsRecorded(), 0);
        assertEq(uint256(m.phase()), uint256(Phase.Subscription));
        assertEq(uint256(m.closure()), uint256(Closure.None));
    }

    function test_constructorRejectsBadTerms() public {
        Terms memory t = _terms(_reference());

        t.barrierBps = 0;
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.InvalidTerms.selector, "barrier not in (0, 100%)")
        );
        new MarketEscrow(t);

        t = _terms(_reference());
        t.barrierBps = 10_000;
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.InvalidTerms.selector, "barrier not in (0, 100%)")
        );
        new MarketEscrow(t);

        t = _terms(_reference());
        t.autocallBps = 9_999;
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.InvalidTerms.selector, "autocall below 100%")
        );
        new MarketEscrow(t);

        t = _terms(_reference());
        t.feeBps = 10_001;
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.InvalidTerms.selector, "fee above 100%")
        );
        new MarketEscrow(t);

        t = _terms(_reference());
        t.observationTimes[1] = t.observationTimes[0] + 1; // inside the first window
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.InvalidTerms.selector, "observations overlap")
        );
        new MarketEscrow(t);

        t = _terms(_reference());
        t.observationTimes[0] = t.subscribeDeadline;
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketEscrow.InvalidTerms.selector, "first observation before lock"
            )
        );
        new MarketEscrow(t);

        t = _terms(_reference());
        t.strike = 100e6 + 1; // 100 tokens x (100e6 + 1) is not a whole number of stable units
        t.lotTokens = 1; // 1 base unit of token at that strike rounds to a fraction
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketEscrow.InvalidTerms.selector, "lot notional is not whole stable units"
            )
        );
        new MarketEscrow(t);
    }

    // -------------------------------------------------------- subscribe

    function test_subscribeMovesExactCollateral() public {
        _earn(m, earner, 3);
        assertEq(stable.balanceOf(address(m)), 3 * 10_000e6);
        assertEq(m.earnLots(earner), 3);
        assertEq(m.totalEarnLots(), 3);

        _protect(m, protector, 2);
        // 2 lots: 200 tokens and a reserve of 2 x 200 stable.
        assertEq(token.balanceOf(address(m)), 200e6);
        assertEq(stable.balanceOf(address(m)), 3 * 10_000e6 + 2 * 200e6);
        assertEq(m.protectLots(protector), 2);
    }

    function test_subscribeRejectsZeroLotsAndLateDeposits() public {
        _fund(earner, 10_000e6, 0, m);
        vm.prank(earner);
        vm.expectRevert(MarketEscrow.ZeroLots.selector);
        m.subscribeEarn(0);

        vm.warp(m.subscribeDeadline());
        vm.prank(earner);
        vm.expectRevert(MarketEscrow.SubscriptionClosed.selector);
        m.subscribeEarn(1);
    }

    function test_cancelReturnsCollateralBeforeActivation() public {
        _earn(m, earner, 2);
        _protect(m, protector, 2);

        vm.prank(earner);
        m.cancel(Side.Earn, 1);
        assertEq(stable.balanceOf(earner), 10_000e6);
        assertEq(m.totalEarnLots(), 1);

        vm.prank(protector);
        m.cancel(Side.Protect, 2);
        assertEq(stable.balanceOf(protector), 2 * 200e6);
        assertEq(token.balanceOf(protector), 200e6);
        assertEq(m.totalProtectLots(), 0);

        (uint256 owedStable, uint256 owedTokens) = m.obligations();
        assertEq(owedStable, stable.balanceOf(address(m)));
        assertEq(owedTokens, token.balanceOf(address(m)));
    }

    function test_cancelCannotExceedTheCallersLots() public {
        _earn(m, earner, 1);
        vm.prank(earner);
        vm.expectRevert(abi.encodeWithSelector(MarketEscrow.NotEnoughLots.selector, 1, 2));
        m.cancel(Side.Earn, 2);
    }

    function test_cancelIsClosedOnceActive() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        vm.prank(earner);
        vm.expectRevert(abi.encodeWithSelector(MarketEscrow.WrongPhase.selector, Phase.Active));
        m.cancel(Side.Earn, 1);
    }

    // --------------------------------------------------------- activate

    function test_activateNeedsTheDeadline() public {
        vm.expectRevert(MarketEscrow.SubscriptionStillOpen.selector);
        m.activate();
    }

    function test_matchedLotsAreTheMinimumOfBothSidesAndTheCap() public {
        Shape memory s = _reference();
        s.capLots = 4;
        m = _deploy(s);
        _earn(m, earner, 6);
        _protect(m, protector, 5);
        _activate(m);
        assertEq(m.matchedLots(), 4); // min(6, 5, cap 4)
    }

    function test_nothingMatchedCancelsTheMarketAndRefundsInFull() public {
        _earn(m, earner, 2); // nobody on the Protect side
        _activate(m);
        assertEq(uint256(m.phase()), uint256(Phase.Cancelled));

        vm.prank(earner);
        (uint256 s,) = m.refund();
        assertEq(s, 2 * 10_000e6);
        assertEq(stable.balanceOf(earner), 2 * 10_000e6);

        vm.prank(earner);
        vm.expectRevert(MarketEscrow.NothingToClaim.selector);
        m.refund();
    }

    function test_unmatchedLotsAreRefundedWithTheSettlement() public {
        // Earn 5 lots (e1 3, e2 2), Protect 3 lots: 3 matched, 2 Earn lots left over.
        address e2 = makeAddr("e2");
        _earn(m, earner, 3);
        _earn(m, e2, 2);
        _protect(m, protector, 3);
        _activate(m);
        assertEq(m.matchedLots(), 3);

        // Strong market, held to maturity: Earn gets principal back plus coupons.
        _observe(m, 0, 94e6);
        _observe(m, 1, 78e6);
        _observe(m, 2, 70e6);
        _observe(m, 3, 80e6);
        assertEq(uint256(m.closure()), uint256(Closure.Normal));

        vm.prank(earner);
        (uint256 s1,) = m.claim();
        vm.prank(e2);
        (uint256 s2,) = m.claim();
        // Pool for 3 lots: 3 x 10,000 + net coupons 3 x 190; plus 2 lots unmatched.
        uint256 pool = 3 * 10_000e6 + 3 * 190e6;
        uint256 unmatched = 2 * 10_000e6;
        assertEq(s1, (pool * 3) / 5 + (3 * 10_000e6 * 2) / 5);
        assertEq(s2, (pool * 2) / 5 + (2 * 10_000e6 * 2) / 5);
        assertApproxEqAbs(s1 + s2, pool + unmatched, 5); // floors only, never more
        assertLe(s1 + s2, pool + unmatched);
    }

    // ----------------------------------------------------------- observe

    function test_observeNeedsAnActiveMarketAndTheDueTime() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);

        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.WrongPhase.selector, Phase.Subscription)
        );
        m.observe();

        _activate(m);
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.ObservationNotDue.selector, 0, m.observationTime(0))
        );
        m.observe();
    }

    function test_observationsAreSequentialAndOnlyOnce() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        _observe(m, 0, 94e6);
        assertEq(m.nextObservation(), 1);
        assertEq(m.observedPrices(0), 94e6);

        // Immediately again: observation 1 is not due, and 0 can never repeat.
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.ObservationNotDue.selector, 1, m.observationTime(1))
        );
        m.observe();

        // Observation 1 cannot reuse the price that belongs to window 0.
        vm.warp(m.observationTime(1));
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketEscrow.DataOutsideWindow.selector,
                1,
                m.observationTime(0),
                m.observationTime(1),
                uint64(m.observationTime(1)) + WINDOW
            )
        );
        m.observe();
    }

    function test_dataBeforeTheObservationTimeIsRejected() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        uint64 due = m.observationTime(0);
        vm.warp(due - 1);
        oracle.submit(94e6, block.timestamp); // stamped before the due time
        vm.warp(due);
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketEscrow.DataOutsideWindow.selector, 0, due - 1, due, uint64(due) + WINDOW
            )
        );
        m.observe();
    }

    function test_dataAfterTheWindowIsRejected() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        uint64 due = m.observationTime(0);
        vm.warp(uint256(due) + WINDOW + 1);
        oracle.submit(94e6, block.timestamp);
        vm.expectRevert(
            abi.encodeWithSelector(
                MarketEscrow.DataOutsideWindow.selector,
                0,
                block.timestamp,
                due,
                uint64(due) + WINDOW
            )
        );
        m.observe();
    }

    function test_aLateObserveStillWinsWhileTheDataIsInTheWindow() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        uint64 due = m.observationTime(0);
        vm.warp(uint256(due) + 100);
        oracle.submit(94e6, block.timestamp); // inside the window
        // Window closes without anyone observing; the data is still there.
        vm.warp(uint256(due) + WINDOW + 10);
        vm.expectRevert(abi.encodeWithSelector(MarketEscrow.ValidDataAvailable.selector, 0));
        m.triggerUnwind();

        m.observe();
        assertEq(m.nextObservation(), 1);
    }

    // ------------------------------------------------------------ unwind

    function test_unwindWaitsForTheWindowToClose() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        uint64 due = m.observationTime(0);
        vm.warp(uint256(due) + WINDOW);
        vm.expectRevert(
            abi.encodeWithSelector(MarketEscrow.WindowStillOpen.selector, 0, uint64(due) + WINDOW)
        );
        m.triggerUnwind();

        vm.warp(uint256(due) + WINDOW + 1);
        m.triggerUnwind();
        assertEq(uint256(m.closure()), uint256(Closure.Unwind));
        assertEq(m.closedAtIndex(), 0);
    }

    function test_unwindReturnsPrincipalTokensAndFullReserve() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        _missAndUnwind(m, 0);

        vm.prank(earner);
        (uint256 es, uint256 et) = m.claim();
        assertEq(es, 10_000e6);
        assertEq(et, 0);

        vm.prank(protector);
        (uint256 ps, uint256 pt) = m.claim();
        assertEq(ps, 200e6);
        assertEq(pt, 100e6);
    }

    function test_unwindKeepsCouponsAlreadyPaid() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        _observe(m, 0, 94e6);
        _observe(m, 1, 78e6);
        _missAndUnwind(m, 2);

        vm.prank(earner);
        (uint256 es,) = m.claim();
        assertEq(es, 10_000e6 + 95e6); // two net coupons stay with Earn

        vm.prank(protector);
        (uint256 ps, uint256 pt) = m.claim();
        assertEq(ps, 100e6); // 200 reserve minus 2 x 50 gross paid
        assertEq(pt, 100e6);
    }

    // ------------------------------------------------------------ claims

    function test_claimBeforeCloseAndTwiceIsRefused() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        vm.prank(earner);
        vm.expectRevert(abi.encodeWithSelector(MarketEscrow.WrongPhase.selector, Phase.Active));
        m.claim();

        _observe(m, 0, 103e6); // autocall: closes at the first intermediate observation
        assertEq(uint256(m.closure()), uint256(Closure.Early));

        vm.prank(earner);
        m.claim();
        vm.prank(earner);
        vm.expectRevert(MarketEscrow.NothingToClaim.selector);
        m.claim();
    }

    function test_strangerHasNothingToClaim() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        _observe(m, 0, 103e6);
        vm.prank(stranger);
        vm.expectRevert(MarketEscrow.NothingToClaim.selector);
        m.claim();
    }

    function test_claimableViewMatchesWhatIsPaid() public {
        _earn(m, earner, 2);
        _protect(m, protector, 2);
        _activate(m);
        _observe(m, 0, 94e6);
        _observe(m, 1, 78e6);
        _observe(m, 2, 60e6);
        _observe(m, 3, 54e6); // downside

        (uint256 vs, uint256 vt) = m.claimable(earner);
        vm.prank(earner);
        (uint256 s, uint256 t) = m.claim();
        assertEq(s, vs);
        assertEq(t, vt);
        assertEq(t, 200e6); // Earn takes the tokens
        (uint256 after_,) = m.claimable(earner);
        assertEq(after_, 0);
    }

    function test_feesAreCollectedOnceAtTheFixedRecipient() public {
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        _observe(m, 0, 94e6);
        _observe(m, 1, 78e6);
        _observe(m, 2, 70e6);
        _observe(m, 3, 80e6);

        // 4 coupons x floor(50 x 5%) = 4 x 2.5.
        assertEq(m.feeAccrued(), 10e6);
        vm.prank(stranger); // permissionless; the money still goes to feeTo
        uint256 paid = m.collectFees();
        assertEq(paid, 10e6);
        assertEq(stable.balanceOf(feeTo), 10e6);
        assertEq(stable.balanceOf(stranger), 0);

        vm.expectRevert(MarketEscrow.NothingToClaim.selector);
        m.collectFees();
    }

    // --------------------------------------------------- trust properties

    function test_noAdminSurface() public {
        // None of these selectors exist: there is no owner and no upgrade path.
        string[6] memory sigs = [
            "owner()",
            "transferOwnership(address)",
            "upgradeTo(address)",
            "setStrike(uint256)",
            "setOracle(address)",
            "withdraw(address,uint256)"
        ];
        for (uint256 i = 0; i < sigs.length; i++) {
            (bool ok,) = address(m).call(abi.encodeWithSignature(sigs[i]));
            // A missing selector reverts; the contract has no fallback.
            assertFalse(ok, sigs[i]);
        }
    }

    function test_termsAreUnchangedByTheWholeLifecycle() public {
        uint256 strike = m.strike();
        uint16 barrier = m.barrierBps();
        uint16 autocall = m.autocallBps();
        uint256 lotPrincipal = m.lotPrincipal();
        uint64 t0 = m.observationTime(0);

        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        _observe(m, 0, 94e6);
        _observe(m, 1, 78e6);
        _observe(m, 2, 70e6);
        _observe(m, 3, 80e6);
        vm.prank(earner);
        m.claim();

        assertEq(m.strike(), strike);
        assertEq(m.barrierBps(), barrier);
        assertEq(m.autocallBps(), autocall);
        assertEq(m.lotPrincipal(), lotPrincipal);
        assertEq(m.observationTime(0), t0);
        assertEq(m.observedPrices(0), 94e6); // history is append-only
    }

    function test_escrowAlwaysCoversItsObligations() public {
        _earn(m, earner, 2);
        _protect(m, protector, 3);
        _activate(m);
        _assertCovered();
        _observe(m, 0, 94e6);
        _assertCovered();
        _observe(m, 1, 60e6);
        _assertCovered();
        _observe(m, 2, 70e6);
        _observe(m, 3, 50e6);
        _assertCovered();
        vm.prank(earner);
        m.claim();
        _assertCovered();
        vm.prank(protector);
        m.claim();
        m.collectFees();
        _assertCovered();
    }

    function _assertCovered() internal view {
        (uint256 owedStable, uint256 owedTokens) = m.obligations();
        assertGe(stable.balanceOf(address(m)), owedStable, "stable under-covered");
        assertGe(token.balanceOf(address(m)), owedTokens, "tokens under-covered");
    }
}

/// @dev A misbehaving feed that breaks the interface promise (price > 0).
contract ZeroPriceOracle {
    function latest() external view returns (uint256, uint256) {
        return (0, block.timestamp);
    }
}

contract MarketEscrowBadOracleTest is MarketBase {
    function test_aZeroPriceIsNeverTreatedAsBelowTheBarrier() public {
        _newTokens();
        Terms memory t = _terms(_reference());
        t.oracle = IPriceOracle(address(new ZeroPriceOracle()));
        MarketEscrow m = new MarketEscrow(t);

        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        vm.warp(m.observationTime(0));
        vm.expectRevert(MarketEscrow.InvalidOraclePrice.selector);
        m.observe();
        assertEq(m.nextObservation(), 0);

        // A zero price is not valid data, so once the window has passed
        // the market unwinds safely.
        vm.warp(uint256(m.observationTime(0)) + m.observationWindow() + 1);
        m.triggerUnwind();
        assertEq(uint256(m.closure()), uint256(Closure.Unwind));
    }
}

contract MockOracleTest is MarketBase {
    function setUp() public {
        _newTokens();
        vm.warp(1_000_000);
        oracle = new MockOracle(1 days);
    }

    function test_acceptsAFreshPositivePrice() public {
        oracle.submit(94e6, block.timestamp);
        (uint256 p, uint256 t) = oracle.latest();
        assertEq(p, 94e6);
        assertEq(t, block.timestamp);
    }

    function test_rejectsZeroAndNegativePrices() public {
        vm.expectRevert(abi.encodeWithSelector(MockOracle.InvalidPrice.selector, int256(0)));
        oracle.submit(0, block.timestamp);
        vm.expectRevert(abi.encodeWithSelector(MockOracle.InvalidPrice.selector, int256(-5)));
        oracle.submit(-5, block.timestamp);
    }

    function test_rejectsATimestampInTheFuture() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                MockOracle.FutureTimestamp.selector, block.timestamp + 1, block.timestamp
            )
        );
        oracle.submit(94e6, block.timestamp + 1);
    }

    function test_rejectsStaleAndNonMonotonicTimestamps() public {
        // Older than maxStaleness.
        vm.expectRevert(
            abi.encodeWithSelector(
                MockOracle.StaleTimestamp.selector, block.timestamp - 2 days, 0, block.timestamp
            )
        );
        oracle.submit(94e6, block.timestamp - 2 days);

        oracle.submit(94e6, block.timestamp);
        // Same or older than the last accepted one.
        vm.expectRevert(
            abi.encodeWithSelector(
                MockOracle.StaleTimestamp.selector,
                block.timestamp,
                block.timestamp,
                block.timestamp
            )
        );
        oracle.submit(95e6, block.timestamp);
        vm.expectRevert(
            abi.encodeWithSelector(
                MockOracle.StaleTimestamp.selector,
                block.timestamp - 1,
                block.timestamp,
                block.timestamp
            )
        );
        oracle.submit(95e6, block.timestamp - 1);
    }

    function test_latestRevertsBeforeAnyPrice() public {
        vm.expectRevert(MockOracle.NoPrice.selector);
        oracle.latest();
    }
}
