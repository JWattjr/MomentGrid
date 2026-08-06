// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Storage and scoring boundary for a player's 3x3 Moment Grid.
/// @dev `encodedGrid` is implementation-specific. The plaintext implementation
///      uses exactly nine bytes in row-major order, one uint8 moment id per cell.
interface IGridStore {
    /// @notice Native fee required in addition to the round entry fee.
    function submissionFee() external view returns (uint256);

    function storeGrid(uint256 roundId, address player, bytes calldata encodedGrid, uint256[3] calldata tierPools)
        external
        payable;

    /// @param eventsByWindow A 256-bit moment bitmap for each five-minute column.
    function scoreGrid(uint256 roundId, address player, uint256[3] calldata eventsByWindow)
        external
        view
        returns (uint16 markedMask, uint8 completedLines, bool validGrid);
}
