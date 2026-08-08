import { handleTypes } from "@inco/lightning-js";
import { Lightning } from "@inco/lightning-js/lite";
import { packGrid, PredictionId } from "@moment-grid/scoring";
import { Address } from "viem";

/// Encrypts a completed grid for one player and one grid-store deployment.
/// The packing rule itself lives in `@moment-grid/scoring` so the API and the
/// contracts agree on the byte layout; this file only adds the Inco client.
export async function encryptGrid({
  grid,
  accountAddress,
  gridStoreAddress,
}: {
  grid: PredictionId[];
  accountAddress: Address;
  gridStoreAddress: Address;
}) {
  const rpcUrl = process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL;

  try {
    const lightning = await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: rpcUrl ? [rpcUrl] : undefined });
    return await lightning.encrypt(packGrid(grid), {
      accountAddress,
      dappAddress: gridStoreAddress,
      handleType: handleTypes.euint256,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    throw new Error(`Could not encrypt the grid for Inco Lightning: ${reason}`);
  }
}
