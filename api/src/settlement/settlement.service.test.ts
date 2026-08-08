import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { eventsToWindowBitmaps, replayMatchEvents } from "@moment-grid/scoring";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChainService } from "../chain/chain.service";
import type { MatchService } from "../match/match.service";
import { SettlementService } from "./settlement.service";
import type { SettlementJobDocument } from "./schemas/settlement-job.schema";

const PLAYER_A = "0x1111111111111111111111111111111111111111";
const PLAYER_B = "0x2222222222222222222222222222222222222222";

/// Minimal stand-in for the Mongoose model. `create` enforces the same unique
/// constraint the real `roundId` index does, which is what the lock relies on.
function makeJobModel() {
  const rows = new Map<string, SettlementJobDocument>();

  const makeDoc = (roundId: string, windows: string[]): SettlementJobDocument => {
    const doc = {
      roundId,
      status: "running" as const,
      eventsByWindow: windows,
      transactions: [] as string[],
      players: [] as string[],
      error: null as string | null,
      finishedAt: null as Date | null,
      save: vi.fn(async () => doc),
    };
    return doc as unknown as SettlementJobDocument;
  };

  return {
    rows,
    findOne: vi.fn((filter: { roundId: string }) => ({
      exec: async () => rows.get(filter.roundId) ?? null,
    })),
    create: vi.fn(async (input: { roundId: string; eventsByWindow: string[] }) => {
      if (rows.has(input.roundId)) {
        throw Object.assign(new Error("E11000 duplicate key error"), { code: 11000 });
      }
      const doc = makeDoc(input.roundId, input.eventsByWindow);
      rows.set(input.roundId, doc);
      return doc;
    }),
  };
}

function makeServices(overrides?: { complete?: boolean; entrants?: string[] }) {
  const jobModel = makeJobModel();

  const matches = {
    finalEvents: vi.fn(async () => ({
      complete: overrides?.complete ?? true,
      events: replayMatchEvents(),
    })),
  } as unknown as MatchService;

  const chain = {
    entrantsOf: vi.fn(async () => overrides?.entrants ?? [PLAYER_A, PLAYER_B]),
    resolvePlayerScore: vi.fn(async (_round: bigint, player: string) => [`0xprepare-${player}`, `0xresolve-${player}`]),
    settleRound: vi.fn(async () => "0xsettle"),
  } as unknown as ChainService;

  const service = new SettlementService(jobModel as never, chain, matches);
  return { service, jobModel, chain, matches };
}

describe("SettlementService.deriveWindows", () => {
  it("computes the bitmaps from the match record rather than trusting a caller", async () => {
    const { service, matches } = makeServices();

    const { windows } = await service.deriveWindows();

    expect(windows).toEqual(eventsToWindowBitmaps(replayMatchEvents()));
    expect(matches.finalEvents).toHaveBeenCalled();
  });

  it("refuses to settle a match that has not finished", async () => {
    const { service } = makeServices({ complete: false });

    await expect(service.deriveWindows()).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe("SettlementService.settle", () => {
  it("resolves every entrant then settles the round once", async () => {
    const { service, chain } = makeServices();

    const result = await service.settle("1");

    expect(result.status).toBe("complete");
    expect(result.players).toEqual([PLAYER_A, PLAYER_B]);
    expect(chain.resolvePlayerScore).toHaveBeenCalledTimes(2);
    expect(chain.settleRound).toHaveBeenCalledTimes(1);
    expect(result.transactions).toHaveLength(5);
    expect(result.eventsByWindow).toEqual(eventsToWindowBitmaps(replayMatchEvents()).map(String));
  });

  it("passes the derived windows to both the reveal and the settle call", async () => {
    const { service, chain } = makeServices();
    const expected = eventsToWindowBitmaps(replayMatchEvents());

    await service.settle("7");

    expect(chain.resolvePlayerScore).toHaveBeenCalledWith(7n, PLAYER_A, expected);
    expect(chain.settleRound).toHaveBeenCalledWith(7n, expected);
  });

  it("lets exactly one of two concurrent settlements through", async () => {
    const { service, chain } = makeServices();

    const outcomes = await Promise.allSettled([service.settle("1"), service.settle("1")]);
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(chain.settleRound).toHaveBeenCalledTimes(1);
  });

  it("refuses to settle the same round twice", async () => {
    const { service } = makeServices();
    await service.settle("1");

    await expect(service.settle("1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("marks the job failed and rethrows when the chain call fails", async () => {
    const { service, chain, jobModel } = makeServices();
    vi.mocked(chain.settleRound).mockRejectedValueOnce(new Error("insufficient funds"));

    await expect(service.settle("3")).rejects.toThrow("insufficient funds");
    expect(jobModel.rows.get("3")?.status).toBe("failed");
    expect(jobModel.rows.get("3")?.error).toBe("insufficient funds");
  });

  it("retries a previously failed round instead of deadlocking on it", async () => {
    const { service, chain } = makeServices();
    vi.mocked(chain.settleRound).mockRejectedValueOnce(new Error("nonce too low"));
    await expect(service.settle("4")).rejects.toThrow("nonce too low");

    const result = await service.settle("4");
    expect(result.status).toBe("complete");
  });

  it("rejects a round with no entrants", async () => {
    const { service } = makeServices({ entrants: [] });

    await expect(service.settle("1")).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it("rejects a malformed entrant address rather than sending a doomed transaction", async () => {
    const { service, chain } = makeServices({ entrants: [PLAYER_A, "not-an-address"] });

    await expect(service.settle("1")).rejects.toThrow(/malformed entrant addresses/);
    expect(chain.settleRound).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "abc", ""])("rejects round id %j", async (roundId) => {
    const { service } = makeServices();

    await expect(service.settle(roundId)).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
