import { describe, expect, it, vi } from "vitest";
import type { ChainService } from "../chain/chain.service";
import type { SettlementService } from "../settlement/settlement.service";
import { RoundOutcomeService } from "./round-outcome.service";
import type { RoundsService } from "./rounds.service";
import type { EntryDocument } from "./schemas/entry.schema";
import type { RoundDocument } from "./schemas/round.schema";

const ROUND_ID = "3";
const PLAYER = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const ONE_USDC = "1000000";

type RoundOverrides = Partial<{
  state: "open" | "locked" | "settled";
  winnerCount: number;
  potAmount: string;
  entrantCount: number;
  highScore: number;
}>;

type EntryOverrides = Partial<{
  completedLines: number;
  eligible: boolean;
  payoutAmount: string | null;
  refunded: boolean | null;
}>;

function makeService(options: {
  round?: RoundOverrides;
  entry?: EntryOverrides | null;
  chainConfigured?: boolean;
  onChainPayout?: bigint;
  claimable?: bigint;
  job?: { status: string; stage: string } | null;
}) {
  const round = {
    roundId: ROUND_ID,
    state: options.round?.state ?? "settled",
    entryToken: "0xtoken",
    entryFeeAmount: ONE_USDC,
    potAmount: options.round?.potAmount ?? "4000000",
    entrantCount: options.round?.entrantCount ?? 4,
    winnerCount: options.round?.winnerCount ?? 1,
    highScore: options.round?.highScore ?? 8,
  } as unknown as RoundDocument;

  const entry =
    options.entry === null
      ? null
      : ({
          player: PLAYER.toLowerCase(),
          completedLines: options.entry?.completedLines ?? 8,
          eligible: options.entry?.eligible ?? true,
          payoutAmount: options.entry?.payoutAmount === undefined ? "4000000" : options.entry.payoutAmount,
          refunded: options.entry?.refunded ?? false,
        } as unknown as EntryDocument);

  const rounds = {
    find: vi.fn(async () => round),
    entries: vi.fn(async () => (entry ? [entry] : [])),
  } as unknown as RoundsService;

  const chain = {
    isConfigured: options.chainConfigured ?? true,
    claimableOf: vi.fn(async () => options.claimable ?? 0n),
    roundOutcomeOf: vi.fn(async () => ({
      lines: 8,
      eligible: true,
      amount: options.onChainPayout ?? 0n,
      claimableTotal: options.claimable ?? 0n,
    })),
  } as unknown as ChainService;

  const settlement = {
    jobFor: vi.fn(async () =>
      options.job
        ? ({ ...options.job, playersResolved: 2, playersTotal: 4, transactions: [], error: null } as never)
        : null,
    ),
  } as unknown as SettlementService;

  return { service: new RoundOutcomeService(rounds, chain, settlement), chain };
}

describe("RoundOutcomeService result", () => {
  it("reports a win when the payout beats the stake", async () => {
    const { service } = makeService({ entry: { payoutAmount: "4000000" } });
    const outcome = await service.forPlayer(ROUND_ID, PLAYER);
    expect(outcome.player.result).toBe("won");
    expect(outcome.player.payoutAmount).toBe("4000000");
  });

  it("reports a loss when the player is owed nothing", async () => {
    const { service } = makeService({ entry: { payoutAmount: "0", completedLines: 2 } });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).player.result).toBe("lost");
  });

  /// Getting the stake back alongside other winners is a split pot, which reads
  /// very differently to the player than an outright win.
  it("reports a tie when the payout equals the stake and there are several winners", async () => {
    const { service } = makeService({
      entry: { payoutAmount: ONE_USDC },
      round: { winnerCount: 3 },
    });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).player.result).toBe("tied");
  });

  it("reports an outright win when a sole winner's payout happens to equal the stake", async () => {
    const { service } = makeService({
      entry: { payoutAmount: ONE_USDC },
      round: { winnerCount: 1 },
    });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).player.result).toBe("won");
  });

  it("reports a refund when the round voided", async () => {
    const { service } = makeService({ entry: { payoutAmount: ONE_USDC, refunded: true } });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).player.result).toBe("refunded");
  });

  it("stays pending while the round is unsettled", async () => {
    const { service } = makeService({ round: { state: "locked" }, entry: { payoutAmount: null } });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).player.result).toBe("pending");
  });

  it("reports not-entered for someone who never submitted", async () => {
    const { service } = makeService({ entry: null });
    const outcome = await service.forPlayer(ROUND_ID, OTHER);
    expect(outcome.player.result).toBe("not-entered");
    expect(outcome.player.entered).toBe(false);
  });
});

describe("RoundOutcomeService indexer lag", () => {
  /// The indexer polls every eight seconds but the reward screen appears the
  /// instant settlement finishes, so a settled round with no projected payout
  /// must fall back to the contract rather than render a blank card.
  it("falls back to the contract when the projection has not caught up", async () => {
    const { service, chain } = makeService({
      round: { state: "settled" },
      entry: { payoutAmount: null },
      onChainPayout: 4_000_000n,
    });

    const outcome = await service.forPlayer(ROUND_ID, PLAYER);
    expect(chain.roundOutcomeOf).toHaveBeenCalled();
    expect(outcome.player.payoutAmount).toBe("4000000");
    expect(outcome.player.result).toBe("won");
  });

  it("prefers the projected payout when it exists", async () => {
    const { service, chain } = makeService({ entry: { payoutAmount: "4000000" } });
    await service.forPlayer(ROUND_ID, PLAYER);
    expect(chain.roundOutcomeOf).not.toHaveBeenCalled();
  });

  it("does not reach for the chain on an unsettled round", async () => {
    const { service, chain } = makeService({ round: { state: "open" }, entry: { payoutAmount: null } });
    await service.forPlayer(ROUND_ID, PLAYER);
    expect(chain.roundOutcomeOf).not.toHaveBeenCalled();
  });

  it("degrades to pending rather than throwing when the chain read fails", async () => {
    const { service, chain } = makeService({ entry: { payoutAmount: null } });
    vi.mocked(chain.roundOutcomeOf).mockRejectedValueOnce(new Error("rpc down"));

    const outcome = await service.forPlayer(ROUND_ID, PLAYER);
    expect(outcome.player.payoutAmount).toBeNull();
    expect(outcome.player.result).toBe("pending");
  });

  it("returns zero claimable when the chain is not configured", async () => {
    const { service } = makeService({ chainConfigured: false, entry: { payoutAmount: "4000000" } });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).player.claimableAmount).toBe("0");
  });
});

describe("RoundOutcomeService settlement progress", () => {
  it("passes through the stage the settlement has reached", async () => {
    const { service } = makeService({ job: { status: "running", stage: "revealing" } });
    const outcome = await service.forPlayer(ROUND_ID, PLAYER);
    expect(outcome.settlement).toMatchObject({ status: "running", stage: "revealing", playersTotal: 4 });
  });

  it("reports no settlement when none has been attempted", async () => {
    const { service } = makeService({ job: null });
    expect((await service.forPlayer(ROUND_ID, PLAYER)).settlement).toBeNull();
  });
});
