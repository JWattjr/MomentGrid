// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IGridStore} from "../../src/interfaces/IGridStore.sol";

/// @notice Grid store whose scoring result is dictated by the test.
/// @dev `PlaintextGridStore` validates tiers at storage time and always reports
///      a stored grid as eligible, so it can never drive MomentGrid's
///      all-ineligible refund branch. This mock can, and it can also charge a
///      non-zero submission fee so the native-value check is exercised the way
///      the real Inco store exercises it.
contract MockGridStore is IGridStore {
    uint256 private _fee;
    bool public reportEligible = true;
    uint16 public reportMask;
    uint8 public reportLines;

    mapping(uint256 roundId => mapping(address player => bytes grid)) public gridOf;

    function setSubmissionFee(uint256 newFee) external {
        _fee = newFee;
    }

    function setScore(uint16 mask, uint8 lines, bool eligible) external {
        reportMask = mask;
        reportLines = lines;
        reportEligible = eligible;
    }

    function submissionFee() external view returns (uint256) {
        return _fee;
    }

    function storeGrid(uint256 roundId, address player, bytes calldata encodedGrid, uint256[3] calldata)
        external
        payable
    {
        gridOf[roundId][player] = encodedGrid;
    }

    function scoreGrid(uint256, address, uint256[3] calldata)
        external
        view
        returns (uint16 markedMask, uint8 completedLines, bool validGrid)
    {
        return (reportMask, reportLines, reportEligible);
    }
}
