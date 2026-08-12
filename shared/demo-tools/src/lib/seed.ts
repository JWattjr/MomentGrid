import { encryptGrid } from "@moment-grid/inco";
import { Account, Address, formatEther } from "viem";
import { botAccounts } from "./bot-wallets.js";
import {
  DemoClients,
  erc20Abi,
  formatUnitsFixed,
  gridStoreAbi,
  momentGridAbi,
  sendAndConfirm,
} from "./chain.js";
import { botTargetsFor, gridScoringExactly, maxAchievableLines, ScoredGrid } from "./demo-grids.js";
import { DemoConfig } from "./env.js";

/// Enters bot players into a round so the human has someone to beat.
///
/// A one-entrant round always returns the sole player their own stake, so there
/// is no visible win or loss. These bots give the pot somewhere else to go.

export type SeedOptions = {
  roundId: bigint;
  botCount: number;
  outcome: "win" | "lose";
  humanLines: number;
  gasTopUp: bigint;
};

export type SeedResult = {
  entrants: number;
  topBotLines: number;
  entryFee: bigint;
  decimals: number;
};

type SeedPlan = { account: Account; targetLines: number; grid: ScoredGrid };

const ROUND_STATES = ["open", "locked", "settled"] as const;

async function ensureFunded(
  clients: DemoClients,
  config: DemoConfig,
  bot: Address,
  entryFee: bigint,
  storeFee: bigint,
  gasTopUp: bigint,
): Promise<void> {
  const [ethBalance, tokenBalance] = await Promise.all([
    clients.publicClient.getBalance({ address: bot }),
    clients.publicClient.readContract({
      address: config.entryTokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [bot],
    }),
  ]);

  // Top up only the shortfall, so re-running does not keep pushing funds into
  // wallets that already hold enough.
  const ethNeeded = gasTopUp + storeFee;
  if (ethBalance < ethNeeded) {
    const amount = ethNeeded - ethBalance;
    process.stdout.write(`    funding ${formatEther(amount)} ETH for gas\n`);
    await sendAndConfirm(clients, "gas top-up", () =>
      clients.walletClient.sendTransaction({
        account: clients.keeper,
        chain: clients.walletClient.chain,
        to: bot,
        value: amount,
      }),
    );
  }

  if (tokenBalance < entryFee) {
    const amount = entryFee - tokenBalance;
    process.stdout.write(`    funding ${amount} base units of the entry token\n`);
    await sendAndConfirm(clients, "entry token top-up", () =>
      clients.walletClient.writeContract({
        account: clients.keeper,
        chain: clients.walletClient.chain,
        address: config.entryTokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [bot, amount],
      }),
    );
  }
}

async function seedOne(
  clients: DemoClients,
  config: DemoConfig,
  plan: SeedPlan,
  roundId: bigint,
  entryFee: bigint,
  storeFee: bigint,
  gasTopUp: bigint,
): Promise<string> {
  const bot = plan.account.address;

  const alreadyEntered = await clients.publicClient.readContract({
    address: config.momentGridAddress,
    abi: momentGridAbi,
    functionName: "hasEntered",
    args: [roundId, bot],
  });
  if (alreadyEntered) return "already entered, skipped";

  await ensureFunded(clients, config, bot, entryFee, storeFee, gasTopUp);

  const allowance = await clients.publicClient.readContract({
    address: config.entryTokenAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: [bot, config.momentGridAddress],
  });
  if (allowance < entryFee) {
    await sendAndConfirm(clients, "approve", () =>
      clients.walletClient.writeContract({
        account: plan.account,
        chain: clients.walletClient.chain,
        address: config.entryTokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [config.momentGridAddress, entryFee],
      }),
    );
  }

  // The same helper the browser uses, so a seeded grid is byte-identical to a
  // human one and the store cannot tell them apart.
  const encrypted = await encryptGrid({
    grid: plan.grid.grid,
    accountAddress: bot,
    gridStoreAddress: config.gridStoreAddress,
    rpcUrl: config.rpcUrl,
  });

  return sendAndConfirm(clients, "submitGrid", () =>
    clients.walletClient.writeContract({
      account: plan.account,
      chain: clients.walletClient.chain,
      address: config.momentGridAddress,
      abi: momentGridAbi,
      functionName: "submitGrid",
      args: [roundId, encrypted],
      value: storeFee,
    }),
  );
}

export async function seedRound(
  clients: DemoClients,
  config: DemoConfig,
  options: SeedOptions,
): Promise<SeedResult> {
  const accounts = botAccounts(options.botCount);

  const [round, storeFee, decimals] = await Promise.all([
    clients.publicClient.readContract({
      address: config.momentGridAddress,
      abi: momentGridAbi,
      functionName: "roundDetails",
      args: [options.roundId],
    }),
    clients.publicClient.readContract({
      address: config.gridStoreAddress,
      abi: gridStoreAbi,
      functionName: "submissionFee",
    }),
    clients.publicClient.readContract({
      address: config.entryTokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }),
  ]);

  if (round.state !== 0) {
    throw new Error(
      `Round ${options.roundId} is ${ROUND_STATES[round.state] ?? "unknown"}; entry has closed. ` +
        `Seed bots before the match starts, or create a new round.`,
    );
  }

  // Resolve every grid before spending anything, so an impossible staging
  // request fails without having moved funds.
  const targets = botTargetsFor(options.outcome, options.botCount, options.humanLines);
  const plans: SeedPlan[] = targets.map((targetLines, index) => ({
    account: accounts[index],
    targetLines,
    grid: gridScoringExactly(targetLines, index),
  }));

  process.stdout.write(`Seeding round ${options.roundId} for a staged ${options.outcome.toUpperCase()}\n`);
  process.stdout.write(`  entry fee    ${formatUnitsFixed(round.entryFee, decimals)} per entrant\n`);
  process.stdout.write(`  store fee    ${formatEther(storeFee)} ETH per entrant\n`);
  process.stdout.write(`  human grid   expected to score ${options.humanLines} line(s)\n`);
  process.stdout.write(`  ceiling      ${maxAchievableLines()} line(s) is the most any grid can score\n\n`);

  for (const plan of plans) {
    process.stdout.write(`  bot ${plan.account.address} -> ${plan.targetLines} line(s)\n`);
    const result = await seedOne(
      clients,
      config,
      plan,
      options.roundId,
      round.entryFee,
      storeFee,
      options.gasTopUp,
    );
    process.stdout.write(`    ${result}\n`);
  }

  const entrants = await clients.publicClient.readContract({
    address: config.momentGridAddress,
    abi: momentGridAbi,
    functionName: "entrants",
    args: [options.roundId],
  });

  return {
    entrants: entrants.length,
    topBotLines: Math.max(...targets),
    entryFee: round.entryFee,
    decimals,
  };
}

/// Returns leftover entry tokens to the keeper. ETH is deliberately left in
/// place, since it only covers gas for the next run.
export async function drainBots(
  clients: DemoClients,
  config: DemoConfig,
  botCount: number,
): Promise<void> {
  for (const account of botAccounts(botCount)) {
    const balance = await clients.publicClient.readContract({
      address: config.entryTokenAddress,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [account.address],
    });
    if (balance === 0n) continue;
    process.stdout.write(`  returning ${balance} base units from ${account.address}\n`);
    await sendAndConfirm(clients, "drain", () =>
      clients.walletClient.writeContract({
        account,
        chain: clients.walletClient.chain,
        address: config.entryTokenAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [clients.keeper.address, balance],
      }),
    );
  }
}

export function printSeedSummary(result: SeedResult, options: SeedOptions): void {
  process.stdout.write(`\nRound ${options.roundId} now has ${result.entrants} entrant(s).\n`);
  process.stdout.write(
    options.outcome === "win"
      ? `The human wins outright with ${options.humanLines} line(s); the best bot scores ${result.topBotLines}.\n`
      : `The human loses their stake unless they beat ${result.topBotLines} line(s).\n`,
  );
  const pot = result.entryFee * BigInt(result.entrants + 1);
  process.stdout.write(`Pot if the human enters: ${formatUnitsFixed(pot, result.decimals)}\n`);
}
