// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PlaintextGridStore} from "../src/PlaintextGridStore.sol";

interface Vm {
    function readFile(string calldata path) external view returns (string memory);
    function parseJsonUint(string calldata json, string calldata key) external pure returns (uint256);
    function parseJsonUintArray(string calldata json, string calldata key) external pure returns (uint256[] memory);
    function parseJsonBool(string calldata json, string calldata key) external pure returns (bool);
    function parseJsonString(string calldata json, string calldata key) external pure returns (string memory);
    function toString(uint256 value) external pure returns (string memory);
}

/// @notice Proves the TypeScript and Solidity scoring implementations agree.
/// @dev Reads the same `shared/fixtures/scoring-vectors.json` that the shared
///      scoring package asserts against, so a change to the prediction set that
///      is not mirrored on chain fails here. This is the reason
///      `PlaintextGridStore` is kept permanently: it is the reference
///      implementation the confidential path is checked against.
contract ScoringParityTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
    string private constant VECTORS = "../shared/fixtures/scoring-vectors.json";

    address private constant PLAYER = address(0xA11CE);

    PlaintextGridStore private store;
    string private json;
    uint256[3] private tierPools;

    function setUp() public {
        store = new PlaintextGridStore(address(this));
        store.initializeController(address(this));

        json = vm.readFile(VECTORS);
        uint256[] memory pools = vm.parseJsonUintArray(json, ".tierPools");
        require(pools.length == 3, "expected three tier pools");
        tierPools = [pools[0], pools[1], pools[2]];
    }

    /// @notice Every generated vector must score identically on chain.
    function testMatchesEveryTypeScriptVector() public {
        uint256 count = vm.parseJsonUint(json, ".count");
        require(count > 0, "no vectors found");

        for (uint256 i; i < count; ++i) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            if (!vm.parseJsonBool(json, string.concat(base, ".valid"))) continue;

            uint256[] memory grid = vm.parseJsonUintArray(json, string.concat(base, ".grid"));
            uint256[] memory windows = vm.parseJsonUintArray(json, string.concat(base, ".windows"));
            require(grid.length == 9 && windows.length == 3, "malformed vector");

            uint256 roundId = i + 1;
            store.storeGrid(roundId, PLAYER, _packGrid(grid), tierPools);

            (uint16 markedMask, uint8 completedLines, bool validGrid) =
                store.scoreGrid(roundId, PLAYER, [windows[0], windows[1], windows[2]]);

            string memory name = vm.parseJsonString(json, string.concat(base, ".name"));
            _assertEq(markedMask, vm.parseJsonUint(json, string.concat(base, ".mask")), name, "marked mask");
            _assertEq(completedLines, vm.parseJsonUint(json, string.concat(base, ".lines")), name, "line count");
            require(validGrid, "plaintext store scored a stored grid as invalid");
        }
    }

    /// @notice The tier pools the TypeScript package derives are the ones the
    ///         store enforces: a moment from the wrong tier is rejected at
    ///         submission rather than silently scoring zero.
    function testRejectsAMomentFromTheWrongTier() public {
        uint256[] memory grid = vm.parseJsonUintArray(json, ".cases[0].grid");
        grid[0] = 19; // a rare-tier moment placed in a common-tier cell

        (bool stored,) = address(store)
            .call(abi.encodeWithSelector(store.storeGrid.selector, uint256(999), PLAYER, _packGrid(grid), tierPools));
        require(!stored, "store accepted a moment from the wrong tier");
    }

    /// @notice Guards the layout the packing depends on: nine contiguous
    ///         moments per tier, matching `MOMENT_IDS` in the shared package.
    function testTierPoolsCoverTwentySevenDistinctMoments() public view {
        uint256 union = tierPools[0] | tierPools[1] | tierPools[2];
        uint256 seen;
        for (uint8 moment = 1; moment <= 27; ++moment) {
            require(union & (uint256(1) << moment) != 0, "moment id missing from tier pools");
            ++seen;
        }
        require(seen == 27, "expected 27 moments");
        require(tierPools[0] & tierPools[1] == 0, "tier 0 and 1 overlap");
        require(tierPools[0] & tierPools[2] == 0, "tier 0 and 2 overlap");
        require(tierPools[1] & tierPools[2] == 0, "tier 1 and 2 overlap");
    }

    function _packGrid(uint256[] memory momentIds) private pure returns (bytes memory packed) {
        packed = new bytes(9);
        for (uint256 cell; cell < 9; ++cell) {
            require(momentIds[cell] <= type(uint8).max, "moment id does not fit in a byte");
            packed[cell] = bytes1(uint8(momentIds[cell]));
        }
    }

    function _assertEq(uint256 actual, uint256 expected, string memory name, string memory field) private pure {
        if (actual == expected) return;
        revert(
            string.concat(
                "parity mismatch in '",
                name,
                "' (",
                field,
                "): solidity=",
                vm.toString(actual),
                " typescript=",
                vm.toString(expected)
            )
        );
    }
}
