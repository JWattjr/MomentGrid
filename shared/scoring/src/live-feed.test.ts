import { describe, expect, it } from "vitest";
import { LiveFeedSource } from "./live-feed";
import { MatchSource } from "./match";

describe("LiveFeedSource", () => {
  it("implements the replay source contract and normalizes provider events", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          minute: 45,
          status: "live",
          events: [
            { minute: 12.2, type: "home shot" },
            { minute: 34, eventType: "var_review" },
            { minute: 40, type: "substitute_goal", team: "away" },
            { minute: 66, type: "unsupported" },
            { minute: 90, type: "home_goal" },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    const source: MatchSource = new LiveFeedSource({ endpoint: "https://feed.test/match", fetcher });

    const snapshot = await source.start();
    expect(snapshot.phase).toBe("running");
    expect(snapshot.progress).toBe(0.5);
    expect(snapshot.events).toEqual([
      { minute: 12.2, eventType: "HOME_SHOT" },
      { minute: 34, eventType: "VAR_REVIEW" },
      { minute: 40, eventType: "SUBSTITUTE_GOAL", team: "away" },
    ]);
  });

  it("stays idle until started and resets without persistence", async () => {
    let calls = 0;
    const source = new LiveFeedSource({
      endpoint: "https://feed.test/match",
      fetcher: async () => {
        calls += 1;
        return Response.json({ minute: 90, status: "complete", events: [] });
      },
    });

    expect((await source.status()).phase).toBe("idle");
    expect(calls).toBe(0);
    expect((await source.start()).phase).toBe("complete");
    expect(calls).toBe(1);
    expect((await source.reset()).phase).toBe("idle");
  });

  it("requires an endpoint", () => {
    expect(() => new LiveFeedSource({ endpoint: "" })).toThrow(/endpoint is required/);
  });

  it("reports which endpoint failed rather than a bare status code", async () => {
    const source = new LiveFeedSource({
      endpoint: "https://feed.test/match",
      fetcher: async () => new Response("nope", { status: 503 }),
    });
    await source.start().catch(() => undefined);
    await expect(source.status()).rejects.toThrow(/https:\/\/feed.test\/match failed.*503/);
  });
});
