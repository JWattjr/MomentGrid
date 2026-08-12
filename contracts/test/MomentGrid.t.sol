// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Test} from "forge-std/Test.sol";
import {MomentGrid} from "../src/MomentGrid.sol";
import {PlaintextGridStore} from "../src/PlaintextGridStore.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockGridStore} from "./mocks/MockGridStore.sol";
import {MockMegapot} from "./mocks/MockMegapot.sol";

/// Entry fees, the pot and every payout are denominated in `usdc`, which has
/// six decimals — so `1_000_000` is one dollar. Some tests deliberately use tiny
/// raw amounts instead, because exact remainder arithmetic is easier to read at
/// that scale; the unit is the same either way.
contract MomentGridTest is Test {
    address private constant ALICE = address(0xA11CE);
    address private constant BOB = address(0xB0B);
    address private constant CAROL = address(0xCA201);

    uint128 private constant ONE_USDC = 1_000_000;

    MomentGrid private game;
    PlaintextGridStore private store;
    MockERC20 private usdc;

    function setUp() public {
        store = new PlaintextGridStore(address(this));
        usdc = new MockERC20("USD Coin", "USDC");
        game = new MomentGrid(store, IERC20(address(usdc)), address(this));
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
            assertEq(game.countCompletedLines(lineMasks[i]), 1, "line not detected once");
        }
    }

    function testPartialLinesDoNotScore() public view {
        assertEq(game.countCompletedLines(0x003), 0, "partial row scored");
        assertEq(game.countCompletedLines(0x041), 0, "partial column scored");
        assertEq(game.countCompletedLines(0x101), 0, "partial diagonal scored");
    }

    function testFullGridScoresAllEightLinesAndFragments() public {
        uint256 roundId = _createRound(11);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, 11);

        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(grid, 0x1ff));

        assertEq(game.markedMask(roundId, ALICE), 0x1ff, "full mask wrong");
        assertEq(game.completedLines(roundId, ALICE), 8, "full grid is eight lines");
        assertEq(game.fragments(ALICE), 8, "one fragment must accrue per line");
        assertEq(game.claimable(ALICE), 11, "single player should receive pot");
        _assertSolvent();
    }

    // --- the money path -----------------------------------------------------

    function testWinnerWithdrawsTheWholePotInUsdc() public {
        uint256 roundId = _createRound(ONE_USDC);
        bytes memory winningGrid = _gridA();
        _submit(roundId, ALICE, winningGrid, ONE_USDC);
        _submit(roundId, BOB, _gridB(), ONE_USDC);
        _submit(roundId, CAROL, _gridC(), ONE_USDC);

        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(winningGrid, 0x1ff));

        assertEq(game.payout(roundId, ALICE), 3 * ONE_USDC, "winner payout wrong");
        assertEq(game.payout(roundId, BOB), 0, "loser recorded a payout");
        assertEq(usdc.balanceOf(ALICE), 0, "winnings paid out before withdrawal");

        vm.prank(ALICE);
        game.withdrawWinnings();

        assertEq(usdc.balanceOf(ALICE), 3 * ONE_USDC, "winner did not receive the pot");
        assertEq(game.claimable(ALICE), 0, "claimable not cleared");
        assertEq(usdc.balanceOf(address(game)), 0, "pot stranded in the contract");
        assertEq(usdc.balanceOf(BOB), 0, "loser was paid");
    }

    /// The losers' side of the same round: entering costs real balance, and
    /// losing means it is gone.
    function testLoserEndsDownTheirStake() public {
        uint256 roundId = _createRound(ONE_USDC);
        bytes memory winningGrid = _gridA();
        _submit(roundId, ALICE, winningGrid, ONE_USDC);
        _submit(roundId, BOB, _gridB(), ONE_USDC);

        assertEq(usdc.balanceOf(BOB), 0, "stake not taken at submission");

        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(winningGrid, 0x1ff));

        assertEq(game.payout(roundId, BOB), 0, "loser owed something");
        assertEq(game.claimable(BOB), 0, "loser can claim");

        vm.prank(BOB);
        vm.expectRevert(MomentGrid.NothingToWithdraw.selector);
        game.withdrawWinnings();
    }

    function testWithdrawRevertsWhenNothingIsOwed() public {
        vm.prank(ALICE);
        vm.expectRevert(MomentGrid.NothingToWithdraw.selector);
        game.withdrawWinnings();
    }

    function testWithdrawCannotBeDrainedTwice() public {
        uint256 roundId = _createRound(ONE_USDC);
        _submit(roundId, ALICE, _gridA(), ONE_USDC);
        game.lockRound(roundId);
        uint256[3] memory noEvents;
        game.settleRound(roundId, noEvents);

        vm.prank(ALICE);
        game.withdrawWinnings();
        assertEq(usdc.balanceOf(ALICE), ONE_USDC, "first withdrawal wrong");

        vm.prank(ALICE);
        vm.expectRevert(MomentGrid.NothingToWithdraw.selector);
        game.withdrawWinnings();
        assertEq(usdc.balanceOf(ALICE), ONE_USDC, "second withdrawal paid again");
    }

    function testSubmitRequiresAnApproval() public {
        uint256 roundId = _createRound(ONE_USDC);
        usdc.mint(ALICE, ONE_USDC);

        vm.prank(ALICE);
        vm.expectRevert(
            abi.encodeWithSelector(MockERC20.InsufficientAllowance.selector, ALICE, address(game), 0, ONE_USDC)
        );
        game.submitGrid(roundId, _gridA());
    }

    function testSubmitRequiresEnoughBalanceEvenWhenApproved() public {
        uint256 roundId = _createRound(ONE_USDC);
        vm.prank(ALICE);
        usdc.approve(address(game), ONE_USDC);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MockERC20.InsufficientBalance.selector, ALICE, 0, ONE_USDC));
        game.submitGrid(roundId, _gridA());
    }

    /// The old contract bundled entry fee and store fee into `msg.value`. A
    /// caller still doing that must fail loudly rather than overpay in ETH and
    /// silently stake USDC as well.
    function testSubmitRejectsTheOldEntryFeePlusStoreFeeValue() public {
        uint256 roundId = _createRound(ONE_USDC);
        uint256 storeFee = store.submissionFee();
        usdc.mint(ALICE, ONE_USDC);
        vm.startPrank(ALICE);
        usdc.approve(address(game), ONE_USDC);
        vm.deal(ALICE, ONE_USDC + storeFee);
        vm.expectRevert(abi.encodeWithSelector(MomentGrid.IncorrectStoreFee.selector, storeFee, ONE_USDC + storeFee));
        game.submitGrid{value: ONE_USDC + storeFee}(roundId, _gridA());
        vm.stopPrank();
    }

    function testWinningsAccruedIsEmittedForWinnersAndRefunds() public {
        uint256 roundId = _createRound(ONE_USDC);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, ONE_USDC);
        game.lockRound(roundId);

        vm.expectEmit(true, true, false, true, address(game));
        emit MomentGrid.WinningsAccrued(roundId, ALICE, ONE_USDC, false);
        game.settleRound(roundId, _eventsForMask(grid, 0x1ff));
    }

    /// When no grid qualifies, every entrant gets their stake back rather than
    /// the pot being split or stranded.
    function testRefundBranchReturnsEveryStake() public {
        (MomentGrid voidGame, MockGridStore mockStore) = _gameWithMockStore();
        mockStore.setScore(0, 0, false);

        uint256 roundId = _createRoundOn(voidGame);
        _submitOn(voidGame, mockStore, roundId, ALICE);
        _submitOn(voidGame, mockStore, roundId, BOB);
        voidGame.lockRound(roundId);

        uint256[3] memory noEvents;
        vm.expectEmit(true, true, false, true, address(voidGame));
        emit MomentGrid.WinningsAccrued(roundId, ALICE, ONE_USDC, true);
        voidGame.settleRound(roundId, noEvents);

        assertEq(voidGame.payout(roundId, ALICE), ONE_USDC, "Alice refund wrong");
        assertEq(voidGame.payout(roundId, BOB), ONE_USDC, "Bob refund wrong");
        assertEq(voidGame.claimable(ALICE) + voidGame.claimable(BOB), 2 * ONE_USDC, "refunds do not sum to the pot");
        assertEq(usdc.balanceOf(address(voidGame)), 2 * ONE_USDC, "refund left the contract short");

        vm.prank(ALICE);
        voidGame.withdrawWinnings();
        assertEq(usdc.balanceOf(ALICE), ONE_USDC, "refund not paid out");
    }

    /// A store that charges a native fee — as the real Inco store does — must
    /// receive exactly that fee and nothing more.
    function testSubmitForwardsExactlyTheStoreFeeAsNativeValue() public {
        (MomentGrid feeGame, MockGridStore mockStore) = _gameWithMockStore();
        uint256 storeFee = 1e12;
        mockStore.setSubmissionFee(storeFee);

        uint256 roundId = _createRoundOn(feeGame);
        usdc.mint(ALICE, ONE_USDC);
        vm.deal(ALICE, storeFee);
        vm.startPrank(ALICE);
        usdc.approve(address(feeGame), ONE_USDC);
        feeGame.submitGrid{value: storeFee}(roundId, _gridA());
        vm.stopPrank();

        assertEq(address(mockStore).balance, storeFee, "store did not receive its fee");
        assertEq(address(feeGame).balance, 0, "game retained native value");
        assertEq(usdc.balanceOf(address(feeGame)), ONE_USDC, "stake did not reach the pot");
    }

    function testSubmitRejectsAMissingStoreFee() public {
        (MomentGrid feeGame, MockGridStore mockStore) = _gameWithMockStore();
        mockStore.setSubmissionFee(1e12);

        uint256 roundId = _createRoundOn(feeGame);
        usdc.mint(ALICE, ONE_USDC);
        vm.startPrank(ALICE);
        usdc.approve(address(feeGame), ONE_USDC);
        vm.expectRevert(abi.encodeWithSelector(MomentGrid.IncorrectStoreFee.selector, uint256(1e12), uint256(0)));
        feeGame.submitGrid(roundId, _gridA());
        vm.stopPrank();
    }

    function testRoundOutcomeOfReportsTheWholeResult() public {
        uint256 roundId = _createRound(ONE_USDC);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, ONE_USDC);
        _submit(roundId, BOB, _gridB(), ONE_USDC);
        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(grid, 0x1ff));

        (uint8 lines, bool isEligible, uint256 amount, uint256 claimableTotal) = game.roundOutcomeOf(roundId, ALICE);
        assertEq(lines, 8, "winner lines wrong");
        assertTrue(isEligible, "winner marked ineligible");
        assertEq(amount, 2 * ONE_USDC, "winner amount wrong");
        assertEq(claimableTotal, 2 * ONE_USDC, "winner claimable wrong");

        (uint8 loserLines,, uint256 loserAmount, uint256 loserClaimable) = game.roundOutcomeOf(roundId, BOB);
        assertEq(loserLines, 0, "loser lines wrong");
        assertEq(loserAmount, 0, "loser amount wrong");
        assertEq(loserClaimable, 0, "loser claimable wrong");
    }

    function testConfigureMegapotRejectsTheEntryToken() public {
        MockMegapot lottery = new MockMegapot(usdc);
        vm.expectRevert(MomentGrid.MegapotTokenConflict.selector);
        game.configureMegapot(address(lottery), address(usdc), address(0), ONE_USDC);
    }

    // --- Megapot ------------------------------------------------------------

    function testFourFragmentsPurchaseOneMegapotTicket() public {
        uint256 roundId = _createRound(0);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, 0);
        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(grid, 0x1ff));

        (MockERC20 ticketToken, MockMegapot lottery) = _configureMegapot(address(0xBEEF));
        ticketToken.mint(address(game), 2 * ONE_USDC);

        vm.prank(ALICE);
        game.purchaseMegapotTicket();

        assertEq(game.fragments(ALICE), 4, "ticket did not burn four fragments");
        assertEq(game.megapotTicketsPurchased(ALICE), 1, "ticket count wrong");
        assertEq(lottery.ticketsOf(ALICE), 1, "recipient wrong");
        assertEq(lottery.lastReferrer(), address(0xBEEF), "referrer wrong");

        vm.prank(ALICE);
        game.purchaseMegapotTicket();
        assertEq(game.fragments(ALICE), 0, "second ticket fragment balance wrong");
        assertEq(game.megapotTicketsPurchased(ALICE), 2, "second ticket count wrong");
    }

    function testMegapotPurchaseRejectsFewerThanFourFragments() public {
        (MockERC20 ticketToken,) = _configureMegapot(address(0));
        ticketToken.mint(address(game), ONE_USDC);

        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(MomentGrid.NotEnoughFragments.selector, uint256(0)));
        game.purchaseMegapotTicket();
    }

    /// Ticket purchases must never reach for the pot, even when the treasury is
    /// empty and the entry token sits in the same contract.
    function testMegapotPurchaseCannotSpendThePot() public {
        uint256 roundId = _createRound(ONE_USDC);
        bytes memory grid = _gridA();
        _submit(roundId, ALICE, grid, ONE_USDC);
        game.lockRound(roundId);
        game.settleRound(roundId, _eventsForMask(grid, 0x1ff));

        _configureMegapot(address(0));

        vm.prank(ALICE);
        vm.expectRevert(MomentGrid.MegapotTreasuryEmpty.selector);
        game.purchaseMegapotTicket();
        _assertSolvent();
    }

    // --- scoring and round lifecycle ---------------------------------------

    function testHighestScoreTieSplitsEntirePotAndAccruesFragments() public {
        uint256 roundId = _createRound(5);
        bytes memory gridA = _gridA();
        bytes memory gridB = _gridB();
        _submit(roundId, ALICE, gridA, 5);
        _submit(roundId, BOB, gridB, 5);
        _submit(roundId, CAROL, _gridC(), 5);

        game.lockRound(roundId);
        uint256[3] memory aliceEvents = _eventsForMask(gridA, 0x007);
        uint256[3] memory bobEvents = _eventsForMask(gridB, 0x007);
        uint256[3] memory eventsByWindow;
        for (uint256 i; i < 3; ++i) {
            eventsByWindow[i] = aliceEvents[i] | bobEvents[i];
        }
        game.settleRound(roundId, eventsByWindow);

        assertEq(game.completedLines(roundId, ALICE), 1, "Alice score wrong");
        assertEq(game.completedLines(roundId, BOB), 1, "Bob score wrong");
        assertEq(game.completedLines(roundId, CAROL), 0, "Carol should lose");
        assertEq(game.fragments(ALICE), 1, "Alice fragment wrong");
        assertEq(game.fragments(CAROL), 0, "Carol fragment wrong");
        // Pot of 15 across two winners: the odd unit goes to the earlier entrant.
        assertEq(game.claimable(ALICE), 8, "first tied winner gets the remainder unit");
        assertEq(game.claimable(BOB), 7, "second tied winner share wrong");
        assertEq(game.claimable(CAROL), 0, "loser received payout");

        MomentGrid.Round memory round = game.roundDetails(roundId);
        assertEq(round.highScore, 1, "high score wrong");
        assertEq(round.winnerCount, 2, "winner count wrong");
        assertEq(game.claimable(ALICE) + game.claimable(BOB), round.pot, "pot dust stranded");
        _assertSolvent();
    }

    function testZeroLinesIsATieAcrossAllEntrants() public {
        uint256 roundId = _createRound(9);
        _submit(roundId, ALICE, _gridA(), 9);
        _submit(roundId, BOB, _gridB(), 9);
        game.lockRound(roundId);

        uint256[3] memory noEvents;
        game.settleRound(roundId, noEvents);

        assertEq(game.completedLines(roundId, ALICE), 0, "Alice zero score wrong");
        assertEq(game.fragments(ALICE), 0, "zero lines accrued a fragment");
        assertEq(game.claimable(ALICE), 9, "Alice zero-score tie share wrong");
        assertEq(game.claimable(BOB), 9, "Bob zero-score tie share wrong");
        _assertSolvent();
    }

    function testSingleEntrantWinsEvenWithZeroLines() public {
        uint256 roundId = _createRound(7);
        _submit(roundId, ALICE, _gridA(), 7);
        game.lockRound(roundId);

        uint256[3] memory noEvents;
        game.settleRound(roundId, noEvents);

        assertEq(game.claimable(ALICE), 7, "single entrant did not receive full pot");
        MomentGrid.Round memory round = game.roundDetails(roundId);
        assertEq(round.winnerCount, 1, "single entrant not declared winner");
    }

    function testGridIsStoredAsNinePlaintextBytes() public {
        uint256 roundId = _createRound(0);
        bytes memory expected = _gridA();
        _submit(roundId, ALICE, expected, 0);
        assertEq(store.gridOf(roundId, ALICE), expected, "stored plaintext differs");
    }

    function testRejectsGridThatDoesNotFillEveryCell() public {
        uint256 roundId = _createRound(0);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(PlaintextGridStore.InvalidGridLength.selector, uint256(3)));
        game.submitGrid(roundId, hex"010203");
    }

    function testRejectsMomentFromWrongRowTier() public {
        uint256 roundId = _createRound(0);
        vm.prank(ALICE);
        vm.expectRevert(abi.encodeWithSelector(PlaintextGridStore.InvalidMomentForTier.selector, uint8(0), uint8(4)));
        game.submitGrid(roundId, hex"040203040506070809");
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
        assertEq(start0, 0, "column zero start wrong");
        assertEq(end0, 30, "column zero end wrong");
        assertEq(start1, 30, "column one start wrong");
        assertEq(end1, 60, "column one end wrong");
        assertEq(start2, 60, "column two start wrong");
        assertEq(end2, 90, "column two end wrong");
    }

    function testRoundRejectsAWindowThatDoesNotStartAtKickoff() public {
        uint256[3] memory pools;
        pools[0] = _bitmap(1);
        pools[1] = _bitmap(4);
        pools[2] = _bitmap(7);
        vm.expectRevert(abi.encodeWithSelector(MomentGrid.InvalidRoundStart.selector, uint64(60)));
        game.createRound(60, 0, pools);
    }

    function testConstructorRejectsAZeroEntryToken() public {
        PlaintextGridStore freshStore = new PlaintextGridStore(address(this));
        vm.expectRevert(MomentGrid.InvalidAddress.selector);
        new MomentGrid(freshStore, IERC20(address(0)), address(this));
    }

    // --- helpers ------------------------------------------------------------

    function _createRound(uint128 entryFee) private returns (uint256) {
        uint256[3] memory pools;
        pools[0] = _bitmap(1) | _bitmap(2) | _bitmap(3);
        pools[1] = _bitmap(4) | _bitmap(5) | _bitmap(6);
        pools[2] = _bitmap(7) | _bitmap(8) | _bitmap(9);
        return game.createRound(0, entryFee, pools);
    }

    function _submit(uint256 roundId, address player, bytes memory grid, uint128 fee) private {
        uint256 storeFee = store.submissionFee();
        usdc.mint(player, fee);
        vm.deal(player, storeFee);
        vm.startPrank(player);
        usdc.approve(address(game), fee);
        game.submitGrid{value: storeFee}(roundId, grid);
        vm.stopPrank();
    }

    /// A second game wired to a store whose scoring result and fee the test
    /// controls, for the paths `PlaintextGridStore` cannot reach.
    function _gameWithMockStore() private returns (MomentGrid mockGame, MockGridStore mockStore) {
        mockStore = new MockGridStore();
        mockGame = new MomentGrid(mockStore, IERC20(address(usdc)), address(this));
    }

    function _createRoundOn(MomentGrid target) private returns (uint256) {
        uint256[3] memory pools;
        pools[0] = _bitmap(1) | _bitmap(2) | _bitmap(3);
        pools[1] = _bitmap(4) | _bitmap(5) | _bitmap(6);
        pools[2] = _bitmap(7) | _bitmap(8) | _bitmap(9);
        return target.createRound(0, ONE_USDC, pools);
    }

    function _submitOn(MomentGrid target, MockGridStore mockStore, uint256 roundId, address player) private {
        uint256 storeFee = mockStore.submissionFee();
        usdc.mint(player, ONE_USDC);
        vm.deal(player, storeFee);
        vm.startPrank(player);
        usdc.approve(address(target), ONE_USDC);
        target.submitGrid{value: storeFee}(roundId, _gridA());
        vm.stopPrank();
    }

    function _configureMegapot(address referrer) private returns (MockERC20 token, MockMegapot lottery) {
        token = new MockERC20("Megapot USDC", "MPUSDC");
        lottery = new MockMegapot(token);
        game.configureMegapot(address(lottery), address(token), referrer, ONE_USDC);
    }

    /// Every unit the contract holds must be owed to somebody. Asserted after
    /// each payout path so a rounding slip cannot strand funds unnoticed.
    function _assertSolvent() private view {
        uint256 owed = game.claimable(ALICE) + game.claimable(BOB) + game.claimable(CAROL);
        assertEq(usdc.balanceOf(address(game)), owed, "contract balance does not match what it owes");
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
}
