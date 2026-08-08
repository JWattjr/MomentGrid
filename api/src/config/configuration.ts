import { Logger } from "@nestjs/common";

export type ChainConfig = {
  rpcUrl: string;
  keeperPrivateKey: `0x${string}`;
  gridStoreAddress: `0x${string}`;
  momentGridAddress: `0x${string}`;
};

export type AppConfig = {
  port: number;
  mongodbUri: string;
  keeperApiSecret: string;
  corsOrigins: string[];
  replaySeconds: number;
  /// First block the event indexer reads. Unset means "start at the current
  /// head", which skips history — set it to the deployment block to backfill.
  indexerStartBlock?: number;
  liveFeedUrl?: string;
  liveFeedApiKey?: string;
  chain?: ChainConfig;
};

const logger = new Logger("Configuration");

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required. Copy .env.example to .env and fill it in.`);
  return value;
};

const isAddress = (value: string | undefined): value is `0x${string}` => /^0x[0-9a-fA-F]{40}$/.test(value ?? "");

const isPrivateKey = (value: string | undefined): value is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(value ?? "");

/// Chain access is optional: without it the API still serves match state and
/// read-only projections, and only settlement is unavailable. That keeps a
/// judge's first run working before any contract is deployed.
function readChainConfig(): ChainConfig | undefined {
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const keeperPrivateKey = process.env.KEEPER_PRIVATE_KEY;
  const gridStoreAddress = process.env.INCO_GRID_STORE_ADDRESS;
  const momentGridAddress = process.env.MOMENT_GRID_ADDRESS;

  if (!rpcUrl || !keeperPrivateKey || !gridStoreAddress || !momentGridAddress) {
    logger.warn("Chain variables incomplete - settlement endpoints will be disabled.");
    return undefined;
  }
  if (!isPrivateKey(keeperPrivateKey)) {
    throw new Error("KEEPER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string.");
  }
  if (!isAddress(gridStoreAddress) || !isAddress(momentGridAddress)) {
    throw new Error("INCO_GRID_STORE_ADDRESS and MOMENT_GRID_ADDRESS must be 0x-prefixed addresses.");
  }

  return { rpcUrl, keeperPrivateKey, gridStoreAddress, momentGridAddress };
}

export function loadConfiguration(): AppConfig {
  const keeperApiSecret = required("KEEPER_API_SECRET");
  if (keeperApiSecret.length < 16) {
    throw new Error("KEEPER_API_SECRET must be at least 16 characters.");
  }

  return {
    port: Number(process.env.PORT ?? 4000),
    mongodbUri: required("MONGODB_URI"),
    keeperApiSecret,
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    replaySeconds: Number(process.env.REPLAY_SECONDS ?? 120),
    indexerStartBlock: process.env.INDEXER_START_BLOCK ? Number(process.env.INDEXER_START_BLOCK) : undefined,
    liveFeedUrl: process.env.LIVE_FEED_URL,
    liveFeedApiKey: process.env.LIVE_FEED_API_KEY,
    chain: readChainConfig(),
  };
}

export const CONFIG = "APP_CONFIG";
