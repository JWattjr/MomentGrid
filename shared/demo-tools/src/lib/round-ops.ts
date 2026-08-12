import { TIER_POOLS } from "@moment-grid/scoring";
import { erc20Abi, formatUnitsFixed, momentGridAbi, sendAndConfirm, type DemoClients } from "./chain.js";
import type { DemoConfig } from "./env.js";

/// The chain operations the demo scripts share, so `create-round` and
/// `new-demo-round` cannot drift apart in how they open a round.

export async function entryTokenDecimals(clients: DemoClients, config: DemoConfig): Promise<number> {
  return clients.publicClient.readContract({
    address: config.entryTokenAddress,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export type CreatedRound = { roundId: bigint; txHash: string; entryFee: bigint };

/// Opens a round with the tier pools derived from the prediction set.
export async function createRound(
  clients: DemoClients,
  config: DemoConfig,
  entryFee: bigint,
): Promise<CreatedRound> {
  const pools = TIER_POOLS as readonly [bigint, bigint, bigint];

  const txHash = await sendAndConfirm(clients, "createRound", () =>
    clients.walletClient.writeContract({
      account: clients.keeper,
      chain: clients.walletClient.chain,
      address: config.momentGridAddress,
      abi: momentGridAbi,
      functionName: "createRound",
      args: [0n, entryFee, [pools[0], pools[1], pools[2]]],
    }),
  );

  const roundId = await clients.publicClient.readContract({
    address: config.momentGridAddress,
    abi: momentGridAbi,
    functionName: "roundCount",
  });

  return { roundId, txHash, entryFee };
}

/// Resets the API's match record so the replay starts from the beginning.
///
/// Unauthenticated by design on the API side, so no secret is needed here — but
/// it will fail loudly if the API is not running, which is worth knowing before
/// the demo rather than during it.
export async function resetMatch(config: DemoConfig): Promise<void> {
  const url = `${config.apiUrl}/match/reset`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Could not reach the API at ${url} to reset the match: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`Resetting the match failed with ${response.status} at ${url}.`);
  }
}

export function printRoundEnv(roundId: bigint, entryFee: bigint, decimals: number): void {
  process.stdout.write(`\nRound ${roundId} is open at ${formatUnitsFixed(entryFee, decimals)} per entry.\n`);
  process.stdout.write(`The API keeper will auto-discover it from chain — no env edit needed.\n`);
}
