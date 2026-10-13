// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal price feed the escrow reads at each observation.
interface IPriceOracle {
    /// @return price Stable base units per ONE whole underlying token. Always > 0.
    /// @return updatedAt Unix time the price belongs to. Never in the future.
    /// @dev MUST revert rather than return a zero price or a zero timestamp.
    function latest() external view returns (uint256 price, uint256 updatedAt);
}
