// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketBase} from "./Base.t.sol";
import {EpochVault} from "../src/EpochVault.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {StudioGuard} from "../src/StudioGuard.sol";
import {TemplateRegistry} from "../src/TemplateRegistry.sol";
import {Closure, MarketRequest, Phase, Side, Template} from "../src/Types.sol";

contract EpochVaultTest is MarketBase {
    TemplateRegistry internal registry;
    MarketFactory internal factory;
    EpochVault internal vault;

    // A second underlying (with its own oracle) so tokens are shared per token.
    MockERC20 internal token2;
    MockOracle internal oracle2;

    MarketEscrow internal mA; // resolves "above": Earn is paid in stable
    MarketEscrow internal mB; // resolves "below": Earn takes the token

    address internal manager = makeAddr("manager");
    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        vm.warp(10_000_000);
        _newTokens();
        token2 = new MockERC20("Mock Nvidia", "mNVDA", 6);
        oracle2 = new MockOracle(365 days);

        registry = new TemplateRegistry(admin);
        factory = new MarketFactory(stable, registry, feeTo);
        vault = new EpochVault(stable, factory, manager);

        vm.startPrank(admin);
        registry.addTemplate(_template());
        registry.setUnderlying(token, oracle, true);
        registry.setUnderlying(token2, oracle2, true);
        vm.stopPrank();

        oracle.submit(100e6, block.timestamp);
        oracle2.submit(100e6, block.timestamp);

        mA = factory.createMarket(0, _request(token));
        mB = factory.createMarket(0, _request(token2));

        // Counterparty Protect so both markets match.
        _protectMarket(mA, token, 100);
        _protectMarket(mB, token2, 100);
    }

    function _template() internal pure returns (Template memory t) {
        t = Template({
            active: true,
            minBarrierBps: 4_000,
            maxBarrierBps: 9_000,
            allowAutocallOff: true,
            minAutocallBps: 10_000,
            maxAutocallBps: 12_000,
            minCouponBps: 20,
            maxCouponBps: 300,
            allowedObservations: (1 << 4),
            minIntervalSeconds: 7 days,
            maxIntervalSeconds: 30 days,
            minSubscribeSeconds: 1 days,
            maxSubscribeSeconds: 14 days,
            observationWindow: 1 days,
            maxStrikeAge: 1 hours,
            minCapLots: 10,
            maxCapLots: 1_000,
            minLotTokens: 1e6,
            maxLotTokens: 1_000e6,
            feeBps: 500
        });
    }

    function _request(MockERC20 underlying) internal pure returns (MarketRequest memory r) {
        // 10 tokens at 100 = 1,000 principal per lot; coupon 1% = 10.
        r = MarketRequest({
            underlying: underlying,
            lotTokens: 10e6,
            barrierBps: 6_500,
            autocallBps: 0,
            couponBps: 100,
            observationCount: 4,
            intervalSeconds: 7 days,
            subscribeSeconds: 5 days,
            capLots: 1_000
        });
    }

    function _protectMarket(MarketEscrow m, MockERC20 u, uint256 lots) internal {
        address p = makeAddr(string.concat("protect-", vm.toString(address(m))));
        stable.mint(p, lots * m.lotReserve());
        u.mint(p, lots * m.lotTokens());
        vm.startPrank(p);
        stable.approve(address(m), type(uint256).max);
        u.approve(address(m), type(uint256).max);
        m.subscribeProtect(lots);
        vm.stopPrank();
    }

    function _createEpoch(uint16 weightA, uint16 weightB, uint16 buffer)
        internal
        returns (uint256 id)
    {
        MarketEscrow[] memory markets = new MarketEscrow[](2);
        markets[0] = mA;
        markets[1] = mB;
        uint16[] memory weights = new uint16[](2);
        weights[0] = weightA;
        weights[1] = weightB;
        vm.prank(manager);
        id = vault.createEpoch(
            uint64(block.timestamp + 2 days), markets, weights, buffer, 1_000_000e6
        );
    }

    function _deposit(uint256 id, address who, uint256 amount) internal {
        stable.mint(who, amount);
        vm.startPrank(who);
        stable.approve(address(vault), amount);
        vault.deposit(id, amount);
        vm.stopPrank();
    }

    function _resolveBoth() internal {
        // mA ends high (stable back); mB ends below the barrier (token to Earn).
        uint256[4] memory above = [uint256(100e6), 100e6, 100e6, 100e6];
        for (uint32 i = 0; i < 4; i++) {
            vm.warp(mA.observationTime(i));
            oracle.submit(int256(above[i]), block.timestamp);
            mA.observe();
            vm.warp(mB.observationTime(i));
            oracle2.submit(i == 3 ? int256(50e6) : int256(100e6), block.timestamp);
            mB.observe();
        }
    }

    // --------------------------------------------------------------- tests

    function test_managerOnlyCreatesEpochsOverFactoryMarkets() public {
        MarketEscrow[] memory markets = new MarketEscrow[](1);
        markets[0] = mA;
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;

        vm.prank(stranger);
        vm.expectRevert(EpochVault.NotManager.selector);
        vault.createEpoch(uint64(block.timestamp + 2 days), markets, w, 0, 1e12);

        // A market that did not come from the factory is refused.
        MarketEscrow foreign = new MarketEscrow(_terms(_reference()));
        markets[0] = foreign;
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(EpochVault.NotAFactoryMarket.selector, address(foreign))
        );
        vault.createEpoch(uint64(block.timestamp + 2 days), markets, w, 0, 1e12);
    }

    function test_weightsAndBufferMustSumToOneHundredPercent() public {
        MarketEscrow[] memory markets = new MarketEscrow[](2);
        markets[0] = mA;
        markets[1] = mB;
        uint16[] memory w = new uint16[](2);
        w[0] = 5_000;
        w[1] = 4_000;
        vm.prank(manager);
        vm.expectRevert(
            abi.encodeWithSelector(
                EpochVault.BadAllocation.selector, "weights and buffer must sum to 100%"
            )
        );
        vault.createEpoch(uint64(block.timestamp + 2 days), markets, w, 500, 1e12);
    }

    function test_fullEpochSharesStableAndDownsideTokensInKind() public {
        uint256 id = _createEpoch(4_500, 4_500, 1_000); // 45% / 45% / 10% cash
        _deposit(id, alice, 6_000e6);
        _deposit(id, bob, 4_000e6); // 10,000 total; alice owns 60%

        vm.warp(block.timestamp + 2 days);
        vault.lock(id);
        // 4,500 per market at 1,000 per lot = 4 lots each (4,000 spent each), 2,000 stays as cash.
        EpochVault.Allocation[] memory a = vault.allocations(id);
        assertEq(a[0].lots, 4);
        assertEq(a[1].lots, 4);
        assertEq(vault.epoch(id).spent, 8_000e6);

        // Not resolved yet.
        vm.expectRevert(abi.encodeWithSelector(EpochVault.MarketNotResolved.selector, address(mA)));
        vault.settle(id);

        for (uint256 i; i < 1; i++) {
            vm.warp(mA.subscribeDeadline());
            mA.activate();
            mB.activate();
        }
        _resolveBoth();
        assertEq(uint256(mA.closure()), uint256(Closure.Normal));
        assertEq(uint256(mB.closure()), uint256(Closure.Downside));

        vault.settle(id);
        // 4 lots x 10 gross per observation, fee 5%: 38 net per observation.
        // mA matured high: 4 coupons (152). mB matured below the barrier: the
        // last observation (50) pays no coupon, so 3 coupons (114) plus the token.
        uint256 netA = 4 * 38e6;
        uint256 netB = 3 * 38e6;
        uint256 expectedStable = 2_000e6 + 4_000e6 + netA + netB;
        assertEq(vault.epoch(id).settledStable, expectedStable);
        assertEq(vault.tokenAmount(id, address(token2)), 40e6); // 4 lots x 10 tokens

        vm.prank(alice);
        uint256 aliceStable = vault.redeem(id);
        vm.prank(bob);
        uint256 bobStable = vault.redeem(id);

        assertEq(aliceStable, (expectedStable * 6_000e6) / 10_000e6);
        assertEq(bobStable, (expectedStable * 4_000e6) / 10_000e6);
        assertEq(token2.balanceOf(alice), (40e6 * 6_000e6) / 10_000e6); // 24 tokens, in kind
        assertEq(token2.balanceOf(bob), (40e6 * 4_000e6) / 10_000e6); // 16 tokens, in kind
        // Nothing was lost beyond rounding dust.
        assertLe(stable.balanceOf(address(vault)), 2);
    }

    function test_depositsCanBeWithdrawnWhileOpen() public {
        uint256 id = _createEpoch(5_000, 5_000, 0);
        _deposit(id, alice, 1_000e6);
        vm.prank(alice);
        vault.withdraw(id, 400e6);
        assertEq(stable.balanceOf(alice), 400e6);
        assertEq(vault.shares(id, alice), 600e6);

        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(EpochVault.InsufficientShares.selector, 600e6, 700e6)
        );
        vault.withdraw(id, 700e6);
    }

    function test_depositWindowAndCapAreEnforced() public {
        MarketEscrow[] memory markets = new MarketEscrow[](1);
        markets[0] = mA;
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        vm.prank(manager);
        uint256 id = vault.createEpoch(uint64(block.timestamp + 2 days), markets, w, 0, 1_000e6);

        stable.mint(alice, 2_000e6);
        vm.startPrank(alice);
        stable.approve(address(vault), type(uint256).max);
        vm.expectRevert(EpochVault.CapExceeded.selector);
        vault.deposit(id, 1_001e6);

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(EpochVault.DepositWindowClosed.selector);
        vault.deposit(id, 1e6);
        vm.stopPrank();
    }

    function test_lockWaitsForTheWindowAndMustBeInTime() public {
        uint256 id = _createEpoch(5_000, 5_000, 0);
        _deposit(id, alice, 2_000e6);

        vm.expectRevert(EpochVault.DepositWindowOpen.selector);
        vault.lock(id);

        // Past the markets' own subscription deadline: locking is no longer possible.
        vm.warp(mA.subscribeDeadline());
        vm.expectRevert(EpochVault.LockWindowMissed.selector);
        vault.lock(id);
    }

    function test_anEpochThatMissedItsLockCanBeAbortedAndWithdrawn() public {
        uint256 id = _createEpoch(5_000, 5_000, 0);
        _deposit(id, alice, 2_000e6);

        vm.expectRevert(EpochVault.LockWindowOpen.selector);
        vault.abort(id);

        vm.warp(mA.subscribeDeadline());
        vault.abort(id);

        vm.prank(alice);
        vault.withdraw(id, 2_000e6);
        assertEq(stable.balanceOf(alice), 2_000e6);
    }

    function test_noMarketMatchedMeansEveryoneGetsTheirStableBack() public {
        // A market with nobody on the Protect side cancels; the vault refunds.
        MarketEscrow lonely = factory.createMarket(0, _request(token));
        MarketEscrow[] memory markets = new MarketEscrow[](1);
        markets[0] = lonely;
        uint16[] memory w = new uint16[](1);
        w[0] = 10_000;
        vm.prank(manager);
        uint256 id = vault.createEpoch(uint64(block.timestamp + 2 days), markets, w, 0, 1e12);

        _deposit(id, alice, 3_000e6);
        vm.warp(block.timestamp + 2 days);
        vault.lock(id);
        assertEq(vault.epoch(id).spent, 3_000e6);

        vm.warp(lonely.subscribeDeadline());
        lonely.activate();
        assertEq(uint256(lonely.phase()), uint256(Phase.Cancelled));

        vault.settle(id);
        vm.prank(alice);
        assertEq(vault.redeem(id), 3_000e6);
    }

    function test_sharesCannotBeTransferred() public {
        // Shares are a mapping, not a token: there is no transfer entry point.
        (bool ok,) =
            address(vault).call(abi.encodeWithSignature("transfer(address,uint256)", bob, 1));
        assertFalse(ok);
        (ok,) = address(vault)
            .call(abi.encodeWithSignature("transferFrom(address,address,uint256)", alice, bob, 1));
        assertFalse(ok);
    }

    function test_redeemNeedsASettledEpochAndShares() public {
        uint256 id = _createEpoch(5_000, 5_000, 0);
        _deposit(id, alice, 1_000e6);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(EpochVault.WrongState.selector, EpochVault.EpochState.Open)
        );
        vault.redeem(id);
    }
}
