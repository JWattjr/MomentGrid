import { Logger } from "@nestjs/common";

export type ChainConfig = {
  rpcUrl: string;
  keeperPrivateKey: `0x${string}`;
  gridStoreAddress: `0x${string}`;
  momentGridAddress: `0x${string}`;
  demoBotMnemonic?: string;
  /// The ERC20 the pot is denominated in. Read from the contract when absent,
  /// but configuring it lets the API answer token questions without an RPC hop.
  entryTokenAddress?: `0x${string}`;
};

export type KeeperConfig = {
  automationEnabled: boolean;
  pollMs: number;
  maxRetries: number;
};

export type AppConfig = {
  port: number;
  mongodbUri: string;
  keeperApiSecret: string;
  corsOrigins: string[];
  replaySeconds: number;
  keeper: KeeperConfig;
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

  const rawEntryToken = process.env.ENTRY_TOKEN_ADDRESS;
  if (rawEntryToken && !isAddress(rawEntryToken)) {
    throw new Error("ENTRY_TOKEN_ADDRESS must be a 0x-prefixed address.");
  }
  const entryTokenAddress: `0x${string}` | undefined = isAddress(rawEntryToken) ? rawEntryToken : undefined;
  const demoBotMnemonic = process.env.DEMO_BOT_MNEMONIC;

  return {
    rpcUrl,
    keeperPrivateKey,
    gridStoreAddress,
    momentGridAddress,
    ...(entryTokenAddress ? { entryTokenAddress } : {}),
    ...(demoBotMnemonic ? { demoBotMnemonic } : {}),
  };
}

/// A positive integer, or a thrown error naming the variable. Anything else —
/// a stray quote, a decimal, a negative — would otherwise become `NaN` and have
/// the keeper quietly watch a round that cannot exist.
function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) === 0) {
    throw new Error(`${name} must be a positive whole number, received "${raw}".`);
  }
  return Number(raw);
}

function readKeeperConfig(): KeeperConfig {
  return {
    automationEnabled: (process.env.KEEPER_AUTOMATION_ENABLED ?? "true") !== "false",
    pollMs: readPositiveInt("KEEPER_POLL_MS", 2_000),
    maxRetries: readPositiveInt("KEEPER_MAX_RETRIES", 3),
  };
}

export function loadConfiguration(): AppConfig {
  const keeperApiSecret = required("KEEPER_API_SECRET");
  if (keeperApiSecret.length < 16) {
    throw new Error("KEEPER_API_SECRET must be at least 16 characters.");
  }

  const keeper = readKeeperConfig();
  const chain = readChainConfig();
  if (chain && keeper.automationEnabled && !chain.demoBotMnemonic) {
    throw new Error("DEMO_BOT_MNEMONIC is required when keeper automation is enabled.");
  }

  return {
    port: Number(process.env.PORT ?? 4000),
    mongodbUri: required("MONGODB_URI"),
    keeperApiSecret,
    // The web dev server runs on 3003 (web/package.json); 3000 covers
    // `next start` and anything else pointed at the default port.
    corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:3003,http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    replaySeconds: Number(process.env.REPLAY_SECONDS ?? 120),
    keeper,
    indexerStartBlock: process.env.INDEXER_START_BLOCK ? Number(process.env.INDEXER_START_BLOCK) : undefined,
    liveFeedUrl: process.env.LIVE_FEED_URL,
    liveFeedApiKey: process.env.LIVE_FEED_API_KEY,
    chain,
  };
}

export const CONFIG = "APP_CONFIG";
