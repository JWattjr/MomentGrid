import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Address, Hex, isAddress } from "viem";

/// Environment access for the demo tooling.
///
/// Every read validates at the boundary and fails with a message naming the
/// variable, because these scripts move real funds and a silently-undefined
/// address would either revert cryptically or, worse, send somewhere wrong.

/// These scripts read `api/.env` rather than carrying their own copy. The
/// keeper key, the contract addresses and the entry token are all things the
/// API already knows; duplicating them would mean two files to keep in step and
/// two places a private key could leak from.
///
/// Values already present in the environment win, so a one-off override still
/// works without editing the file.
function loadApiEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const apiEnv = resolve(here, "../../../../api/.env");

  if (!existsSync(apiEnv)) {
    throw new Error(
      `Could not find ${apiEnv}. The demo scripts read the API's configuration; ` +
        `copy api/.env.example to api/.env and fill it in.`,
    );
  }

  process.loadEnvFile(apiEnv);
}

let loaded = false;

function ensureLoaded(): void {
  if (loaded) return;
  loadApiEnv();
  loaded = true;
}

export function requireEnv(name: string): string {
  ensureLoaded();
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in api/.env or export it before running.`);
  }
  return value;
}

export function requireAddress(name: string): Address {
  const value = requireEnv(name);
  if (!isAddress(value)) {
    throw new Error(`${name} must be a 0x-prefixed 20-byte address, received "${value}".`);
  }
  return value;
}

export function requirePrivateKey(name: string): Hex {
  const value = requireEnv(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(`${name} must be a 0x-prefixed 32-byte hex private key.`);
  }
  return value as Hex;
}

export function optionalEnv(name: string, fallback: string): string {
  ensureLoaded();
  return process.env[name] || fallback;
}

export type DemoConfig = {
  rpcUrl: string;
  keeperPrivateKey: Hex;
  momentGridAddress: Address;
  gridStoreAddress: Address;
  entryTokenAddress: Address;
  apiUrl: string;
  keeperApiSecret: string;
};

export function loadDemoConfig(): DemoConfig {
  return {
    rpcUrl: optionalEnv("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org"),
    keeperPrivateKey: requirePrivateKey("KEEPER_PRIVATE_KEY"),
    momentGridAddress: requireAddress("MOMENT_GRID_ADDRESS"),
    gridStoreAddress: requireAddress("INCO_GRID_STORE_ADDRESS"),
    entryTokenAddress: requireAddress("ENTRY_TOKEN_ADDRESS"),
    apiUrl: optionalEnv("API_URL", "http://localhost:4000").replace(/\/$/, ""),
    keeperApiSecret: optionalEnv("KEEPER_API_SECRET", ""),
  };
}
