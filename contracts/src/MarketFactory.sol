// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {MarketEscrow} from "./MarketEscrow.sol";
import {StudioGuard} from "./StudioGuard.sol";
import {TemplateRegistry} from "./TemplateRegistry.sol";
import {MarketRequest, Template, Terms} from "./Types.sol";

/// @title MarketFactory
/// @notice Creates `MarketEscrow` instances from a template. The creator
///  chooses the shape inside the template's bounds; the factory derives the
///  strike (from the oracle), the schedule and the fee, so none of those can
///  be picked to the creator's advantage.
/// @dev There is no admin function here at all. Markets are plain deployments:
///  no proxy, no upgrade path.
contract MarketFactory {
    error TemplateInactiveOrUnknown(uint256 id);
    error UnderlyingNotEnabled(address token);
    error StrikeTooOld(uint256 age, uint256 maxAge);

    event MarketCreated(
        address indexed market,
        address indexed creator,
        uint256 indexed templateId,
        address underlying,
        uint256 strike
    );

    uint256 public constant BPS = 10_000;

    IERC20 public immutable stable;
    TemplateRegistry public immutable registry;
    address public immutable feeRecipient;

    address[] private _markets;
    mapping(address => bool) public isMarket;

    constructor(IERC20 stable_, TemplateRegistry registry_, address feeRecipient_) {
        stable = stable_;
        registry = registry_;
        feeRecipient = feeRecipient_;
    }

    function createMarket(uint256 templateId, MarketRequest calldata r)
        external
        returns (MarketEscrow market)
    {
        Template memory t = registry.template(templateId);
        if (!t.active) revert TemplateInactiveOrUnknown(templateId);

        MarketRequest memory req = r;
        StudioGuard.validate(t, req);

        (IPriceOracle oracle, uint256 strike) = _strike(req.underlying, t.maxStrikeAge);
        Terms memory terms = _terms(t, req, oracle, strike);

        market = new MarketEscrow(terms);
        _markets.push(address(market));
        isMarket[address(market)] = true;
        emit MarketCreated(address(market), msg.sender, templateId, address(req.underlying), strike);
    }

    function marketCount() external view returns (uint256) {
        return _markets.length;
    }

    function marketAt(uint256 index) external view returns (address) {
        return _markets[index];
    }

    function _strike(IERC20 underlying, uint32 maxAge)
        private
        view
        returns (IPriceOracle oracle, uint256 strike)
    {
        (IPriceOracle configured, bool enabled) = registry.underlyingConfig(address(underlying));
        if (!enabled) revert UnderlyingNotEnabled(address(underlying));
        oracle = configured;

        uint256 updatedAt;
        (strike, updatedAt) = oracle.latest();
        uint256 age = block.timestamp - updatedAt;
        if (age > maxAge) revert StrikeTooOld(age, maxAge);
    }

    function _terms(Template memory t, MarketRequest memory r, IPriceOracle oracle, uint256 strike)
        private
        view
        returns (Terms memory terms)
    {
        uint256 unit = 10 ** uint256(IERC20Metadata(address(r.underlying)).decimals());
        uint256 lotPrincipal = (r.lotTokens * strike) / unit;

        uint64 deadline = uint64(block.timestamp + r.subscribeSeconds);
        uint64[] memory times = new uint64[](r.observationCount);
        for (uint256 i = 0; i < r.observationCount; i++) {
            times[i] = deadline + uint64((i + 1) * uint256(r.intervalSeconds));
        }

        terms = Terms({
            stable: stable,
            underlying: r.underlying,
            oracle: oracle,
            feeRecipient: feeRecipient,
            lotTokens: r.lotTokens,
            strike: strike,
            couponPerLot: (lotPrincipal * r.couponBps) / BPS,
            capLots: r.capLots,
            subscribeDeadline: deadline,
            observationWindow: t.observationWindow,
            barrierBps: r.barrierBps,
            autocallBps: r.autocallBps,
            feeBps: t.feeBps,
            observationTimes: times
        });
    }
}
