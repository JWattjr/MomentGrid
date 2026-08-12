import { describe, expect, it } from "vitest";
import { outcomeToViewModel, RoundOutcome, stageStates } from "./round-outcome";

const ONE = "1000000";

function makeOutcome(overrides: {
  result?: RoundOutcome["player"]["result"];
  payoutAmount?: string | null;
  claimableAmount?: string;
  completedLines?: number | null;
  eligible?: boolean | null;
  winnerCount?: number;
  entrantCount?: number;
  highScore?: number;
  state?: RoundOutcome["state"];
}): RoundOutcome {
  return {
    roundId: "1",
    state: overrides.state ?? "settled",
    entryToken: "0xtoken",
    entryFeeAmount: ONE,
    potAmount: "4000000",
    entrantCount: overrides.entrantCount ?? 4,
    winnerCount: overrides.winnerCount ?? 1,
    highScore: overrides.highScore ?? 8,
    player: {
      address: "0xplayer",
      entered: overrides.result !== "not-entered",
      completedLines: overrides.completedLines ?? 8,
      eligible: overrides.eligible ?? true,
      payoutAmount: overrides.payoutAmount === undefined ? "4000000" : overrides.payoutAmount,
      claimableAmount: overrides.claimableAmount ?? "4000000",
      result: overrides.result ?? "won",
    },
    settlement: null,
  };
}

describe("outcomeToViewModel", () => {
  it("states the amount won and offers a withdrawal", () => {
    const view = outcomeToViewModel(makeOutcome({ result: "won" }));
    expect(view.headline).toBe("You won 4.00 USDC");
    expect(view.tone).toBe("won");
    expect(view.netAmount).toBe("+3.00");
    expect(view.showWithdraw).toBe(true);
  });

  it("states the stake lost and the score that beat them", () => {
    const view = outcomeToViewModel(
      makeOutcome({ result: "lost", payoutAmount: "0", claimableAmount: "0", completedLines: 3, highScore: 8 }),
    );
    expect(view.headline).toBe("You lost your 1.00 USDC stake");
    expect(view.subline).toContain("Winning score was 8 lines");
    expect(view.subline).toContain("you had 3 lines");
    expect(view.tone).toBe("lost");
    expect(view.netAmount).toBe("−1.00");
    expect(view.showWithdraw).toBe(false);
  });

  /// A rejected grid pays nothing for a completely different reason, and a
  /// player who scored well deserves to know which happened.
  it("explains a loss caused by an ineligible grid", () => {
    const view = outcomeToViewModel(
      makeOutcome({ result: "lost", payoutAmount: "0", claimableAmount: "0", eligible: false }),
    );
    expect(view.subline).toContain("rejected at scoring");
  });

  /// Getting the stake back is not a win, and calling it one would be the most
  /// misleading thing the screen could say.
  it("calls a split pot what it is", () => {
    const view = outcomeToViewModel(
      makeOutcome({ result: "tied", payoutAmount: ONE, claimableAmount: ONE, winnerCount: 3 }),
    );
    expect(view.headline).toBe("Split pot · 1.00 USDC back");
    expect(view.tone).toBe("neutral");
    expect(view.netAmount).toBe("+0.00");
  });

  it("distinguishes a voided round from a loss", () => {
    const view = outcomeToViewModel(
      makeOutcome({ result: "refunded", payoutAmount: ONE, claimableAmount: ONE }),
    );
    expect(view.headline).toContain("Round void");
    expect(view.subline).toContain("every stake was returned");
    expect(view.tone).toBe("neutral");
  });

  it("shows scoring in progress before settlement", () => {
    const view = outcomeToViewModel(
      makeOutcome({ result: "pending", payoutAmount: null, state: "locked" }),
    );
    expect(view.tone).toBe("pending");
    expect(view.netAmount).toBeNull();
    expect(view.showWithdraw).toBe(false);
  });

  it("handles someone who never entered", () => {
    const view = outcomeToViewModel(makeOutcome({ result: "not-entered", payoutAmount: null }));
    expect(view.headline).toContain("did not enter");
    expect(view.showWithdraw).toBe(false);
  });

  it("hides the withdraw button once the balance is claimed", () => {
    const view = outcomeToViewModel(makeOutcome({ result: "won", claimableAmount: "0" }));
    expect(view.showWithdraw).toBe(false);
  });

  it("singularises a one-line score", () => {
    const view = outcomeToViewModel(
      makeOutcome({ result: "lost", payoutAmount: "0", claimableAmount: "0", completedLines: 1, highScore: 1 }),
    );
    expect(view.subline).toContain("1 line ");
    expect(view.subline).not.toContain("1 lines");
  });
});

describe("stageStates", () => {
  it("marks earlier stages done and the current one active", () => {
    expect(stageStates("revealing", "running")).toEqual(["done", "active", "waiting"]);
    expect(stageStates("scoring", "running")).toEqual(["active", "waiting", "waiting"]);
    expect(stageStates("settling", "running")).toEqual(["done", "done", "active"]);
  });

  it("marks everything done once settled", () => {
    expect(stageStates("complete", "complete")).toEqual(["done", "done", "done"]);
  });

  it("marks the stage that failed", () => {
    expect(stageStates("revealing", "failed")).toEqual(["waiting", "failed", "waiting"]);
  });

  it("waits when no settlement has started", () => {
    expect(stageStates(undefined, undefined)).toEqual(["waiting", "waiting", "waiting"]);
  });
});
