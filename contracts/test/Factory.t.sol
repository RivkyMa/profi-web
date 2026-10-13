// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {MarketBase} from "./Base.t.sol";
import {MarketEscrow} from "../src/MarketEscrow.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {StudioGuard} from "../src/StudioGuard.sol";
import {TemplateRegistry} from "../src/TemplateRegistry.sol";
import {Phase, MarketRequest, Template} from "../src/Types.sol";

contract FactoryTest is MarketBase {
    TemplateRegistry internal registry;
    MarketFactory internal factory;
    address internal admin = makeAddr("admin");
    address internal creator = makeAddr("creator");
    uint256 internal templateId;

    function setUp() public {
        vm.warp(10_000_000);
        _newTokens();
        registry = new TemplateRegistry(admin);
        factory = new MarketFactory(stable, registry, feeTo);

        vm.startPrank(admin);
        templateId = registry.addTemplate(_template());
        registry.setUnderlying(token, oracle, true);
        vm.stopPrank();

        oracle.submit(250e6, block.timestamp);
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
            allowedObservations: (1 << 4) | (1 << 6) | (1 << 12),
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

    function _request() internal view returns (MarketRequest memory r) {
        r = MarketRequest({
            underlying: token,
            lotTokens: 10e6,
            barrierBps: 6_500,
            autocallBps: 10_000,
            couponBps: 80,
            observationCount: 4,
            intervalSeconds: 7 days,
            subscribeSeconds: 3 days,
            capLots: 100
        });
    }

    // -------------------------------------------------------------- happy

    function test_createsAMarketWithDerivedTerms() public {
        vm.prank(creator);
        MarketEscrow m = factory.createMarket(templateId, _request());

        assertTrue(factory.isMarket(address(m)));
        assertEq(factory.marketCount(), 1);
        assertEq(factory.marketAt(0), address(m));

        // Strike comes from the oracle, not from the creator.
        assertEq(m.strike(), 250e6);
        // 10 tokens x 250 = 2,500 principal; 0.8% coupon = 20 per observation.
        assertEq(m.lotPrincipal(), 2_500e6);
        assertEq(m.couponPerLot(), 20e6);
        assertEq(m.lotReserve(), 80e6);
        // Schedule and fee come from the template, not the request.
        assertEq(m.feeBps(), 500);
        assertEq(m.observationWindow(), 1 days);
        assertEq(m.subscribeDeadline(), block.timestamp + 3 days);
        assertEq(m.observationTime(0), m.subscribeDeadline() + 7 days);
        assertEq(m.observationTime(3), m.subscribeDeadline() + 28 days);
        assertEq(m.feeRecipient(), feeTo);
        assertEq(address(m.oracle()), address(oracle));
        assertEq(uint256(m.phase()), uint256(Phase.Subscription));
    }

    function test_theCreatedMarketIsUsable() public {
        MarketEscrow m = factory.createMarket(templateId, _request());
        _earn(m, earner, 2);
        _protect(m, protector, 2);
        _activate(m);
        assertEq(m.matchedLots(), 2);
    }

    // ------------------------------------------------------- guard bounds

    function test_barrierOutsideTheTemplateIsRefused() public {
        MarketRequest memory r = _request();
        r.barrierBps = 9_500;
        vm.expectRevert(
            abi.encodeWithSelector(
                StudioGuard.OutOfBounds.selector, "barrierBps", 9_500, 4_000, 9_000
            )
        );
        factory.createMarket(templateId, r);

        r.barrierBps = 3_000;
        vm.expectRevert(
            abi.encodeWithSelector(
                StudioGuard.OutOfBounds.selector, "barrierBps", 3_000, 4_000, 9_000
            )
        );
        factory.createMarket(templateId, r);
    }

    function test_couponCapAndLotBoundsAreEnforced() public {
        MarketRequest memory r = _request();
        r.couponBps = 301;
        vm.expectRevert(
            abi.encodeWithSelector(StudioGuard.OutOfBounds.selector, "couponBps", 301, 20, 300)
        );
        factory.createMarket(templateId, r);

        r = _request();
        r.capLots = 5;
        vm.expectRevert(
            abi.encodeWithSelector(StudioGuard.OutOfBounds.selector, "capLots", 5, 10, 1_000)
        );
        factory.createMarket(templateId, r);

        r = _request();
        r.lotTokens = 0;
        vm.expectRevert(
            abi.encodeWithSelector(StudioGuard.OutOfBounds.selector, "lotTokens", 0, 1e6, 1_000e6)
        );
        factory.createMarket(templateId, r);
    }

    function test_onlyAllowedObservationCounts() public {
        MarketRequest memory r = _request();
        r.observationCount = 5;
        vm.expectRevert(
            abi.encodeWithSelector(StudioGuard.NotAllowed.selector, "observationCount", 5)
        );
        factory.createMarket(templateId, r);

        r.observationCount = 12; // allowed
        factory.createMarket(templateId, r);
    }

    function test_autocallIsOffOrInsideItsBounds() public {
        MarketRequest memory r = _request();
        r.autocallBps = 9_000; // below 100%
        vm.expectRevert(
            abi.encodeWithSelector(
                StudioGuard.OutOfBounds.selector, "autocallBps", 9_000, 10_000, 12_000
            )
        );
        factory.createMarket(templateId, r);

        r.autocallBps = 0; // off is allowed by this template
        MarketEscrow m = factory.createMarket(templateId, r);
        assertEq(m.autocallBps(), 0);
    }

    // ------------------------------------------------------ registry state

    function test_unknownOrDisabledUnderlyingIsRefused() public {
        MarketRequest memory r = _request();
        r.underlying = stable; // not registered as an underlying
        vm.expectRevert(
            abi.encodeWithSelector(MarketFactory.UnderlyingNotEnabled.selector, address(stable))
        );
        factory.createMarket(templateId, r);

        vm.prank(admin);
        registry.setUnderlying(token, oracle, false);
        vm.expectRevert(
            abi.encodeWithSelector(MarketFactory.UnderlyingNotEnabled.selector, address(token))
        );
        factory.createMarket(templateId, _request());
    }

    function test_inactiveTemplateIsRefused() public {
        vm.prank(admin);
        registry.setTemplateActive(templateId, false);
        vm.expectRevert(
            abi.encodeWithSelector(MarketFactory.TemplateInactiveOrUnknown.selector, templateId)
        );
        factory.createMarket(templateId, _request());
    }

    function test_aStaleStrikeIsRefused() public {
        vm.warp(block.timestamp + 2 hours); // older than maxStrikeAge
        vm.expectRevert(
            abi.encodeWithSelector(MarketFactory.StrikeTooOld.selector, 2 hours, 1 hours)
        );
        factory.createMarket(templateId, _request());
    }

    function test_onlyTheOwnerManagesTemplates() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        registry.addTemplate(_template());

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        registry.setTemplateActive(templateId, false);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        registry.setUnderlying(token, oracle, false);
    }

    function test_registryRejectsIncoherentTemplates() public {
        Template memory t = _template();
        t.minBarrierBps = 9_100; // above max
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(TemplateRegistry.InvalidTemplate.selector, "barrier bounds")
        );
        registry.addTemplate(t);

        t = _template();
        t.minIntervalSeconds = 1 hours; // not larger than the observation window
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(
                TemplateRegistry.InvalidTemplate.selector,
                "interval must exceed the observation window"
            )
        );
        registry.addTemplate(t);
    }

    // -------------------------------------------- admin cannot touch markets

    function test_changingTemplatesNeverAltersAnExistingMarket() public {
        MarketEscrow m = factory.createMarket(templateId, _request());
        uint16 barrier = m.barrierBps();
        uint256 strike = m.strike();
        uint16 fee = m.feeBps();

        vm.startPrank(admin);
        registry.setTemplateActive(templateId, false);
        registry.setUnderlying(token, oracle, false);
        vm.stopPrank();

        assertEq(m.barrierBps(), barrier);
        assertEq(m.strike(), strike);
        assertEq(m.feeBps(), fee);

        // And the market still works end to end.
        _earn(m, earner, 1);
        _protect(m, protector, 1);
        _activate(m);
        assertEq(uint256(m.phase()), uint256(Phase.Active));
    }
}
