// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {MomentGrid} from "../src/MomentGrid.sol";
import {PlaintextGridStore} from "../src/PlaintextGridStore.sol";
import {IncoGridStore} from "../src/IncoGridStore.sol";
import {IGridStore} from "../src/interfaces/IGridStore.sol";

interface Vm {
    function envUint(string calldata name) external view returns (uint256);
    function envOr(string calldata name, address defaultValue) external view returns (address);
    function addr(uint256 privateKey) external pure returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

abstract contract DeploymentBase {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant MEGAPOT_BASE_SEPOLIA = 0x6f03c7BCaDAdBf5E6F5900DA3d56AdD8FbDac5De;
    address internal constant MPUSDC_BASE_SEPOLIA = 0xA4253E7C13525287C56550b8708100f93E60509f;
    uint256 internal constant TICKET_PRICE = 1_000_000;

    function _finish(IGridStore store, address keeper) internal returns (MomentGrid game) {
        game = new MomentGrid(store, keeper);

        if (address(store).code.length == 0) revert("store deployment failed");
        if (address(store) != address(0)) {
            // Both permanent store implementations expose this one-time initializer.
            (bool initialized,) =
                address(store).call(abi.encodeWithSignature("initializeController(address)", address(game)));
            require(initialized, "controller initialization failed");
        }

        address referrer = vm.envOr("MEGAPOT_REFERRER", address(0));
        game.configureMegapot(MEGAPOT_BASE_SEPOLIA, MPUSDC_BASE_SEPOLIA, referrer, TICKET_PRICE);
        vm.stopBroadcast();
    }
}

/// @notice Production Base Sepolia deployment using confidential Inco storage.
contract DeployInco is DeploymentBase {
    function run() external returns (IncoGridStore store, MomentGrid game) {
        uint256 deployerKey = vm.envUint("KEEPER_PRIVATE_KEY");
        address keeper = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);
        store = new IncoGridStore(keeper);
        game = _finish(store, keeper);
    }
}

/// @notice Debug deployment retaining the permanent plaintext scoring path.
contract DeployPlaintext is DeploymentBase {
    function run() external returns (PlaintextGridStore store, MomentGrid game) {
        uint256 deployerKey = vm.envUint("KEEPER_PRIVATE_KEY");
        address keeper = vm.addr(deployerKey);
        vm.startBroadcast(deployerKey);
        store = new PlaintextGridStore(keeper);
        game = _finish(store, keeper);
    }
}
