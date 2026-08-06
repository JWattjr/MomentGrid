import { handleTypes } from "@inco/lightning-js";
import { Lightning } from "@inco/lightning-js/lite";
import { Address } from "viem";
import { PredictionId } from "./match-source";

export const MOMENT_IDS: Record<PredictionId, number> = {
  HOME_TWO_SHOTS_30: 1,
  GOAL_FIRST_30: 2,
  TWO_CORNERS_30: 3,
  CARD_30_60: 4,
  GOAL_30_60: 5,
  TWO_SUBS_BY_60: 6,
  TWO_SUBS_AFTER_60: 7,
  CARD_AFTER_75: 8,
  TWO_CORNERS_AFTER_60: 9,
  HOME_SCORES_FIRST: 10,
  GOAL_BEFORE_20: 11,
  YELLOW_BEFORE_30: 12,
  VAR_30_60: 13,
  BOTH_SCORE_BY_60: 14,
  TWO_GOALS_BY_60: 15,
  BOTH_SCORE_FULL_TIME: 16,
  FOUR_CARDS_FULL_TIME: 17,
  GOAL_AFTER_75: 18,
  PENALTY_BEFORE_30: 19,
  AWAY_LEADS_30: 20,
  GOAL_OVERTURNED_30: 21,
  PENALTY_30_60: 22,
  SUBSTITUTE_GOAL_BY_60: 23,
  THREE_GOALS_BY_60: 24,
  GOAL_AFTER_80: 25,
  SUBSTITUTE_GOAL_AFTER_60: 26,
  EXTRA_TIME: 27,
};

export function packGrid(grid: PredictionId[]): bigint {
  if (grid.length !== 9) throw new Error("A Moment Grid must contain exactly nine predictions.");
  return grid.reduce((packed, moment, cell) => packed | (BigInt(MOMENT_IDS[moment]) << BigInt(cell * 8)), 0n);
}

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
  const lightning = await Lightning.baseSepoliaTestnet({ hostChainRpcUrls: rpcUrl ? [rpcUrl] : undefined });
  return lightning.encrypt(packGrid(grid), {
    accountAddress,
    dappAddress: gridStoreAddress,
    handleType: handleTypes.euint256,
  });
}
