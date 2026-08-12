import { describe, expect, it } from "vitest";
import { projectLog } from "./log-projection";

const ROUND = "4";
const PLAYER = "0x1111111111111111111111111111111111111111";

describe("projectLog", () => {
  it("ignores a log it cannot decode", () => {
    expect(projectLog({})).toEqual([]);
    expect(projectLog({ eventName: "RoundCreated" })).toEqual([]);
    expect(projectLog({ eventName: "SomethingElse", args: {} })).toEqual([]);
  });

  it("opens a round and records the entry fee", () => {
    expect(projectLog({ eventName: "RoundCreated", args: { roundId: 4n, entryFee: 1_000_000n } })).toEqual([
      { kind: "round", roundId: ROUND, patch: { state: "open", entryFeeAmount: "1000000" } },
    ]);
  });

  it("locks a round", () => {
    expect(projectLog({ eventName: "RoundLocked", args: { roundId: 4n } })).toEqual([
      { kind: "round", roundId: ROUND, patch: { state: "locked" } },
    ]);
  });

  it("records a submission with its transaction hash", () => {
    expect(
      projectLog({ eventName: "GridSubmitted", args: { roundId: 4n, player: PLAYER }, transactionHash: "0xabc" }),
    ).toEqual([{ kind: "submission", roundId: ROUND, player: PLAYER, txHash: "0xabc" }]);
  });

  /// Fragments accrue while scoring, so the player's totals are stale the
  /// moment this fires and must be refreshed alongside the score.
  it("records a score and asks for the player's totals to be refreshed", () => {
    const projections = projectLog({
      eventName: "PlayerScored",
      args: { roundId: 4n, player: PLAYER, markedMask: 383, completedLines: 6, eligible: true },
    });

    expect(projections).toEqual([
      {
        kind: "score",
        roundId: ROUND,
        player: PLAYER,
        score: { markedMask: 383, completedLines: 6, eligible: true },
      },
      { kind: "playerSync", player: PLAYER },
    ]);
  });

  it("records a winner's payout", () => {
    expect(
      projectLog({
        eventName: "WinningsAccrued",
        args: { roundId: 4n, player: PLAYER, amount: 4_000_000n, refund: false },
      }),
    ).toEqual([{ kind: "payout", roundId: ROUND, player: PLAYER, amount: "4000000", refund: false }]);
  });

  it("distinguishes a refunded stake from a won share", () => {
    const [projection] = projectLog({
      eventName: "WinningsAccrued",
      args: { roundId: 4n, player: PLAYER, amount: 1_000_000n, refund: true },
    });
    expect(projection).toMatchObject({ kind: "payout", refund: true });
  });

  it("settles a round with its final numbers", () => {
    const [projection] = projectLog({
      eventName: "RoundSettled",
      args: { roundId: 4n, highScore: 8, winnerCount: 2, pot: 4_000_000n },
    });

    expect(projection).toMatchObject({
      kind: "round",
      roundId: ROUND,
      patch: { state: "settled", highScore: 8, winnerCount: 2, potAmount: "4000000" },
    });
  });

  it("refreshes totals after a ticket purchase", () => {
    expect(projectLog({ eventName: "MegapotTicketPurchased", args: { player: PLAYER } })).toEqual([
      { kind: "playerSync", player: PLAYER },
    ]);
  });

  /// A zero payout is a real fact — settled and won nothing — and must not be
  /// coerced into a missing value.
  it("keeps a zero amount rather than dropping it", () => {
    const [projection] = projectLog({
      eventName: "WinningsAccrued",
      args: { roundId: 4n, player: PLAYER, amount: 0n, refund: false },
    });
    expect(projection).toMatchObject({ amount: "0" });
  });
});
