import replayFixture from "@/data/replay-match.json";
import { MatchEvent } from "@/lib/match-source";
import { ReplayClock } from "@/lib/replay-clock";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalReplay = globalThis as typeof globalThis & {
  momentGridReplay?: ReplayClock;
  momentGridDurationMs?: number;
};

function getReplay(durationMs = 120_000) {
  if (!globalReplay.momentGridReplay || globalReplay.momentGridDurationMs !== durationMs) {
    globalReplay.momentGridReplay = new ReplayClock(replayFixture as MatchEvent[], durationMs);
    globalReplay.momentGridDurationMs = durationMs;
  }
  return globalReplay.momentGridReplay;
}

export async function GET() {
  return NextResponse.json(getReplay(globalReplay.momentGridDurationMs).status(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    action?: "start" | "reset";
    durationSeconds?: number;
  };

  if (body.action === "start") {
    const seconds = Math.min(600, Math.max(15, body.durationSeconds ?? 120));
    return NextResponse.json(getReplay(seconds * 1000).start());
  }

  if (body.action === "reset") {
    return NextResponse.json(getReplay(globalReplay.momentGridDurationMs).reset());
  }

  return NextResponse.json({ error: "Use action 'start' or 'reset'." }, { status: 400 });
}
