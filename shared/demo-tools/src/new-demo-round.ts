#!/usr/bin/env tsx
/// Prepares a complete demo round in one command.
///
///   pnpm --filter @moment-grid/tools new-demo-round -- --outcome win
///
/// A round cannot be reopened once locked, so every rehearsal burns one. This
/// does the whole reset — open a round, seed the bots, rewind the match clock —
/// in the order that matters, because seeding after the match starts would find
/// entry already closed.

import { parseEther } from "viem";
import { fail, parseArgs, parseIntegerFlag, parseTokenAmount } from "./lib/args.js";
import { createClients } from "./lib/chain.js";
import { loadDemoConfig } from "./lib/env.js";
import { createRound, entryTokenDecimals, printRoundEnv, resetMatch } from "./lib/round-ops.js";
import { printSeedSummary, seedRound, type SeedOptions } from "./lib/seed.js";

const USAGE = `Usage: new-demo-round [options]

  --fee          Entry fee in whole entry-token units. Default 1.0.
  --bots         How many bots to seed. Default 3.
  --outcome      "win" or "lose". Default win.
  --human-lines  The line count the human grid is expected to score. Default 6.
  --gas          ETH topped up per bot for gas. Default 0.002.
  --skip-reset   Leave the API match clock alone.`;

async function main(): Promise<void> {
  const args = parseArgs(
    process.argv.slice(2),
    {
      fee: { description: "entry fee", fallback: "1.0" },
      bots: { description: "bot count", fallback: "3" },
      outcome: { description: "win or lose", fallback: "win" },
      "human-lines": { description: "expected human score", fallback: "6" },
      gas: { description: "ETH per bot", fallback: "0.002" },
      "skip-reset": { description: "skip match reset", boolean: true },
    },
    USAGE,
  );

  if (args.outcome !== "win" && args.outcome !== "lose") {
    throw new Error(`--outcome must be "win" or "lose", received "${args.outcome}".\n\n${USAGE}`);
  }
  const outcome: SeedOptions["outcome"] = args.outcome;

  const config = loadDemoConfig();
  const clients = createClients(config);
  const decimals = await entryTokenDecimals(clients, config);
  const entryFee = parseTokenAmount(args.fee, decimals);

  process.stdout.write("Opening a new round...\n");
  const round = await createRound(clients, config, entryFee);
  process.stdout.write(`  round ${round.roundId}  tx ${round.txHash}\n\n`);

  const options: SeedOptions = {
    roundId: round.roundId,
    botCount: parseIntegerFlag(args, "bots", USAGE),
    outcome,
    humanLines: parseIntegerFlag(args, "human-lines", USAGE),
    gasTopUp: parseEther(args.gas),
  };
  printSeedSummary(await seedRound(clients, config, options), options);

  if (args["skip-reset"] !== "true") {
    process.stdout.write("\nRewinding the match clock...\n");
    await resetMatch(config);
    process.stdout.write("  match reset to idle\n");
  }

  printRoundEnv(round.roundId, entryFee, decimals);
}

main().catch(fail);
