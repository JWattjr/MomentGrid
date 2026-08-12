#!/usr/bin/env tsx
/// Checks everything the demo depends on, without sending a transaction.
///
///   pnpm --filter @moment-grid/demo-tools preflight
///
/// Run this before presenting. Every failure it reports is one that would
/// otherwise surface mid-demo, where the round is already burnt.

import { formatEther } from "viem";
import { fail, parseArgs } from "./lib/args.js";
import { createClients, erc20Abi, formatUnitsFixed, gridStoreAbi, momentGridAbi } from "./lib/chain.js";
import { loadDemoConfig } from "./lib/env.js";
import { maxAchievableLines } from "./lib/demo-grids.js";

const USAGE = `Usage: preflight [--round <id>]

  --round  Round to inspect. Defaults to the latest round on chain.`;

const ROUND_STATES = ["open", "locked", "settled"] as const;

const ok = (message: string) => process.stdout.write(`  ok    ${message}\n`);
const warn = (message: string) => process.stdout.write(`  WARN  ${message}\n`);
const bad = (message: string) => process.stdout.write(`  FAIL  ${message}\n`);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), { round: { description: "round id" } }, USAGE);
  let problems = 0;

  process.stdout.write("Configuration (api/.env)\n");
  const config = loadDemoConfig();
  ok(`rpc          ${config.rpcUrl}`);
  ok(`momentGrid   ${config.momentGridAddress}`);
  ok(`gridStore    ${config.gridStoreAddress}`);
  ok(`entryToken   ${config.entryTokenAddress}`);

  const clients = createClients(config);
  ok(`keeper       ${clients.keeper.address}`);

  process.stdout.write("\nChain\n");
  const [keeperEth, decimals, storeFee] = await Promise.all([
    clients.publicClient.getBalance({ address: clients.keeper.address }),
    clients.publicClient.readContract({
      address: config.entryTokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    clients.publicClient.readContract({
      address: config.gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "submissionFee",
    }),
  ]);

  ok(`store fee    ${formatEther(storeFee)} ETH per submission`);
  if (keeperEth < 10n ** 16n) {
    problems += 1;
    bad(`keeper ETH   ${formatEther(keeperEth)} — too low to fund bots and settle`);
  } else {
    ok(`keeper ETH   ${formatEther(keeperEth)}`);
  }

  const keeperTokens = await clients.publicClient.readContract({
    address: config.entryTokenAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [clients.keeper.address],
  });
  if (keeperTokens === 0n) {
    problems += 1;
    bad(`keeper token 0 — cannot fund bot entries`);
  } else {
    ok(`keeper token ${formatUnitsFixed(keeperTokens, decimals)}`);
  }

  process.stdout.write("\nRound\n");
  let configuredRound = args.round;
  if (!configuredRound) {
    const roundCount = await clients.publicClient.readContract({
      address: config.momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundCount",
    });
    if (roundCount === 0n) {
      problems += 1;
      bad("No rounds exist on chain yet. Create one with new-demo-round.");
    } else {
      configuredRound = String(roundCount);
      ok(`auto-discovered latest round ${configuredRound} from chain`);
    }
  }
  if (configuredRound) {
    const roundId = BigInt(configuredRound);
    const round = await clients.publicClient.readContract({
      address: config.momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundDetails",
      args: [roundId],
    });
    const state = ROUND_STATES[round.state] ?? "unknown";
    ok(`round ${roundId}      ${state}, ${round.entrantCount} entrant(s)`);
    ok(`entry fee    ${formatUnitsFixed(round.entryFee, decimals)}`);
    ok(`pot          ${formatUnitsFixed(round.pot, decimals)}`);

    if (state !== "open") {
      warn(`round ${roundId} is ${state}; entry has closed. Open a fresh one with new-demo-round.`);
    } else if (round.entrantCount === 0) {
      warn("no entrants yet — a solo player wins their own stake back, showing no movement.");
    }
  }

  process.stdout.write("\nScoring\n");
  ok(`grid ceiling ${maxAchievableLines()} line(s)`);

  process.stdout.write("\nAPI\n");
  try {
    const response = await fetch(`${config.apiUrl}/match`);
    if (response.ok) {
      const snapshot = (await response.json()) as { phase?: string };
      ok(`${config.apiUrl} reachable, match phase "${snapshot.phase}"`);
    } else {
      problems += 1;
      bad(`${config.apiUrl} returned ${response.status}`);
    }
  } catch {
    problems += 1;
    bad(`${config.apiUrl} unreachable — start it with pnpm dev:api`);
  }

  process.stdout.write(
    problems === 0
      ? "\nAll checks passed.\n"
      : `\n${problems} problem(s) need fixing before the demo.\n`,
  );
  if (problems > 0) process.exitCode = 1;
}

main().catch(fail);
