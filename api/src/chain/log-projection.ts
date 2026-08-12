import { Round } from "../rounds/schemas/round.schema";

/// Decodes MomentGrid event logs into the changes they imply.
///
/// Pure on purpose. The decoding used to live inside `IndexerService.handle`,
/// where exercising it meant standing up Mongo, so the branch that turns an
/// event into a database write was effectively untested. Here it is a function
/// from a log to a description of what should change, and the indexer becomes a
/// loop that applies whatever it is handed.

export type DecodedLog = {
  eventName?: string;
  args?: Record<string, unknown>;
  transactionHash?: string;
};

export type Projection =
  | { kind: "round"; roundId: string; patch: Partial<Round> }
  | { kind: "submission"; roundId: string; player: string; txHash: string }
  | {
      kind: "score";
      roundId: string;
      player: string;
      score: { markedMask: number; completedLines: number; eligible: boolean };
    }
  | { kind: "payout"; roundId: string; player: string; amount: string; refund: boolean }
  | { kind: "playerSync"; player: string };

const asString = (value: unknown, fallback = "0"): string =>
  value === undefined || value === null ? fallback : String(value);

const asNumber = (value: unknown): number => Number(value ?? 0);

/// Returns every change one log implies, or an empty list for events this
/// projection does not care about.
export function projectLog(log: DecodedLog): Projection[] {
  if (!log.eventName || !log.args) return [];
  const args = log.args;

  switch (log.eventName) {
    case "RoundCreated":
      return [
        {
          kind: "round",
          roundId: asString(args.roundId),
          patch: { state: "open", entryFeeAmount: asString(args.entryFee) },
        },
      ];

    case "RoundLocked":
      return [{ kind: "round", roundId: asString(args.roundId), patch: { state: "locked" } }];

    case "GridSubmitted":
      return [
        {
          kind: "submission",
          roundId: asString(args.roundId),
          player: asString(args.player, ""),
          txHash: log.transactionHash ?? "",
        },
      ];

    case "PlayerScored":
      return [
        {
          kind: "score",
          roundId: asString(args.roundId),
          player: asString(args.player, ""),
          score: {
            markedMask: asNumber(args.markedMask),
            completedLines: asNumber(args.completedLines),
            eligible: Boolean(args.eligible),
          },
        },
        // Fragments accrue during scoring, so the player's totals are stale the
        // moment this fires.
        { kind: "playerSync", player: asString(args.player, "") },
      ];

    case "WinningsAccrued":
      return [
        {
          kind: "payout",
          roundId: asString(args.roundId),
          player: asString(args.player, ""),
          amount: asString(args.amount),
          refund: Boolean(args.refund),
        },
      ];

    case "RoundSettled":
      return [
        {
          kind: "round",
          roundId: asString(args.roundId),
          patch: {
            state: "settled",
            highScore: asNumber(args.highScore),
            winnerCount: asNumber(args.winnerCount),
            potAmount: asString(args.pot),
            settledAt: new Date(),
          },
        },
      ];

    case "MegapotTicketPurchased":
      return [{ kind: "playerSync", player: asString(args.player, "") }];

    default:
      return [];
  }
}
