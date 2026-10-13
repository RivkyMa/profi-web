// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @notice Test oracle with open submission, strict about what it accepts.
/// @dev Rejects a price <= 0, a timestamp in the future, a timestamp that is
///  not newer than the last one, and a timestamp older than `maxStaleness`.
///  It stands in for a real feed on testnets; the real adapter must keep the
///  same guarantees.
contract MockOracle is IPriceOracle {
    error InvalidPrice(int256 price);
    error FutureTimestamp(uint256 timestamp, uint256 nowTs);
    error StaleTimestamp(uint256 timestamp, uint256 lastTimestamp, uint256 nowTs);
    error NoPrice();

    event PriceSubmitted(uint256 price, uint256 updatedAt);

    uint256 public immutable maxStaleness;

    uint256 private _price;
    uint256 private _updatedAt;

    constructor(uint256 maxStaleness_) {
        maxStaleness = maxStaleness_;
    }

    /// @param price_ Stable base units per whole token. Signed so a negative
    ///  feed value can be refused explicitly instead of wrapping.
    function submit(int256 price_, uint256 timestamp_) external {
        if (price_ <= 0) revert InvalidPrice(price_);
        if (timestamp_ > block.timestamp) revert FutureTimestamp(timestamp_, block.timestamp);
        if (timestamp_ <= _updatedAt || block.timestamp - timestamp_ > maxStaleness) {
            revert StaleTimestamp(timestamp_, _updatedAt, block.timestamp);
        }
        _price = uint256(price_);
        _updatedAt = timestamp_;
        emit PriceSubmitted(_price, _updatedAt);
    }

    function latest() external view returns (uint256 price, uint256 updatedAt) {
        if (_updatedAt == 0) revert NoPrice();
        return (_price, _updatedAt);
    }
}
