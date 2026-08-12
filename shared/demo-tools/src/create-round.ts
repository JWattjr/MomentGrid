#!/usr/bin/env tsx
/// Opens a new round on the deployed MomentGrid.
///
///   pnpm --filter @moment-grid/tools create-round -- --fee 1.0
///
/// Tier pools come from `@moment-grid/scoring`, never from hand-typed bit
/// positions: they encode which of the 27 moment ids each row accepts, and a
/// wrong bitmap silently disqualifies every grid in that row at settlement.

import { fail, parseArgs, parseTokenAmount } from "./lib/args.js";
import { createClients, formatUnitsFixed } from "./lib/chain.js";
import { loadDemoConfig } from "./lib/env.js";
import { createRound, entryTokenDecimals, printRoundEnv } from "./lib/round-ops.js";

const USAGE = `Usage: create-round [--fee <amount>]

  --fee    Entry fee in whole entry-token units, e.g. 1.0 for one USDC. Default 1.0.`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), { fee: { description: "entry fee", fallback: "1.0" } }, USAGE);
  const config = loadDemoConfig();
  const clients = createClients(config);

  const decimals = await entryTokenDecimals(clients, config);
  const entryFee = parseTokenAmount(args.fee, decimals);

  process.stdout.write(`Creating round on ${config.momentGridAddress}\n`);
  process.stdout.write(`  entry fee   ${formatUnitsFixed(entryFee, decimals)} (${entryFee} base units)\n`);

  const round = await createRound(clients, config, entryFee);
  process.stdout.write(`  tx          ${round.txHash}\n`);
  printRoundEnv(round.roundId, entryFee, decimals);
}

main().catch(fail);
