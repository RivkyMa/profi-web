// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {Template} from "./Types.sol";

/// @title TemplateRegistry
/// @notice The bounds Studio markets must stay inside, and which underlying
///  tokens may be used with which oracle.
/// @dev The owner can add templates and enable or disable them. That is the
///  whole of its power: it affects markets created AFTERWARDS. A deployed
///  `MarketEscrow` never reads this registry, so nothing here can change the
///  strike, barrier, history or principal of an existing market.
contract TemplateRegistry is Ownable {
    error InvalidTemplate(string reason);
    error UnknownTemplate(uint256 id);

    struct UnderlyingConfig {
        IPriceOracle oracle;
        bool enabled;
    }

    event TemplateAdded(uint256 indexed id);
    event TemplateActiveSet(uint256 indexed id, bool active);
    event UnderlyingSet(address indexed token, address oracle, bool enabled);

    Template[] private _templates;
    mapping(address token => UnderlyingConfig) public underlyingConfig;

    constructor(address owner_) Ownable(owner_) {}

    function addTemplate(Template calldata t) external onlyOwner returns (uint256 id) {
        if (t.minBarrierBps == 0 || t.minBarrierBps > t.maxBarrierBps || t.maxBarrierBps >= 10_000)
        {
            revert InvalidTemplate("barrier bounds");
        }
        if (t.minAutocallBps < 10_000 || t.minAutocallBps > t.maxAutocallBps) {
            revert InvalidTemplate("autocall bounds");
        }
        if (t.minCouponBps > t.maxCouponBps) revert InvalidTemplate("coupon bounds");
        if (t.allowedObservations == 0) revert InvalidTemplate("no observation counts");
        if (t.minIntervalSeconds == 0 || t.minIntervalSeconds > t.maxIntervalSeconds) {
            revert InvalidTemplate("interval bounds");
        }
        if (t.minIntervalSeconds <= t.observationWindow) {
            revert InvalidTemplate("interval must exceed the observation window");
        }
        if (t.minSubscribeSeconds == 0 || t.minSubscribeSeconds > t.maxSubscribeSeconds) {
            revert InvalidTemplate("subscribe bounds");
        }
        if (t.observationWindow == 0) revert InvalidTemplate("window");
        if (t.minCapLots == 0 || t.minCapLots > t.maxCapLots) revert InvalidTemplate("cap bounds");
        if (t.minLotTokens == 0 || t.minLotTokens > t.maxLotTokens) {
            revert InvalidTemplate("lot bounds");
        }
        if (t.feeBps > 10_000) revert InvalidTemplate("fee");

        id = _templates.length;
        _templates.push(t);
        emit TemplateAdded(id);
    }

    function setTemplateActive(uint256 id, bool active) external onlyOwner {
        if (id >= _templates.length) revert UnknownTemplate(id);
        _templates[id].active = active;
        emit TemplateActiveSet(id, active);
    }

    function setUnderlying(IERC20 token, IPriceOracle oracle, bool enabled) external onlyOwner {
        if (address(token) == address(0) || address(oracle) == address(0)) {
            revert InvalidTemplate("zero address");
        }
        underlyingConfig[address(token)] = UnderlyingConfig({oracle: oracle, enabled: enabled});
        emit UnderlyingSet(address(token), address(oracle), enabled);
    }

    function template(uint256 id) external view returns (Template memory) {
        if (id >= _templates.length) revert UnknownTemplate(id);
        return _templates[id];
    }

    function templateCount() external view returns (uint256) {
        return _templates.length;
    }
}
