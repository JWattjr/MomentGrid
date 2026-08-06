// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IGridStore} from "./interfaces/IGridStore.sol";
import {e, ebool, euint256, inco} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";

/// @notice Inco Lightning implementation of the Moment Grid storage boundary.
/// @dev Nine uint8 moment ids are packed little-endian into one encrypted uint256.
///      Only validity, the marked-cell mask, and the completed-line count are
///      revealed after the round; the original grid handle stays confidential.
contract IncoGridStore is IGridStore {
    using e for *;

    struct ResolvedScore {
        uint16 markedMask;
        uint8 completedLines;
        bool validGrid;
        bool ready;
    }

    error Unauthorized();
    error InvalidController();
    error ControllerAlreadySet();
    error IncorrectIncoFee(uint256 expected, uint256 supplied);
    error GridAlreadyStored();
    error GridNotFound();
    error ScoreAlreadyPrepared();
    error ScoreNotPrepared();
    error ScoreNotResolved();
    error ResultWindowsMismatch();
    error InvalidDecryptionAttestation();

    uint256 private constant MOMENT_MASK = 0xff;
    uint256 private constant MARKED_MASK = 0x1ff;
    uint256 private constant LINE_SHIFT = 16;
    uint256 private constant VALID_SHIFT = 24;

    address public immutable owner;
    address public controller;

    mapping(uint256 roundId => mapping(address player => euint256 grid)) private _encryptedGrids;
    mapping(uint256 roundId => mapping(address player => uint256[3] pools)) private _tierPools;
    mapping(uint256 roundId => mapping(address player => euint256 score)) private _encryptedScores;
    mapping(uint256 roundId => mapping(address player => bytes32 hash)) private _resultHashes;
    mapping(uint256 roundId => mapping(address player => ResolvedScore score)) private _resolvedScores;

    event ControllerInitialized(address indexed controller);
    event EncryptedGridStored(uint256 indexed roundId, address indexed player, bytes32 indexed handle);
    event EncryptedScorePrepared(uint256 indexed roundId, address indexed player, bytes32 indexed handle);
    event ScoreResolved(
        uint256 indexed roundId, address indexed player, uint16 markedMask, uint8 completedLines, bool validGrid
    );

    constructor(address initialOwner) {
        if (initialOwner == address(0)) revert Unauthorized();
        owner = initialOwner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyController() {
        if (msg.sender != controller) revert Unauthorized();
        _;
    }

    function initializeController(address newController) external onlyOwner {
        if (controller != address(0)) revert ControllerAlreadySet();
        if (newController == address(0)) revert InvalidController();
        controller = newController;
        emit ControllerInitialized(newController);
    }

    function submissionFee() external view returns (uint256) {
        return inco.getFee();
    }

    function storeGrid(uint256 roundId, address player, bytes calldata encodedGrid, uint256[3] calldata tierPools)
        external
        payable
        onlyController
    {
        uint256 fee = inco.getFee();
        if (msg.value != fee) revert IncorrectIncoFee(fee, msg.value);
        if (euint256.unwrap(_encryptedGrids[roundId][player]) != bytes32(0)) revert GridAlreadyStored();

        euint256 grid = encodedGrid.newEuint256(player);
        grid.allowThis();
        _encryptedGrids[roundId][player] = grid;
        _tierPools[roundId][player] = tierPools;
        emit EncryptedGridStored(roundId, player, euint256.unwrap(grid));
    }

    /// @notice Builds and reveals one packed encrypted result:
    ///         bits 0..8 marked mask, bits 16..23 line count, bit 24 validity.
    /// @dev The keeper gets an attested reveal for the emitted handle and sends
    ///      it back through `submitScoreDecryption` before settling MomentGrid.
    function prepareScore(uint256 roundId, address player, uint256[3] calldata eventsByWindow)
        external
        onlyOwner
        returns (bytes32 handle)
    {
        euint256 grid = _encryptedGrids[roundId][player];
        if (euint256.unwrap(grid) == bytes32(0)) revert GridNotFound();
        if (euint256.unwrap(_encryptedScores[roundId][player]) != bytes32(0)) revert ScoreAlreadyPrepared();

        euint256 marked = uint256(0).asEuint256();
        ebool valid = true.asEbool();
        uint256[3] storage pools = _tierPools[roundId][player];

        for (uint8 cell; cell < 9; ++cell) {
            euint256 moment = grid.shr(uint256(cell) * 8).and(MOMENT_MASK);
            uint8 tier = cell / 3;
            uint8 column = cell % 3;
            euint256 momentBit = uint256(1).shl(moment);

            valid = valid.and(momentBit.and(pools[tier]).ne(0));
            ebool hit = momentBit.and(eventsByWindow[column]).ne(0);
            marked = marked.or(hit.asEuint256().mul(uint256(1) << cell));
        }

        euint256 lines = _countLines(marked);
        marked = valid.select(marked, uint256(0).asEuint256());
        lines = valid.select(lines, uint256(0).asEuint256());

        euint256 packed = marked.or(lines.shl(LINE_SHIFT)).or(valid.asEuint256().shl(VALID_SHIFT));
        packed.reveal();
        _encryptedScores[roundId][player] = packed;
        _resultHashes[roundId][player] = keccak256(abi.encode(eventsByWindow));
        handle = euint256.unwrap(packed);
        emit EncryptedScorePrepared(roundId, player, handle);
    }

    function submitScoreDecryption(
        uint256 roundId,
        address player,
        DecryptionAttestation calldata decryption,
        bytes[] calldata signatures
    ) external {
        euint256 encryptedScore = _encryptedScores[roundId][player];
        if (euint256.unwrap(encryptedScore) == bytes32(0)) revert ScoreNotPrepared();
        if (_resolvedScores[roundId][player].ready) revert ScoreAlreadyPrepared();

        uint256 packed = uint256(decryption.value);
        if (!encryptedScore.verifyDecryption(packed, signatures)) revert InvalidDecryptionAttestation();

        ResolvedScore memory resolved = ResolvedScore({
            markedMask: uint16(packed & MARKED_MASK),
            completedLines: uint8((packed >> LINE_SHIFT) & 0xff),
            validGrid: ((packed >> VALID_SHIFT) & 1) == 1,
            ready: true
        });
        _resolvedScores[roundId][player] = resolved;
        emit ScoreResolved(roundId, player, resolved.markedMask, resolved.completedLines, resolved.validGrid);
    }

    function scoreGrid(uint256 roundId, address player, uint256[3] calldata eventsByWindow)
        external
        view
        returns (uint16 markedMask, uint8 completedLines, bool validGrid)
    {
        ResolvedScore storage resolved = _resolvedScores[roundId][player];
        if (!resolved.ready) revert ScoreNotResolved();
        if (_resultHashes[roundId][player] != keccak256(abi.encode(eventsByWindow))) {
            revert ResultWindowsMismatch();
        }
        return (resolved.markedMask, resolved.completedLines, resolved.validGrid);
    }

    function encryptedGridHandle(uint256 roundId, address player) external view returns (bytes32) {
        return euint256.unwrap(_encryptedGrids[roundId][player]);
    }

    function encryptedScoreHandle(uint256 roundId, address player) external view returns (bytes32) {
        return euint256.unwrap(_encryptedScores[roundId][player]);
    }

    function resolvedScore(uint256 roundId, address player) external view returns (ResolvedScore memory) {
        return _resolvedScores[roundId][player];
    }

    function _countLines(euint256 marked) private returns (euint256 lines) {
        lines = uint256(0).asEuint256();
        uint16[8] memory masks = [
            uint16(0x007),
            uint16(0x038),
            uint16(0x1c0),
            uint16(0x049),
            uint16(0x092),
            uint16(0x124),
            uint16(0x111),
            uint16(0x054)
        ];
        for (uint8 i; i < 8; ++i) {
            lines = lines.add(marked.and(masks[i]).eq(masks[i]).asEuint256());
        }
    }
}
