// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IGridStore} from "./interfaces/IGridStore.sol";
import {LineScoring} from "./libraries/LineScoring.sol";
import {IERC20Minimal, IMegapot} from "./interfaces/IMegapot.sol";

/// @title Moment Grid
/// @notice Three-by-three football moment prediction rounds with equal pot splits.
contract MomentGrid {
    uint64 public constant PHASE_MINUTES = 30;
    uint64 public constant FULL_TIME_MINUTE = 90;

    enum RoundState {
        Open,
        Locked,
        Settled
    }

    struct Round {
        uint64 startMinute;
        uint128 entryFee;
        RoundState state;
        uint32 entrantCount;
        uint32 winnerCount;
        uint8 highScore;
        uint256 pot;
        uint256[3] tierPools;
        uint256[3] eventsByWindow;
    }

    error Unauthorized();
    error InvalidAddress();
    error InvalidRound();
    error InvalidRoundStart(uint64 supplied);
    error EmptyTierPool(uint8 tier);
    error RoundNotOpen();
    error RoundNotLocked();
    error NoEntrants();
    error AlreadyEntered();
    error IncorrectEntryFee(uint256 expected, uint256 supplied);
    error NothingToWithdraw();
    error WithdrawalFailed();
    error MegapotNotConfigured();
    error NotEnoughFragments(uint256 available);
    error MegapotTreasuryEmpty();
    error MegapotPurchaseFailed();
    error ReentrantCall();

    address public immutable owner;
    IGridStore public immutable gridStore;
    address public keeper;
    uint256 public roundCount;
    IMegapot public megapot;
    IERC20Minimal public megapotToken;
    address public megapotReferrer;
    uint256 public megapotTicketPrice;
    bool private _entered;

    mapping(uint256 roundId => Round round) private _rounds;
    mapping(uint256 roundId => address[] entrants) private _entrants;
    mapping(uint256 roundId => mapping(address player => bool entered)) public hasEntered;
    mapping(uint256 roundId => mapping(address player => uint16 mask)) public markedMask;
    mapping(uint256 roundId => mapping(address player => uint8 lines)) public completedLines;
    mapping(uint256 roundId => mapping(address player => bool valid)) public eligible;
    mapping(address player => uint256 count) public fragments;
    mapping(address player => uint256 count) public megapotTicketsPurchased;
    mapping(address player => uint256 amount) public claimable;

    event KeeperUpdated(address indexed keeper);
    event RoundCreated(uint256 indexed roundId, uint64 startMinute, uint128 entryFee);
    event GridSubmitted(uint256 indexed roundId, address indexed player);
    event RoundLocked(uint256 indexed roundId);
    event PlayerScored(
        uint256 indexed roundId, address indexed player, uint16 markedMask, uint8 completedLines, bool eligible
    );
    event RoundSettled(uint256 indexed roundId, uint8 highScore, uint32 winnerCount, uint256 pot);
    event WinningsWithdrawn(address indexed player, uint256 amount);
    event MegapotConfigured(address indexed megapot, address indexed token, address indexed referrer, uint256 price);
    event MegapotTicketPurchased(address indexed player, uint256 ticketNumber, uint256 price);

    constructor(IGridStore initialGridStore, address initialKeeper) {
        if (address(initialGridStore) == address(0) || initialKeeper == address(0)) {
            revert InvalidAddress();
        }
        owner = msg.sender;
        gridStore = initialGridStore;
        keeper = initialKeeper;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyKeeper() {
        if (msg.sender != keeper) revert Unauthorized();
        _;
    }

    modifier nonReentrant() {
        if (_entered) revert ReentrantCall();
        _entered = true;
        _;
        _entered = false;
    }

    function setKeeper(address newKeeper) external onlyOwner {
        if (newKeeper == address(0)) revert InvalidAddress();
        keeper = newKeeper;
        emit KeeperUpdated(newKeeper);
    }

    function configureMegapot(address lottery, address token, address referrer, uint256 ticketPrice)
        external
        onlyOwner
    {
        if (lottery == address(0) || token == address(0) || ticketPrice == 0) revert InvalidAddress();
        megapot = IMegapot(lottery);
        megapotToken = IERC20Minimal(token);
        megapotReferrer = referrer;
        megapotTicketPrice = ticketPrice;
        if (!megapotToken.approve(lottery, type(uint256).max)) revert MegapotPurchaseFailed();
        emit MegapotConfigured(lottery, token, referrer, ticketPrice);
    }

    function createRound(uint64 startMinute, uint128 entryFee, uint256[3] calldata tierPools)
        external
        onlyKeeper
        returns (uint256 roundId)
    {
        if (startMinute != 0) revert InvalidRoundStart(startMinute);
        for (uint8 tier; tier < 3; ++tier) {
            if (tierPools[tier] == 0) revert EmptyTierPool(tier);
        }

        roundId = ++roundCount;
        Round storage round = _rounds[roundId];
        round.startMinute = startMinute;
        round.entryFee = entryFee;
        round.tierPools = tierPools;
        emit RoundCreated(roundId, startMinute, entryFee);
    }

    function submitGrid(uint256 roundId, bytes calldata encodedGrid) external payable {
        Round storage round = _getRound(roundId);
        if (round.state != RoundState.Open) revert RoundNotOpen();
        if (hasEntered[roundId][msg.sender]) revert AlreadyEntered();
        uint256 storeFee = gridStore.submissionFee();
        uint256 expectedPayment = uint256(round.entryFee) + storeFee;
        if (msg.value != expectedPayment) {
            revert IncorrectEntryFee(expectedPayment, msg.value);
        }

        hasEntered[roundId][msg.sender] = true;
        _entrants[roundId].push(msg.sender);
        ++round.entrantCount;
        round.pot += round.entryFee;

        gridStore.storeGrid{value: storeFee}(roundId, msg.sender, encodedGrid, round.tierPools);
        emit GridSubmitted(roundId, msg.sender);
    }

    function lockRound(uint256 roundId) external onlyKeeper {
        Round storage round = _getRound(roundId);
        if (round.state != RoundState.Open) revert RoundNotOpen();
        if (round.entrantCount == 0) revert NoEntrants();
        round.state = RoundState.Locked;
        emit RoundLocked(roundId);
    }

    /// @notice Scores every player, accrues one fragment per line, then allocates
    ///         the entire pot equally among the highest scorers. If every score is
    ///         zero, every entrant is tied for first. Remainder wei go to tied
    ///         winners in submission order so no funds remain stranded.
    function settleRound(uint256 roundId, uint256[3] calldata eventsByWindow) external onlyKeeper {
        Round storage round = _getRound(roundId);
        if (round.state != RoundState.Locked) revert RoundNotLocked();
        round.state = RoundState.Settled;
        round.eventsByWindow = eventsByWindow;

        address[] storage players = _entrants[roundId];
        uint8 highScore;
        uint32 eligibleCount;

        for (uint256 i; i < players.length; ++i) {
            address player = players[i];
            (uint16 mask, uint8 lines, bool validGrid) = gridStore.scoreGrid(roundId, player, eventsByWindow);
            eligible[roundId][player] = validGrid;
            markedMask[roundId][player] = mask;
            completedLines[roundId][player] = lines;
            if (validGrid) {
                ++eligibleCount;
                fragments[player] += lines;
                if (lines > highScore) highScore = lines;
            }
            emit PlayerScored(roundId, player, mask, lines, validGrid);
        }

        if (eligibleCount == 0) {
            for (uint256 i; i < players.length; ++i) {
                claimable[players[i]] += round.entryFee;
            }
            emit RoundSettled(roundId, 0, 0, round.pot);
            return;
        }

        uint32 winnerCount;
        for (uint256 i; i < players.length; ++i) {
            address player = players[i];
            if (eligible[roundId][player] && completedLines[roundId][player] == highScore) ++winnerCount;
        }

        uint256 equalShare = round.pot / winnerCount;
        uint256 remainder = round.pot % winnerCount;
        for (uint256 i; i < players.length; ++i) {
            address player = players[i];
            if (!eligible[roundId][player] || completedLines[roundId][player] != highScore) continue;
            uint256 payout = equalShare;
            if (remainder != 0) {
                ++payout;
                --remainder;
            }
            claimable[player] += payout;
        }

        round.highScore = highScore;
        round.winnerCount = winnerCount;
        emit RoundSettled(roundId, highScore, winnerCount, round.pot);
    }

    function withdrawWinnings() external {
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        claimable[msg.sender] = 0;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert WithdrawalFailed();
        emit WinningsWithdrawn(msg.sender, amount);
    }

    /// @notice Burns four persistent fragments for one Megapot ticket.
    /// @dev Moment Grid must hold enough configured ticket token to sponsor it.
    function purchaseMegapotTicket() external nonReentrant {
        if (address(megapot) == address(0)) revert MegapotNotConfigured();
        uint256 available = fragments[msg.sender];
        if (available < 4) revert NotEnoughFragments(available);
        if (megapotToken.balanceOf(address(this)) < megapotTicketPrice) revert MegapotTreasuryEmpty();

        fragments[msg.sender] = available - 4;
        if (!megapot.purchaseTickets(megapotReferrer, megapotTicketPrice, msg.sender)) {
            revert MegapotPurchaseFailed();
        }
        uint256 ticketNumber = ++megapotTicketsPurchased[msg.sender];
        emit MegapotTicketPurchased(msg.sender, ticketNumber, megapotTicketPrice);
    }

    function countCompletedLines(uint16 mask) external pure returns (uint8) {
        return LineScoring.count(mask);
    }

    function windowFor(uint256 roundId, uint8 column) external view returns (uint64 startMinute, uint64 endMinute) {
        Round storage round = _getRound(roundId);
        if (column > 2) revert InvalidRound();
        startMinute = round.startMinute + uint64(column) * PHASE_MINUTES;
        endMinute = startMinute + PHASE_MINUTES;
    }

    function entrants(uint256 roundId) external view returns (address[] memory) {
        _getRound(roundId);
        return _entrants[roundId];
    }

    function roundDetails(uint256 roundId) external view returns (Round memory) {
        return _getRound(roundId);
    }

    function _getRound(uint256 roundId) internal view returns (Round storage round) {
        if (roundId == 0 || roundId > roundCount) revert InvalidRound();
        round = _rounds[roundId];
    }
}
