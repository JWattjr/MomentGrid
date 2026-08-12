#!/usr/bin/env tsx
/// Enters bot players into an existing round.
///
///   pnpm --filter @moment-grid/tools seed-bots -- --round 1 --outcome win
///
/// Bot grids are chosen by line count against the recorded fixture, which is
/// deterministic, so the outcome is staged in advance and asserted here rather
/// than hoped for on stage.

import { parseEther } from "viem";
import { fail, parseArgs, parseIntegerFlag } from "./lib/args.js";
import { createClients } from "./lib/chain.js";
import { loadDemoConfig } from "./lib/env.js";
import { drainBots, printSeedSummary, seedRound, type SeedOptions } from "./lib/seed.js";

const USAGE = `Usage: seed-bots --round <id> [options]

  --round        Round id to enter. Required unless --drain.
  --bots         How many bots to seed. Default 3.
  --outcome      "win" (bots score below the human) or "lose" (one beats them). Default win.
  --human-lines  The line count the human grid is expected to score. Default 6, the Quick fill score.
  --gas          ETH topped up per bot for gas. Default 0.002.
  --drain        Return leftover entry tokens to the keeper instead of seeding.`;

async function main(): Promise<void> {
  const args = parseArgs(
    process.argv.slice(2),
    {
      round: { description: "round id" },
      bots: { description: "bot count", fallback: "3" },
      outcome: { description: "win or lose", fallback: "win" },
      "human-lines": { description: "expected human score", fallback: "6" },
      gas: { description: "ETH per bot", fallback: "0.002" },
      drain: { description: "return funds", boolean: true },
    },
    USAGE,
  );

  const config = loadDemoConfig();
  const clients = createClients(config);
  const botCount = parseIntegerFlag(args, "bots", USAGE);

  if (args.drain === "true") {
    await drainBots(clients, config, botCount);
    process.stdout.write("\nDrained. Leftover ETH is left in place to cover the next run's gas.\n");
    return;
  }

  if (args.outcome !== "win" && args.outcome !== "lose") {
    throw new Error(`--outcome must be "win" or "lose", received "${args.outcome}".\n\n${USAGE}`);
  }
  const outcome: SeedOptions["outcome"] = args.outcome;

  const options: SeedOptions = {
    roundId: BigInt(parseIntegerFlag(args, "round", USAGE)),
    botCount,
    outcome,
    humanLines: parseIntegerFlag(args, "human-lines", USAGE),
    gasTopUp: parseEther(args.gas),
  };

  printSeedSummary(await seedRound(clients, config, options), options);
}

main().catch(fail);
