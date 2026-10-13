// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @dev Lifecycle of one market escrow.
///  Subscription: Earn and Protect deposit or cancel.
///  Active:       matched, collateral locked, observations running.
///  Closed:       one terminal outcome reached, claims open.
///  Cancelled:    nothing matched, full refunds.
enum Phase {
    Subscription,
    Active,
    Closed,
    Cancelled
}

/// @dev How a market ended. None until it has.
enum Closure {
    None,
    Early, // autocall on an intermediate observation
    Normal, // matured at or above the barrier
    Downside, // matured below the barrier: Earn takes the token
    Unwind // oracle data missing past its deadline
}

enum Side {
    Earn,
    Protect
}

/// @dev Everything fixed at deployment. The escrow stores these as immutables:
///  there is no function, admin or otherwise, that can change them.
struct Terms {
    IERC20 stable;
    IERC20 underlying;
    IPriceOracle oracle;
    address feeRecipient;
    /// q: underlying base units per lot.
    uint256 lotTokens;
    /// P0: stable base units per ONE whole underlying token.
    uint256 strike;
    /// c: gross coupon per observation per lot, stable base units.
    uint256 couponPerLot;
    uint256 capLots;
    uint64 subscribeDeadline;
    /// Seconds after an observation time in which oracle data is accepted.
    uint32 observationWindow;
    uint16 barrierBps;
    /// 0 means autocall is off; otherwise >= 10_000.
    uint16 autocallBps;
    uint16 feeBps;
    /// Strictly increasing. The last entry is maturity.
    uint64[] observationTimes;
}

/// @dev What a Studio user asks the factory for. Strike, schedule and fee are
///  derived by the factory, not chosen by the creator.
struct MarketRequest {
    IERC20 underlying;
    uint256 lotTokens;
    uint16 barrierBps;
    /// 0 = autocall off.
    uint16 autocallBps;
    /// Gross coupon per observation as bps of the lot principal.
    uint16 couponBps;
    uint32 observationCount;
    uint32 intervalSeconds;
    uint32 subscribeSeconds;
    uint256 capLots;
}

/// @dev Bounds a Studio market must stay inside. Set by the registry owner and
///  only ever applied to markets created afterwards.
struct Template {
    bool active;
    uint16 minBarrierBps;
    uint16 maxBarrierBps;
    bool allowAutocallOff;
    uint16 minAutocallBps;
    uint16 maxAutocallBps;
    uint16 minCouponBps;
    uint16 maxCouponBps;
    /// Bit n set means n observations are allowed.
    uint256 allowedObservations;
    uint32 minIntervalSeconds;
    uint32 maxIntervalSeconds;
    uint32 minSubscribeSeconds;
    uint32 maxSubscribeSeconds;
    uint32 observationWindow;
    /// Oldest oracle price (seconds) that may set a strike.
    uint32 maxStrikeAge;
    uint256 minCapLots;
    uint256 maxCapLots;
    uint256 minLotTokens;
    uint256 maxLotTokens;
    uint16 feeBps;
}
