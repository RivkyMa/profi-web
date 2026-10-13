// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketBase} from "./Base.t.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {Phase} from "../src/Types.sol";

/// @notice Runs every scenario in packages/shared/test-vectors.json through
///  the real escrow and requires the exact numbers the TypeScript payoff model
///  produced. That file is generated and verified by web/src/lib/shared-vectors
///  .test.ts, so the two implementations can only agree or fail loudly.
contract VectorsTest is MarketBase {
    string internal constant FILE = "../packages/shared/test-vectors.json";

    struct Ctx {
        string json;
        string key; // ".vectors[i]"
        string name;
    }

    function test_everySharedVectorMatchesTheTypeScriptModel() public {
        string memory json = vm.readFile(FILE);
        uint256 count = vm.parseJsonUint(json, ".count");
        assertGe(count, 12, "fixture has too few scenarios");
        for (uint256 i = 0; i < count; i++) {
            string memory key = string.concat(".vectors[", vm.toString(i), "]");
            Ctx memory c = Ctx({
                json: json, key: key, name: vm.parseJsonString(json, string.concat(key, ".name"))
            });
            _runVector(c);
        }
    }

    function _runVector(Ctx memory c) internal {
        MarketEscrow m = _setUp(c);
        _play(c, m);
        _checkClosure(c, m);
        _checkPayouts(c, m);
    }

    function _u(Ctx memory c, string memory path) internal pure returns (uint256) {
        return vm.parseJsonUint(c.json, string.concat(c.key, path));
    }

    /// @dev Deploy the market for this vector and put `lots` lots on each side.
    function _setUp(Ctx memory c) internal returns (MarketEscrow m) {
        Shape memory s = Shape({
            lotTokens: _u(c, ".params.tokensPerLot"),
            strike: _u(c, ".params.strike"),
            couponPerLot: _u(c, ".params.couponPerLot"),
            capLots: 1_000_000,
            barrierBps: uint16(_u(c, ".params.barrierBps")),
            autocallBps: uint16(_u(c, ".params.autocallBps")),
            feeBps: uint16(_u(c, ".params.feeBps")),
            observations: uint32(_u(c, ".params.observations"))
        });
        uint256 lots = _u(c, ".params.lots");

        m = _deploy(s);
        _earn(m, earner, lots);
        _protect(m, protector, lots);
        _activate(m);
    }

    /// @dev Feed the recorded prices, then the missed observation if any.
    function _play(Ctx memory c, MarketEscrow m) internal {
        uint256[] memory prices = vm.parseJsonUintArray(c.json, string.concat(c.key, ".prices"));
        for (uint256 p = 0; p < prices.length; p++) {
            _observe(m, uint32(p), prices[p]);
        }
        int256 missed = vm.parseJsonInt(c.json, string.concat(c.key, ".missedObservationIndex"));
        if (missed >= 0) {
            assertEq(prices.length, uint256(missed), string.concat(c.name, ": missed index"));
            _missAndUnwind(m, uint32(uint256(missed)));
        }
    }

    function _checkClosure(Ctx memory c, MarketEscrow m) internal view {
        assertEq(uint256(m.phase()), uint256(Phase.Closed), string.concat(c.name, ": closed"));
        assertEq(
            _closureName(m.closure()),
            vm.parseJsonString(c.json, string.concat(c.key, ".expected.closure")),
            string.concat(c.name, ": closure")
        );
        assertEq(
            m.closedAtIndex(), _u(c, ".expected.closedAtIndex"), string.concat(c.name, ": index")
        );
        assertEq(
            m.couponsPaid(), _u(c, ".expected.couponsPaid"), string.concat(c.name, ": coupons")
        );
    }

    /// @dev What each side actually receives must equal the model's numbers.
    function _checkPayouts(Ctx memory c, MarketEscrow m) internal {
        uint256 eStable0 = stable.balanceOf(earner);
        uint256 eToken0 = token.balanceOf(earner);
        uint256 pStable0 = stable.balanceOf(protector);
        uint256 pToken0 = token.balanceOf(protector);

        vm.prank(earner);
        m.claim();
        vm.prank(protector);
        m.claim();
        if (m.feeAccrued() > m.feeCollected()) m.collectFees();

        assertEq(
            stable.balanceOf(earner) - eStable0,
            _u(c, ".expected.earnCash"),
            string.concat(c.name, ": earn cash")
        );
        assertEq(
            token.balanceOf(earner) - eToken0,
            _u(c, ".expected.earnTokens"),
            string.concat(c.name, ": earn tokens")
        );
        assertEq(
            stable.balanceOf(protector) - pStable0,
            _u(c, ".expected.protectCash"),
            string.concat(c.name, ": protect cash")
        );
        assertEq(
            token.balanceOf(protector) - pToken0,
            _u(c, ".expected.protectTokens"),
            string.concat(c.name, ": protect tokens")
        );
        assertEq(
            stable.balanceOf(feeTo), _u(c, ".expected.protocolFee"), string.concat(c.name, ": fee")
        );

        // One account per side and exact division: nothing is left behind.
        assertEq(stable.balanceOf(address(m)), 0, string.concat(c.name, ": stable dust"));
        assertEq(token.balanceOf(address(m)), 0, string.concat(c.name, ": token dust"));
    }
}
