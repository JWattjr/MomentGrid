// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IGridStore} from "./interfaces/IGridStore.sol";
import {LineScoring} from "./libraries/LineScoring.sol";

/// @notice Permanent plaintext reference implementation of IGridStore.
/// @dev Grids are nine bytes in row-major order. This contract intentionally
///      keeps `gridOf` public so encrypted scoring can be checked against it.
contract PlaintextGridStore is IGridStore {
    error Unauthorized();
    error InvalidController();
    error ControllerAlreadySet();
    error InvalidGridLength(uint256 suppliedLength);
    error InvalidMomentForTier(uint8 cell, uint8 momentId);
    error GridAlreadyStored();
    error GridNotFound();

    address public immutable owner;
    address public controller;

    mapping(uint256 roundId => mapping(address player => bytes grid)) private _grids;

    event ControllerInitialized(address indexed controller);
    event GridStored(uint256 indexed roundId, address indexed player, bytes grid);

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert Unauthorized();
        owner = initialOwner;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    /// @notice Connects this store to its MomentGrid deployment exactly once.
    function initializeController(address newController) external {
        if (msg.sender != owner) revert Unauthorized();
        if (controller != address(0)) revert ControllerAlreadySet();
        if (newController == address(0)) revert InvalidController();
        controller = newController;
        emit ControllerInitialized(newController);
    }

    function submissionFee() external pure returns (uint256) {
        return 0;
    }

    function storeGrid(uint256 roundId, address player, bytes calldata encodedGrid, uint256[3] calldata tierPools)
        external
        payable
        onlyController
    {
        if (encodedGrid.length != 9) revert InvalidGridLength(encodedGrid.length);
        if (_grids[roundId][player].length != 0) revert GridAlreadyStored();

        for (uint8 cell; cell < 9; ++cell) {
            uint8 momentId = uint8(encodedGrid[cell]);
            uint8 tier = cell / 3;
            if (tierPools[tier] & (uint256(1) << momentId) == 0) {
                revert InvalidMomentForTier(cell, momentId);
            }
        }

        _grids[roundId][player] = encodedGrid;
        emit GridStored(roundId, player, encodedGrid);
    }

    function scoreGrid(uint256 roundId, address player, uint256[3] calldata eventsByWindow)
        external
        view
        returns (uint16 markedMask, uint8 completedLines, bool validGrid)
    {
        bytes storage grid = _grids[roundId][player];
        if (grid.length == 0) revert GridNotFound();

        for (uint8 cell; cell < 9; ++cell) {
            uint8 column = cell % 3;
            uint8 momentId = uint8(grid[cell]);
            if (eventsByWindow[column] & (uint256(1) << momentId) != 0) {
                markedMask |= uint16(1) << cell;
            }
        }

        completedLines = LineScoring.count(markedMask);
        validGrid = true;
    }

    function gridOf(uint256 roundId, address player) external view returns (bytes memory) {
        return _grids[roundId][player];
    }
}
