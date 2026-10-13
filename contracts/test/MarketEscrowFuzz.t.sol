// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketBase} from "./Base.t.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {Closure, Phase, Side} from "../src/Types.sol";

/// @dev An independent, loop-style transcription of the payoff rules (the same
///  rules as web/src/lib/payoff.ts). It deliberately shares no code with the
///  escrow, so a bug would have to be made twice to go unnoticed.
library RefModel {
    struct Params {
        uint256 lots;
        uint256 lotTokens;
        uint256 strike;
        uint256 couponPerLot;
        uint16 barrierBps;
        uint16 autocallBps; // 0 = off
        uint16 feeBps;
        uint32 observations;
    }

    struct Result {
        Closure closure;
        uint32 closedAt;
        uint32 coupons;
        uint256 earnCash;
        uint256 earnTokens;
        uint256 protectCash;
        uint256 protectTokens;
        uint256 fee;
    }

    function simulate(Params memory p, uint256[] memory prices, int256 missed)
        internal
        pure
        returns (Result memory r)
    {
        uint256 principal = (p.lots * p.lotTokens * p.strike) / 1e6; // 6-decimal underlying
        uint256 tokens = p.lots * p.lotTokens;
        uint256 reserve = uint256(p.observations) * p.lots * p.couponPerLot;
        uint256 grossEach = p.lots * p.couponPerLot;

        uint256 netPaid;
        uint256 grossPaid;
        uint32 i;
        for (i = 0; i < p.observations; i++) {
            if (missed >= 0 && int256(uint256(i)) == missed) {
                r.closure = Closure.Unwind;
                break;
            }
            uint256 px = prices[i];
            bool eligible = px * 10_000 >= p.strike * p.barrierBps;
            if (eligible) {
                uint256 fee = (grossEach * p.feeBps) / 10_000;
                grossPaid += grossEach;
                netPaid += grossEach - fee;
                r.fee += fee;
                r.coupons++;
            }
            bool last = i == p.observations - 1;
            if (!last && p.autocallBps != 0 && px * 10_000 >= p.strike * p.autocallBps) {
                r.closure = Closure.Early;
                break;
            }
            if (last) {
                r.closure = eligible ? Closure.Normal : Closure.Downside;
                break;
            }
        }
        r.closedAt = i;

        uint256 remaining = reserve - grossPaid;
        if (r.closure == Closure.Downside) {
            r.earnCash = netPaid;
            r.earnTokens = tokens;
            r.protectCash = principal + remaining;
            r.protectTokens = 0;
        } else {
            r.earnCash = principal + netPaid;
            r.earnTokens = 0;
            r.protectCash = remaining;
            r.protectTokens = tokens;
        }
    }
}

contract MarketEscrowFuzzTest is MarketBase {
    struct Case {
        RefModel.Params params;
        uint256[] prices;
        int256 missed;
    }

    /// @dev Build a case from raw fuzz inputs, inside the template-like ranges.
    function _case(
        uint8 obsSeed,
        uint16 barrierSeed,
        uint16 autocallSeed,
        uint8 lotsSeed,
        uint32 couponSeed,
        uint16 feeSeed,
        uint256 priceSeed,
        uint8 missSeed
    ) internal pure returns (Case memory c) {
        c.params.observations = uint32(bound(obsSeed, 1, 8));
        c.params.barrierBps = uint16(bound(barrierSeed, 1_000, 9_500));
        c.params.autocallBps =
            autocallSeed % 3 == 0 ? 0 : uint16(bound(autocallSeed, 10_000, 13_000));
        c.params.lots = bound(lotsSeed, 1, 40);
        c.params.lotTokens = 10e6;
        c.params.strike = 100e6;
        c.params.couponPerLot = bound(couponSeed, 0, 200e6);
        c.params.feeBps = uint16(bound(feeSeed, 0, 2_000));

        c.prices = new uint256[](c.params.observations);
        for (uint256 i = 0; i < c.params.observations; i++) {
            c.prices[i] = bound(uint256(keccak256(abi.encode(priceSeed, i))), 1e6, 200e6);
        }
        c.missed =
            missSeed % 4 == 0 ? int256(uint256(missSeed / 4) % c.params.observations) : int256(-1);
    }

    function _run(Case memory c) internal returns (MarketEscrow m) {
        Shape memory s = Shape({
            lotTokens: c.params.lotTokens,
            strike: c.params.strike,
            couponPerLot: c.params.couponPerLot,
            capLots: 1_000_000,
            barrierBps: c.params.barrierBps,
            autocallBps: c.params.autocallBps,
            feeBps: c.params.feeBps,
            observations: c.params.observations
        });
        m = _deploy(s);
        _earn(m, earner, c.params.lots);
        _protect(m, protector, c.params.lots);
        _activate(m);

        for (uint32 i = 0; i < c.params.observations; i++) {
            if (m.phase() != Phase.Active) break;
            if (c.missed >= 0 && int256(uint256(i)) == c.missed) {
                _missAndUnwind(m, i);
            } else {
                _observe(m, i, c.prices[i]);
            }
        }
    }

    function testFuzz_escrowMatchesTheReferenceModel(
        uint8 obsSeed,
        uint16 barrierSeed,
        uint16 autocallSeed,
        uint8 lotsSeed,
        uint32 couponSeed,
        uint16 feeSeed,
        uint256 priceSeed,
        uint8 missSeed
    ) public {
        Case memory c = _case(
            obsSeed, barrierSeed, autocallSeed, lotsSeed, couponSeed, feeSeed, priceSeed, missSeed
        );
        RefModel.Result memory ref = RefModel.simulate(c.params, c.prices, c.missed);
        MarketEscrow m = _run(c);

        assertEq(uint256(m.phase()), uint256(Phase.Closed), "closed");
        assertEq(uint256(m.closure()), uint256(ref.closure), "closure");
        assertEq(m.closedAtIndex(), ref.closedAt, "closed at");
        assertEq(m.couponsPaid(), ref.coupons, "coupons");
        assertEq(m.feeAccrued(), ref.fee, "fee");

        vm.prank(earner);
        (uint256 es, uint256 et) = m.claim();
        vm.prank(protector);
        (uint256 ps, uint256 pt) = m.claim();

        assertEq(es, ref.earnCash, "earn cash");
        assertEq(et, ref.earnTokens, "earn tokens");
        assertEq(ps, ref.protectCash, "protect cash");
        assertEq(pt, ref.protectTokens, "protect tokens");
    }

    /// @dev Everything deposited is paid out, to the unit: stable to Earn,
    ///  Protect and the fee recipient; the token to exactly one side.
    function testFuzz_everyUnitIsAccountedFor(
        uint8 obsSeed,
        uint16 barrierSeed,
        uint16 autocallSeed,
        uint8 lotsSeed,
        uint32 couponSeed,
        uint16 feeSeed,
        uint256 priceSeed,
        uint8 missSeed
    ) public {
        Case memory c = _case(
            obsSeed, barrierSeed, autocallSeed, lotsSeed, couponSeed, feeSeed, priceSeed, missSeed
        );
        MarketEscrow m = _run(c);

        uint256 depositedStable = c.params.lots * m.lotPrincipal() + c.params.lots * m.lotReserve();
        uint256 depositedTokens = c.params.lots * c.params.lotTokens;

        vm.prank(earner);
        (uint256 es, uint256 et) = m.claim();
        vm.prank(protector);
        (uint256 ps, uint256 pt) = m.claim();
        uint256 fee = m.feeAccrued();
        if (fee > 0) m.collectFees();

        assertEq(es + ps + fee, depositedStable, "stable conserved");
        assertEq(et + pt, depositedTokens, "tokens conserved");
        assertEq(stable.balanceOf(address(m)), 0, "stable left behind");
        assertEq(token.balanceOf(address(m)), 0, "tokens left behind");
    }

    /// @dev Several accounts per side and unmatched lots: pro-rata floors can
    ///  leave dust but can never pay out more than was deposited.
    function testFuzz_multiAccountClaimsNeverExceedDeposits(
        uint8 e1,
        uint8 e2,
        uint8 p1,
        uint8 p2,
        uint16 capSeed,
        uint256 priceSeed,
        uint8 missSeed
    ) public {
        Shape memory s = _reference();
        s.capLots = bound(capSeed, 1, 60);
        s.observations = 3;
        s.lotTokens = 7e6; // awkward amounts make the floors bite
        s.couponPerLot = 3_333_333;
        m = _deploy(s);

        address[2] memory es = [makeAddr("e1"), makeAddr("e2")];
        address[2] memory ps = [makeAddr("p1"), makeAddr("p2")];
        uint256[2] memory el = [bound(e1, 1, 30), bound(e2, 1, 30)];
        uint256[2] memory pl = [bound(p1, 1, 30), bound(p2, 1, 30)];
        for (uint256 i = 0; i < 2; i++) {
            _earn(m, es[i], el[i]);
            _protect(m, ps[i], pl[i]);
        }
        _activate(m);

        for (uint32 i = 0; i < 3 && m.phase() == Phase.Active; i++) {
            if (missSeed % 5 == 0 && i == missSeed % 3) {
                _missAndUnwind(m, i);
            } else {
                _observe(m, i, bound(uint256(keccak256(abi.encode(priceSeed, i))), 1e6, 160e6));
            }
        }
        assertEq(uint256(m.phase()), uint256(Phase.Closed));

        uint256 stableIn = m.stableIn();
        uint256 tokensIn = m.tokensIn();

        uint256 paidStable;
        uint256 paidTokens;
        for (uint256 i = 0; i < 2; i++) {
            vm.prank(es[i]);
            (uint256 s1, uint256 t1) = m.claim();
            vm.prank(ps[i]);
            (uint256 s2, uint256 t2) = m.claim();
            paidStable += s1 + s2;
            paidTokens += t1 + t2;
        }
        if (m.feeAccrued() > 0) paidStable += m.collectFees();

        assertLe(paidStable, stableIn, "paid more stable than deposited");
        assertLe(paidTokens, tokensIn, "paid more tokens than deposited");
        // Only rounding dust remains: under one unit per pool per account.
        assertLe(stableIn - paidStable, 16, "stable dust too large");
        assertLe(tokensIn - paidTokens, 16, "token dust too large");
        (uint256 owedStable, uint256 owedTokens) = m.obligations();
        assertGe(stable.balanceOf(address(m)), owedStable);
        assertGe(token.balanceOf(address(m)), owedTokens);
    }

    MarketEscrow internal m;

    function testFuzz_oneObservationOnePrice(uint8 obsSeed, uint256 priceSeed) public {
        Shape memory s = _reference();
        s.observations = uint32(bound(obsSeed, 2, 8));
        s.autocallBps = 0; // never closes early, so every observation is reachable
        m = _deploy(s);
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);

        for (uint32 i = 0; i < s.observations - 1; i++) {
            _observe(m, i, bound(uint256(keccak256(abi.encode(priceSeed, i))), 1e6, 200e6));
            assertEq(m.nextObservation(), i + 1);
            assertEq(m.observationsRecorded(), i + 1);
            // The same moment cannot record a second observation.
            vm.expectRevert();
            m.observe();
        }
    }
}
