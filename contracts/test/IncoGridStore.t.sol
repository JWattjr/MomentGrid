// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IncoGridStore} from "../src/IncoGridStore.sol";
import {IncoTest} from "@inco/lightning/src/test/IncoTest.sol";
import {inco} from "@inco/lightning/src/Lib.sol";
import {DecryptionAttestation} from "@inco/lightning/src/lightning-parts/DecryptionAttester.types.sol";

contract IncoGridStoreTest is IncoTest {
    IncoGridStore private store;
    address private constant PLAYER = address(0xA11CE);

    function setUp() public override {
        super.setUp();
        store = new IncoGridStore(address(this));
        store.initializeController(address(this));
        vm.deal(address(this), 100 ether);
    }

    function testEncryptedGridScoresAFullGridWithoutRevealingPicks() public {
        uint256[3] memory pools = _pools();
        bytes memory ciphertext = fakePrepareEuint256Ciphertext(_packedGridA(), PLAYER, address(store));
        store.storeGrid{value: inco.getFee()}(1, PLAYER, ciphertext, pools);
        processAllOperations();

        uint256[3] memory eventsByWindow;
        eventsByWindow[0] = _bitmap(1) | _bitmap(4) | _bitmap(7);
        eventsByWindow[1] = _bitmap(2) | _bitmap(5) | _bitmap(8);
        eventsByWindow[2] = _bitmap(3) | _bitmap(6) | _bitmap(9);
        bytes32 handle = store.prepareScore(1, PLAYER, eventsByWindow);
        processAllOperations();

        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(address(this), HandleWithProof({handle: handle, proof: _emptyAllowanceProof()}));
        store.submitScoreDecryption(1, PLAYER, attestation, signatures);

        (uint16 mask, uint8 lines, bool valid) = store.scoreGrid(1, PLAYER, eventsByWindow);
        assertEq(mask, 0x1ff);
        assertEq(lines, 8);
        assertTrue(valid);
        assertNotEq(store.encryptedGridHandle(1, PLAYER), bytes32(_packedGridA()));
    }

    function testWrongTierPickIsConfidentiallyDisqualified() public {
        uint256[3] memory pools = _pools();
        uint256 invalidPackedGrid = (_packedGridA() & ~uint256(0xff)) | uint256(4);
        bytes memory ciphertext = fakePrepareEuint256Ciphertext(invalidPackedGrid, PLAYER, address(store));
        store.storeGrid{value: inco.getFee()}(2, PLAYER, ciphertext, pools);
        processAllOperations();

        uint256[3] memory eventsByWindow;
        eventsByWindow[0] = type(uint256).max;
        eventsByWindow[1] = type(uint256).max;
        eventsByWindow[2] = type(uint256).max;
        bytes32 handle = store.prepareScore(2, PLAYER, eventsByWindow);
        processAllOperations();

        (DecryptionAttestation memory attestation, bytes[] memory signatures) =
            getDecryptionAttestation(address(this), HandleWithProof({handle: handle, proof: _emptyAllowanceProof()}));
        store.submitScoreDecryption(2, PLAYER, attestation, signatures);

        (uint16 mask, uint8 lines, bool valid) = store.scoreGrid(2, PLAYER, eventsByWindow);
        assertEq(mask, 0);
        assertEq(lines, 0);
        assertFalse(valid);
    }

    function _packedGridA() private pure returns (uint256 packed) {
        for (uint8 cell; cell < 9; ++cell) {
            packed |= uint256(cell + 1) << (uint256(cell) * 8);
        }
    }

    function _pools() private pure returns (uint256[3] memory pools) {
        pools[0] = _bitmap(1) | _bitmap(2) | _bitmap(3);
        pools[1] = _bitmap(4) | _bitmap(5) | _bitmap(6);
        pools[2] = _bitmap(7) | _bitmap(8) | _bitmap(9);
    }

    function _bitmap(uint8 momentId) private pure returns (uint256) {
        return uint256(1) << momentId;
    }
}
