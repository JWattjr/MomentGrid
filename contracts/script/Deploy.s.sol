// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {IGridStore} from "../src/interfaces/IGridStore.sol";
import {IncoGridStore} from "../src/IncoGridStore.sol";
import {MomentGrid} from "../src/MomentGrid.sol";
import {PlaintextGridStore} from "../src/PlaintextGridStore.sol";

interface IControllableStore {
    function initializeController(address newController) external;
}

contract BroadcasterFinder {
    address public immutable BROADCASTER;

    constructor() {
        BROADCASTER = msg.sender;
    }
}

abstract contract DeploymentBase is Script {
    struct NetworkConfig {
        string networkName;
        address megapot;
        address megapotToken;
        uint256 ticketPrice;
        bool configureMegapot;
    }

    uint256 internal constant BASE_SEPOLIA = 84532;

    function getDeploymentConfig()
        internal
        view
        returns (NetworkConfig memory config)
    {
        if (block.chainid == BASE_SEPOLIA) {
            config = NetworkConfig({
                networkName: "Base Sepolia",
                megapot: 0x6f03c7BCaDAdBf5E6F5900DA3d56AdD8FbDac5De,
                megapotToken: 0xA4253E7C13525287C56550b8708100f93E60509f,
                ticketPrice: 1_000_000,
                configureMegapot: true
            });
        } else {
            // Anvil and anything else: Megapot does not exist locally
            config = NetworkConfig({
                networkName: "Local / unconfigured network",
                megapot: address(0),
                megapotToken: address(0),
                ticketPrice: 1_000_000,
                configureMegapot: false
            });
        }
    }

    function _resolveDeployer() internal returns (address deployer) {
        vm.startBroadcast();
        BroadcasterFinder finder = new BroadcasterFinder();
        deployer = finder.BROADCASTER();
        vm.stopBroadcast();
    }

    function _finish(
        IGridStore store,
        address deployer,
        NetworkConfig memory config
    ) internal returns (MomentGrid game) {
        console2.log("Deploying MomentGrid...");
        game = new MomentGrid(store, deployer);
        console2.log("MomentGrid deployed at:", address(game));

        console2.log("\nWiring up contract permissions...");
        IControllableStore(address(store)).initializeController(address(game));
        console2.log("Grid store controller set to MomentGrid.");

        if (config.configureMegapot) {
            address referrer = vm.envOr("MEGAPOT_REFERRER", address(0));
            game.configureMegapot(
                config.megapot,
                config.megapotToken,
                referrer,
                config.ticketPrice
            );
            console2.log("Megapot configured. Referrer:", referrer);
        } else {
            console2.log("WARNING: Megapot not configured on this network.");
            console2.log(
                "         Call configureMegapot() from the owner once addresses are known."
            );
        }
    }

    function _logSummary(
        string memory storeLabel,
        address store,
        address game,
        address deployer,
        NetworkConfig memory config
    ) internal pure {
        console2.log("\n=== Deployment Summary ===");
        console2.log("Network:", config.networkName);
        console2.log("\n--- Contract Addresses ---");
        console2.log(storeLabel, store);
        console2.log("MomentGrid:", game);
        console2.log("\n--- Configuration ---");
        console2.log("Owner / Keeper:", deployer);
        console2.log("\n--- Copy into api/.env ---");
        console2.log("INCO_GRID_STORE_ADDRESS=", store);
        console2.log("MOMENT_GRID_ADDRESS=", game);
        console2.log("\n--- Copy into web/.env.local ---");
        console2.log("NEXT_PUBLIC_INCO_GRID_STORE_ADDRESS=", store);
        console2.log("NEXT_PUBLIC_MOMENT_GRID_ADDRESS=", game);
        console2.log("\n=== Deployment Complete ===");
    }
}

/// @notice Production deployment using confidential Inco Lightning storage.
/// @dev forge script script/Deploy.s.sol:DeployInco \
///        --rpc-url base_sepolia --account momentgrid-keeper --broadcast
contract DeployInco is DeploymentBase {
    function setUp() public {}

    function run() external returns (IncoGridStore store, MomentGrid game) {
        NetworkConfig memory config = getDeploymentConfig();

        console2.log("=== Moment Grid Deployment (confidential) ===");
        console2.log("Network:", config.networkName);
        console2.log("Chain ID:", block.chainid);

        address deployer = _resolveDeployer();
        console2.log("Deployer / Keeper:", deployer);

        vm.startBroadcast(deployer);
        console2.log("\nDeploying IncoGridStore...");
        store = new IncoGridStore(deployer);
        console2.log("IncoGridStore deployed at:", address(store));

        game = _finish(store, deployer, config);
        vm.stopBroadcast();

        _logSummary(
            "IncoGridStore:",
            address(store),
            address(game),
            deployer,
            config
        );
    }
}

/// @notice Debug deployment retaining the public plaintext scoring path.
/// @dev Grids are readable on chain. Never use this for a real round.
contract DeployPlaintext is DeploymentBase {
    function setUp() public {}

    function run()
        external
        returns (PlaintextGridStore store, MomentGrid game)
    {
        NetworkConfig memory config = getDeploymentConfig();

        console2.log("=== Moment Grid Deployment (PLAINTEXT DEBUG) ===");
        console2.log("Network:", config.networkName);
        console2.log("Chain ID:", block.chainid);
        console2.log("WARNING: grids are public in this deployment.");

        address deployer = _resolveDeployer();
        console2.log("Deployer / Keeper:", deployer);

        vm.startBroadcast(deployer);
        console2.log("\nDeploying PlaintextGridStore...");
        store = new PlaintextGridStore(deployer);
        console2.log("PlaintextGridStore deployed at:", address(store));

        game = _finish(store, deployer, config);
        vm.stopBroadcast();

        _logSummary(
            "PlaintextGridStore:",
            address(store),
            address(game),
            deployer,
            config
        );
    }
}
