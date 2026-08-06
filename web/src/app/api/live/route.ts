import { LiveFeedSource } from "@/lib/live-feed";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const globalLive = globalThis as typeof globalThis & { momentGridLive?: LiveFeedSource };

function getLiveSource() {
  const endpoint = process.env.LIVE_FEED_URL;
  if (!endpoint) return null;
  globalLive.momentGridLive ??= new LiveFeedSource({ endpoint, apiKey: process.env.LIVE_FEED_API_KEY });
  return globalLive.momentGridLive;
}

export async function GET() {
  const source = getLiveSource();
  if (!source) return NextResponse.json({ error: "Live feed is not configured." }, { status: 503 });
  return NextResponse.json(await source.status(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const source = getLiveSource();
  if (!source) return NextResponse.json({ error: "Live feed is not configured." }, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as { action?: "start" | "reset" };
  if (body.action === "start") return NextResponse.json(await source.start());
  if (body.action === "reset") return NextResponse.json(await source.reset());
  return NextResponse.json({ error: "Use action 'start' or 'reset'." }, { status: 400 });
}
