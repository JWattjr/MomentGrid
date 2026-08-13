import { ConflictException } from "@nestjs/common";
import { MatchSnapshot } from "@moment-grid/scoring";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainService } from "../chain/chain.service";
import type { AppConfig } from "../config/configuration";
import type { MatchService } from "../match/match.service";
import type { SettlementService } from "../settlement/settlement.service";
import type { SettlementJobDocument } from "../settlement/schemas/settlement-job.schema";
import { ROUND_STATE, RoundKeeperService } from "./round-keeper.service";
import type { KeeperTaskDocument } from "./schemas/keeper-task.schema";

const ROUND_ID = 7;

/// Stand-in for the Mongoose model whose unique index on `key` is the lock.
/// `create` enforces the same constraint, which is the behaviour under test.
function makeTaskModel() {
  const rows = new Map<string, KeeperTaskDocument>();

  return {
    rows,
    findOne: vi.fn((filter: { key: string }) => ({
      exec: async () => rows.get(filter.key) ?? null,
    })),
    updateOne: vi.fn((filter: { key: string }, update: { $set: Record<string, unknown> }) => ({
      exec: async () => {
        const row = rows.get(filter.key);
        if (row) Object.assign(row, update.$set);
        return { acknowledged: true };
      },
    })),
    create: vi.fn(async (input: { key: string; status: string; attempts: number }) => {
      if (rows.has(input.key)) {
        throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
      }
      const doc = { ...input, txHash: null, error: null, finishedAt: null, save: vi.fn() };
      doc.save = vi.fn(async () => doc);
      rows.set(input.key, doc as unknown as KeeperTaskDocument);
      return doc;
    }),
  };
}

type Options = {
  phase?: MatchSnapshot["phase"];
  state?: number;
  entrantCount?: number;
  latestRoundId?: bigint;
  automationEnabled?: boolean;
  maxRetries?: number;
  chainConfigured?: boolean;
  settleImpl?: () => Promise<unknown>;
  existingJob?: { status: string } | null;
  demoBotConfigured?: boolean;
};

function makeKeeper(options: Options = {}) {
  const taskModel = makeTaskModel();

  const matches = {
    status: vi.fn(async () => ({ phase: options.phase ?? "running" }) as MatchSnapshot),
  } as unknown as MatchService;

  const chain = {
    isConfigured: options.chainConfigured ?? true,
    latestRoundId: vi.fn(async () => options.latestRoundId ?? BigInt(ROUND_ID)),
    roundSnapshot: vi.fn(async () => ({
      state: options.state ?? ROUND_STATE.open,
      entrantCount: options.entrantCount ?? 3,
    })),
    lockRound: vi.fn(async () => "0xlock"),
    createRound: vi.fn(async () => ({ roundId: BigInt(ROUND_ID + 1), txHash: "0xcreate" })),
    seedDemoBot: vi.fn(async () => "0xbot"),
  } as unknown as ChainService;

  const settlement = {
    jobFor: vi.fn(async () => (options.existingJob ?? null) as SettlementJobDocument | null),
    settle: vi.fn(options.settleImpl ?? (async () => ({ status: "complete" }))),
  } as unknown as SettlementService;

  const config = {
    keeper: {
      automationEnabled: options.automationEnabled ?? true,
      pollMs: 2_000,
      maxRetries: options.maxRetries ?? 3,
    },
    ...(options.demoBotConfigured ? { chain: { demoBotMnemonic: "configured" } } : {}),
  } as AppConfig;

  const keeper = new RoundKeeperService(chain, matches, settlement, taskModel as never, config);
  return { keeper, chain, matches, settlement, taskModel };
}

describe("RoundKeeperService auto-creation", () => {
  it("auto-creates round 1 when no rounds exist on chain", async () => {
    const { keeper, chain } = makeKeeper({ latestRoundId: 0n });
    await keeper.tick();
    expect(chain.createRound).toHaveBeenCalled();
    expect(keeper.status().roundId).toBe(ROUND_ID + 1);
  });

  it("auto-creates a new round when the latest round is settled", async () => {
    const { keeper, chain } = makeKeeper({ state: ROUND_STATE.settled });
    await keeper.tick();
    expect(chain.createRound).toHaveBeenCalled();
    expect(keeper.status().roundId).toBe(ROUND_ID + 1);
  });

  it("auto-creates a round immediately after settling", async () => {
    const { keeper, chain, settlement } = makeKeeper({ phase: "complete", state: ROUND_STATE.locked });
    await keeper.tick();
    expect(settlement.settle).toHaveBeenCalledWith(String(ROUND_ID));
    expect(chain.createRound).toHaveBeenCalled();
    expect(keeper.status().roundId).toBe(ROUND_ID + 1);
  });

  it("moves off an externally settled round and seeds the latest open round", async () => {
    const { keeper, chain, matches } = makeKeeper({ phase: "idle", demoBotConfigured: true });
    await keeper.tick();
    vi.mocked(chain.seedDemoBot).mockClear();

    vi.mocked(chain.latestRoundId).mockResolvedValue(BigInt(ROUND_ID + 1));
    vi.mocked(chain.roundSnapshot).mockImplementation(async (roundId) => ({
      state: roundId === BigInt(ROUND_ID) ? ROUND_STATE.settled : ROUND_STATE.open,
      entrantCount: 1,
    }));

    await keeper.tick();

    expect(keeper.status().roundId).toBe(ROUND_ID + 1);
    expect(chain.seedDemoBot).toHaveBeenCalledWith(BigInt(ROUND_ID + 1));
    expect(matches.status).toHaveBeenCalledTimes(2);
  });
});

describe("RoundKeeperService locking", () => {
  it("locks an open round once the match is running", async () => {
    const { keeper, chain } = makeKeeper({ phase: "running", state: ROUND_STATE.open });
    await keeper.tick();
    expect(chain.lockRound).toHaveBeenCalledWith(BigInt(ROUND_ID));
  });

  /// Locking closes entry, so an early lock would shut the player out of their
  /// own demo before they had a chance to submit.
  it("does not lock before the match starts", async () => {
    const { keeper, chain } = makeKeeper({ phase: "idle", state: ROUND_STATE.open });
    await keeper.tick();
    expect(chain.lockRound).not.toHaveBeenCalled();
  });

  it("does not lock a round nobody has entered", async () => {
    const { keeper, chain } = makeKeeper({ phase: "running", state: ROUND_STATE.open, entrantCount: 0 });
    await keeper.tick();
    expect(chain.lockRound).not.toHaveBeenCalled();
  });

  it("does not lock twice across repeated passes", async () => {
    const { keeper, chain } = makeKeeper({ phase: "running", state: ROUND_STATE.open });
    await keeper.tick();
    await keeper.tick();
    await keeper.tick();
    expect(chain.lockRound).toHaveBeenCalledTimes(1);
  });

  it("records the lock transaction hash", async () => {
    const { keeper, taskModel } = makeKeeper({ phase: "running", state: ROUND_STATE.open });
    await keeper.tick();
    expect(taskModel.updateOne).toHaveBeenCalledWith(
      { key: `lock:${ROUND_ID}` },
      expect.objectContaining({ $set: expect.objectContaining({ status: "complete", txHash: "0xlock" }) }),
    );
  });
});

describe("RoundKeeperService settlement", () => {
  it("settles once the match is complete and the round is locked", async () => {
    const { keeper, settlement } = makeKeeper({ phase: "complete", state: ROUND_STATE.locked });
    await keeper.tick();
    expect(settlement.settle).toHaveBeenCalledWith(String(ROUND_ID));
  });

  it("does not settle before the match finishes", async () => {
    const { keeper, settlement } = makeKeeper({ phase: "running", state: ROUND_STATE.locked });
    await keeper.tick();
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  it("skips a settlement another caller already completed", async () => {
    const { keeper, settlement } = makeKeeper({
      phase: "complete",
      state: ROUND_STATE.locked,
      existingJob: { status: "complete" },
    });
    await keeper.tick();
    expect(settlement.settle).not.toHaveBeenCalled();
  });

  /// A conflict means someone else is already settling. Counting it as a
  /// failure would burn the retry budget on a round that is going to succeed.
  it("treats a settlement conflict as a no-op rather than a failure", async () => {
    const { keeper } = makeKeeper({
      phase: "complete",
      state: ROUND_STATE.locked,
      settleImpl: async () => {
        throw new ConflictException("already running");
      },
    });
    await keeper.tick();
    expect(keeper.status().settlementAttempts).toBe(0);
    expect(keeper.status().lastError).toBeNull();
  });

  it("retries a failed settlement up to the configured limit and then stops", async () => {
    const settleImpl = vi.fn(async () => {
      throw new Error("rpc exploded");
    });
    const { keeper, settlement } = makeKeeper({
      phase: "complete",
      state: ROUND_STATE.locked,
      maxRetries: 2,
      settleImpl,
    });

    for (let pass = 0; pass < 5; pass += 1) await keeper.tick();

    expect(settlement.settle).toHaveBeenCalledTimes(2);
    expect(keeper.status().lastError).toContain("rpc exploded");
  });
});

describe("RoundKeeperService guards", () => {
  it("does not start polling when automation is disabled", async () => {
    const { keeper } = makeKeeper({ automationEnabled: false });
    await keeper.onModuleInit();
    expect(keeper.status().enabled).toBe(false);
    keeper.onModuleDestroy();
  });

  it("does not start polling without chain configuration", async () => {
    const { keeper } = makeKeeper({ chainConfigured: false });
    await keeper.onModuleInit();
    expect(keeper.status().enabled).toBe(false);
    keeper.onModuleDestroy();
  });

  it("survives a failing pass and keeps going", async () => {
    const { keeper, chain } = makeKeeper({ phase: "running", state: ROUND_STATE.open });
    vi.mocked(chain.roundSnapshot).mockRejectedValueOnce(new Error("rpc down"));

    await keeper.tick();
    expect(keeper.status().lastError).toContain("rpc down");

    await keeper.tick();
    expect(chain.lockRound).toHaveBeenCalledTimes(1);
  });
});

describe("RoundKeeperService status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports what it last did", async () => {
    const { keeper } = makeKeeper({ phase: "running", state: ROUND_STATE.open });
    await keeper.tick();
    const status = keeper.status();
    expect(status.roundId).toBe(ROUND_ID);
    expect(status.lastAction).toBe(`locked round ${ROUND_ID}`);
    expect(status.lastTick).not.toBeNull();
  });
});
