// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MomentGrid} from "../src/MomentGrid.sol";
import {PlaintextGridStore} from "../src/PlaintextGridStore.sol";

contract MockMegapotToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        require(allowance[from][msg.sender] >= amount, "allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract MockMegapot {
    MockMegapotToken private immutable _token;
    address public lastReferrer;
    address public lastRecipient;
    uint256 public lastValue;
    uint256 public purchaseCount;

    constructor(MockMegapotToken token) {
        _token = token;
    }

    function purchaseTickets(address referrer, uint256 value, address recipient) external returns (bool) {
        _token.transferFrom(msg.sender, address(this), value);
        lastReferrer = referrer;
        lastRecipient = recipient;
        lastValue = value;
        ++purchaseCount;
        return true;
    }
}

interface Vm {
    function deal(address account, uint256 newBalance) external;
    function prank(address sender) external;
    function expectRevert(bytes4 selector) external;
    function expectRevert(bytes calldata revertData) external;
}

contract MomentGridTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA201);

    MomentGrid private game;
    PlaintextGridStore private store;

    function setUp() public {
        store = new PlaintextGridStore(address(this));
        game = new MomentGrid(store, address(this));
        store.initializeController(address(game));
    }

    function testDetectsEachOfTheEightLines() public view {
        uint16[8] memory lineMasks = [
            uint16(0x007),
            uint16(0x038),
            uint16(0x1c0),
            uint16(0x049),
            uint16(0x092),
            uint16(0x124),
            uint16(0x111),
            uint16(0x054)
        ];

        for (uint256 i; i < lineMasks.length; ++i) {
            _assertEq(game.countCompletedLines(lineMasks[i]), 1, "line not detected once");
        }
    }

    function testPartialLinesDoNotScore() public view {
        _assertEq(game.countCompletedLines(0x003), 0, "partial row scored");
        _assertEq(game.countCompletedLines(0x041), 0, "partial column scored");
        _assertEq(game.countCompletedLines(0x101), 0, "partial diagonal scored");
    }

    function testFullGridScoresAllEightLinesAndFragments() public {
        uint256 roundId = _createRound(11);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, 11);

        game.lockRound(roundId);
        uint256[3] memory eventsByWindow = _eventsForMask(grid, 0x1ff);
        game.settleRound(roundId, eventsByWindow);

        _assertEq(game.markedMask(roundId, ALICE), 0x1ff, "full mask wrong");
        _assertEq(game.completedLines(roundId, ALICE), 8, "full grid is eight lines");
        _assertEq(game.fragments(ALICE), 8, "one fragment must accrue per line");
        _assertEq(game.claimable(ALICE), 11, "single player should receive pot");
    }

    function testFourFragmentsPurchaseOneMegapotTicket() public {
        uint256 roundId = _createRound(0);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, 0);
        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(grid, 0x1ff));

        MockMegapotToken token = new MockMegapotToken();
        MockMegapot lottery = new MockMegapot(token);
        address referrer = address(0xBEEF);
        game.configureMegapot(address(lottery), address(token), referrer, 1_000_000);
        token.mint(address(game), 2_000_000);

        vm.prank(ALICE);
        game.purchaseMegapotTicket();

        _assertEq(game.fragments(ALICE), 4, "ticket did not burn four fragments");
        _assertEq(game.megapotTicketsPurchased(ALICE), 1, "ticket count wrong");
        _assertEq(uint256(uint160(lottery.lastRecipient())), uint256(uint160(ALICE)), "recipient wrong");
        _assertEq(uint256(uint160(lottery.lastReferrer())), uint256(uint160(referrer)), "referrer wrong");
        _assertEq(lottery.lastValue(), 1_000_000, "ticket price wrong");

        vm.prank(ALICE);
        game.purchaseMegapotTicket();
        _assertEq(game.fragments(ALICE), 0, "second ticket fragment balance wrong");
        _assertEq(game.megapotTicketsPurchased(ALICE), 2, "second ticket count wrong");
    }

    function testMegapotPurchaseRejectsFewerThanFourFragments() public {
        MockMegapotToken token = new MockMegapotToken();
        MockMegapot lottery = new MockMegapot(token);
        game.configureMegapot(address(lottery), address(token), address(0), 1_000_000);
        token.mint(address(game), 1_000_000);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MomentGrid.NotEnoughFragments.selector, uint256(0)));
        game.purchaseMegapotTicket();
    }

    function testHighestScoreTieSplitsEntirePotAndAccruesFragments() public {
        uint256 roundId = _createRound(5);
        bytes memory gridA = _gridA();
        bytes memory gridB = _gridB();
        bytes memory gridC = _gridC();
        _submit(roundId, ALICE, gridA, 5);
        _submit(roundId, BOB, gridB, 5);
        _submit(roundId, CAROL, gridC, 5);

        game.lockRound(roundId);
        uint256[3] memory aliceEvents = _eventsForMask(gridA, 0x007);
        uint256[3] memory bobEvents = _eventsForMask(gridB, 0x007);
        uint256[3] memory eventsByWindow;
        for (uint256 i; i < 3; ++i) {
            eventsByWindow[i] = aliceEvents[i] | bobEvents[i];
        }
        game.settleRound(roundId, eventsByWindow);

        _assertEq(game.completedLines(roundId, ALICE), 1, "Alice score wrong");
        _assertEq(game.completedLines(roundId, BOB), 1, "Bob score wrong");
        _assertEq(game.completedLines(roundId, CAROL), 0, "Carol should lose");
        _assertEq(game.fragments(ALICE), 1, "Alice fragment wrong");
        _assertEq(game.fragments(BOB), 1, "Bob fragment wrong");
        _assertEq(game.fragments(CAROL), 0, "Carol fragment wrong");
        _assertEq(game.claimable(ALICE), 8, "first tied winner gets remainder wei");
        _assertEq(game.claimable(BOB), 7, "second tied winner share wrong");
        _assertEq(game.claimable(CAROL), 0, "loser received payout");

        MomentGrid.Round memory round = game.roundDetails(roundId);
        _assertEq(round.highScore, 1, "high score wrong");
        _assertEq(round.winnerCount, 2, "winner count wrong");
        _assertEq(game.claimable(ALICE) + game.claimable(BOB), round.pot, "pot dust stranded");
    }

    function testZeroLinesIsATieAcrossAllEntrants() public {
        uint256 roundId = _createRound(9);
        _submit(roundId, ALICE, _gridA(), 9);
        _submit(roundId, BOB, _gridB(), 9);
        game.lockRound(roundId);

        uint256[3] memory noEvents;
        game.settleRound(roundId, noEvents);

        _assertEq(game.completedLines(roundId, ALICE), 0, "Alice zero score wrong");
        _assertEq(game.completedLines(roundId, BOB), 0, "Bob zero score wrong");
        _assertEq(game.fragments(ALICE), 0, "zero lines accrued a fragment");
        _assertEq(game.fragments(BOB), 0, "zero lines accrued a fragment");
        _assertEq(game.claimable(ALICE), 9, "Alice zero-score tie share wrong");
        _assertEq(game.claimable(BOB), 9, "Bob zero-score tie share wrong");
    }

    function testSingleEntrantWinsEvenWithZeroLines() public {
        uint256 roundId = _createRound(7);
        _submit(roundId, ALICE, _gridA(), 7);
        game.lockRound(roundId);

        uint256[3] memory noEvents;
        game.settleRound(roundId, noEvents);

        _assertEq(game.claimable(ALICE), 7, "single entrant did not receive full pot");
        MomentGrid.Round memory round = game.roundDetails(roundId);
        _assertEq(round.winnerCount, 1, "single entrant not declared winner");
    }

    function testGridIsStoredAsNinePlaintextBytes() public {
        uint256 roundId = _createRound(0);
        bytes memory expected = _gridA();
        _submit(roundId, ALICE, expected, 0);
        bytes memory actual = store.gridOf(roundId, ALICE);
        _assertEq(keccak256(actual), keccak256(expected), "stored plaintext differs");
    }

    function testRejectsGridThatDoesNotFillEveryCell() public {
        uint256 roundId = _createRound(0);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(PlaintextGridStore.InvalidGridLength.selector, uint256(3)));
        game.submitGrid(roundId, hex"010203");
    }

    function testRejectsMomentFromWrongRowTier() public {
        uint256 roundId = _createRound(0);
        bytes memory invalidGrid = hex"040203040506070809";
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(PlaintextGridStore.InvalidMomentForTier.selector, uint8(0), uint8(4)));
        game.submitGrid(roundId, invalidGrid);
    }

    function testRejectsDuplicateEntry() public {
        uint256 roundId = _createRound(0);
        _submit(roundId, ALICE, _gridA(), 0);
        vm.prank(ALICE);
        vm.expectRevert(MomentGrid.AlreadyEntered.selector);
        game.submitGrid(roundId, _gridA());
    }

    function testCannotLockRoundWithoutEntrants() public {
        uint256 roundId = _createRound(0);
        vm.expectRevert(MomentGrid.NoEntrants.selector);
        game.lockRound(roundId);
    }

    function testCannotSubmitAfterLockOrSettleTwice() public {
        uint256 roundId = _createRound(0);
        _submit(roundId, ALICE, _gridA(), 0);
        game.lockRound(roundId);

        vm.prank(BOB);
        vm.expectRevert(MomentGrid.RoundNotOpen.selector);
        game.submitGrid(roundId, _gridB());

        uint256[3] memory noEvents;
        game.settleRound(roundId, noEvents);
        vm.expectRevert(MomentGrid.RoundNotLocked.selector);
        game.settleRound(roundId, noEvents);
    }

    function testRoundCoversThreeConsecutiveThirtyMinutePhases() public {
        uint256 roundId = _createRound(0);
        (uint64 start0, uint64 end0) = game.windowFor(roundId, 0);
        (uint64 start1, uint64 end1) = game.windowFor(roundId, 1);
        (uint64 start2, uint64 end2) = game.windowFor(roundId, 2);
        _assertEq(start0, 0, "column zero start wrong");
        _assertEq(end0, 30, "column zero end wrong");
        _assertEq(start1, 30, "column one start wrong");
        _assertEq(end1, 60, "column one end wrong");
        _assertEq(start2, 60, "column two start wrong");
        _assertEq(end2, 90, "column two end wrong");
    }

    function testRoundRejectsAWindowThatDoesNotStartAtKickoff() public {
        uint256[3] memory pools;
        pools[0] = _bitmap(1);
        pools[1] = _bitmap(4);
        pools[2] = _bitmap(7);
        vm.expectRevert(abi.encodeWithSelector(MomentGrid.InvalidRoundStart.selector, uint64(60)));
        game.createRound(60, 0, pools);
    }

    function _createRound(uint128 entryFee) private returns (uint256) {
        uint256[3] memory pools;
        pools[0] = _bitmap(1) | _bitmap(2) | _bitmap(3);
        pools[1] = _bitmap(4) | _bitmap(5) | _bitmap(6);
        pools[2] = _bitmap(7) | _bitmap(8) | _bitmap(9);
        return game.createRound(0, entryFee, pools);
    }

    function _submit(uint256 roundId, address player, bytes memory grid, uint256 fee) private {
        vm.deal(player, fee);
        vm.prank(player);
        game.submitGrid{value: fee}(roundId, grid);
    }

    function _eventsForMask(bytes memory grid, uint16 mask) private pure returns (uint256[3] memory eventsByWindow) {
        for (uint8 cell; cell < 9; ++cell) {
            if (mask & (uint16(1) << cell) == 0) continue;
            uint8 column = cell % 3;
            eventsByWindow[column] |= _bitmap(uint8(grid[cell]));
        }
    }

    function _gridA() private pure returns (bytes memory) {
        return hex"010203040506070809";
    }

    function _gridB() private pure returns (bytes memory) {
        return hex"020301050604080907";
    }

    function _gridC() private pure returns (bytes memory) {
        return hex"030102060405090708";
    }

    function _bitmap(uint8 momentId) private pure returns (uint256) {
        return uint256(1) << momentId;
    }

    function _assertEq(uint256 actual, uint256 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }

    function _assertEq(bytes32 actual, bytes32 expected, string memory reason) private pure {
        require(actual == expected, reason);
    }
}
