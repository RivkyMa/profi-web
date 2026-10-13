// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MarketEscrow} from "../src/MarketEscrow.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {Closure, Phase, Side, Terms} from "../src/Types.sol";

/// @dev Shared fixture. Stable and underlying both use 6 decimals, matching the
///  TypeScript model (so base units equal the model's fixed-point units).
abstract contract MarketBase is Test {
    uint256 internal constant DAY = 1 days;
    uint32 internal constant WINDOW = 1 days;
    uint32 internal constant INTERVAL = 7 days;

    MockERC20 internal stable;
    MockERC20 internal token;
    MockOracle internal oracle;

    address internal earner = makeAddr("earner");
    address internal protector = makeAddr("protector");
    address internal feeTo = makeAddr("feeTo");
    address internal stranger = makeAddr("stranger");

    struct Shape {
        uint256 lotTokens;
        uint256 strike;
        uint256 couponPerLot;
        uint256 capLots;
        uint16 barrierBps;
        uint16 autocallBps;
        uint16 feeBps;
        uint32 observations;
    }

    /// @dev The specification's reference market: P0 100, 100 tokens per lot
    ///  (N = 10,000), barrier 65, autocall 100, 4 observations, coupon 50.
    function _reference() internal pure returns (Shape memory s) {
        s = Shape({
            lotTokens: 100e6,
            strike: 100e6,
            couponPerLot: 50e6,
            capLots: 1_000,
            barrierBps: 6500,
            autocallBps: 10_000,
            feeBps: 500,
            observations: 4
        });
    }

    function _newTokens() internal {
        stable = new MockERC20("Mock USD", "mUSD", 6);
        token = new MockERC20("Mock Tesla", "mTSLA", 6);
        oracle = new MockOracle(365 days);
    }

    function _terms(Shape memory s) internal view returns (Terms memory t) {
        uint64 deadline = uint64(block.timestamp + DAY);
        uint64[] memory times = new uint64[](s.observations);
        for (uint256 i = 0; i < s.observations; i++) {
            times[i] = deadline + uint64((i + 1) * uint256(INTERVAL));
        }
        t = Terms({
            stable: stable,
            underlying: token,
            oracle: oracle,
            feeRecipient: feeTo,
            lotTokens: s.lotTokens,
            strike: s.strike,
            couponPerLot: s.couponPerLot,
            capLots: s.capLots,
            subscribeDeadline: deadline,
            observationWindow: WINDOW,
            barrierBps: s.barrierBps,
            autocallBps: s.autocallBps,
            feeBps: s.feeBps,
            observationTimes: times
        });
    }

    function _deploy(Shape memory s) internal returns (MarketEscrow m) {
        _newTokens();
        m = new MarketEscrow(_terms(s));
    }

    function _fund(address who, uint256 stableAmt, uint256 tokenAmt, MarketEscrow m) internal {
        stable.mint(who, stableAmt);
        token.mint(who, tokenAmt);
        vm.startPrank(who);
        stable.approve(address(m), type(uint256).max);
        token.approve(address(m), type(uint256).max);
        vm.stopPrank();
    }

    function _earn(MarketEscrow m, address who, uint256 lots) internal {
        _fund(who, lots * m.lotPrincipal(), 0, m);
        vm.prank(who);
        m.subscribeEarn(lots);
    }

    function _protect(MarketEscrow m, address who, uint256 lots) internal {
        _fund(who, lots * m.lotReserve(), lots * m.lotTokens(), m);
        vm.prank(who);
        m.subscribeProtect(lots);
    }

    function _activate(MarketEscrow m) internal {
        vm.warp(m.subscribeDeadline());
        m.activate();
    }

    /// @dev Warp to the observation time, publish `price` stamped now, observe.
    function _observe(MarketEscrow m, uint32 index, uint256 price) internal {
        vm.warp(m.observationTime(index));
        oracle.submit(int256(price), block.timestamp);
        m.observe();
    }

    /// @dev Let observation `index` pass its window with no data, then unwind.
    function _missAndUnwind(MarketEscrow m, uint32 index) internal {
        vm.warp(uint256(m.observationTime(index)) + m.observationWindow() + 1);
        m.triggerUnwind();
    }

    function _closureName(Closure c) internal pure returns (string memory) {
        if (c == Closure.Early) return "early";
        if (c == Closure.Normal) return "normal";
        if (c == Closure.Downside) return "downside";
        if (c == Closure.Unwind) return "unwind";
        return "none";
    }
}
