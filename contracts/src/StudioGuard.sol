// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {MarketRequest, Template} from "./Types.sol";

/// @title StudioGuard
/// @notice Pure validation of a Studio request against a template. The
///  factory calls it before deploying anything, so a market outside the
///  template's limits cannot exist.
library StudioGuard {
    error OutOfBounds(string field, uint256 value, uint256 min, uint256 max);
    error NotAllowed(string field, uint256 value);
    error TemplateInactive();

    function validate(Template memory t, MarketRequest memory r) internal pure {
        if (!t.active) revert TemplateInactive();

        _within("barrierBps", r.barrierBps, t.minBarrierBps, t.maxBarrierBps);

        if (r.autocallBps == 0) {
            if (!t.allowAutocallOff) revert NotAllowed("autocallBps", 0);
        } else {
            _within("autocallBps", r.autocallBps, t.minAutocallBps, t.maxAutocallBps);
        }

        _within("couponBps", r.couponBps, t.minCouponBps, t.maxCouponBps);

        if (r.observationCount >= 256 || (t.allowedObservations >> r.observationCount) & 1 == 0) {
            revert NotAllowed("observationCount", r.observationCount);
        }

        _within("intervalSeconds", r.intervalSeconds, t.minIntervalSeconds, t.maxIntervalSeconds);
        _within(
            "subscribeSeconds", r.subscribeSeconds, t.minSubscribeSeconds, t.maxSubscribeSeconds
        );
        _within("capLots", r.capLots, t.minCapLots, t.maxCapLots);
        _within("lotTokens", r.lotTokens, t.minLotTokens, t.maxLotTokens);
    }

    function _within(string memory field, uint256 value, uint256 min, uint256 max) private pure {
        if (value < min || value > max) revert OutOfBounds(field, value, min, max);
    }
}
