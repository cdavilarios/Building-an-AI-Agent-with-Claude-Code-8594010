import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolCallOptions } from "@ai-sdk/provider-utils";
import type { ZodType } from "zod";
import { searchWeb } from "../../src/tools/tavily.ts";

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate: string;
};

const OPTIONS = { toolCallId: "test", messages: [] } satisfies ToolCallOptions;
const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_BLOCKLIST = [
  "tipranks.com",
  "seekingalpha.com",
  "fool.com",
  "benzinga.com",
];

async function run(input: { query: string; recencyDays?: number }) {
  return (await searchWeb.execute!(input, OPTIONS)) as SearchResult[];
}

const HAS_KEY = !!process.env.TAVILY_API_KEY;
if (!HAS_KEY) {
  console.warn("[skip] TAVILY_API_KEY unset — Tavily real-API suite skipped");
}

describe("Tavily — missing env (always runs)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws a clear, actionable error when TAVILY_API_KEY is missing", async () => {
    vi.stubEnv("TAVILY_API_KEY", "");
    await expect(run({ query: "q" })).rejects.toThrow(/TAVILY_API_KEY/);
  });
});

describe("Tavily — static contract (always runs)", () => {
  it("defaults recencyDays to 90 when the caller omits it", () => {
    const parsed = (searchWeb.inputSchema as unknown as ZodType).parse({
      query: "q",
    }) as { recencyDays?: number };
    expect(parsed.recencyDays).toBe(90);
  });

  it("declares a blocklist const array with the required domains and 5+ entries", () => {
    const source = readFileSync("src/tools/tavily.ts", "utf8");
    const match = source.match(/const\s+\w*(?:BLOCK|block)\w*[^=]*=\s*\[([^\]]*)\]/);
    expect(match, "blocklist const array not found in src/tools/tavily.ts").toBeTruthy();
    const entries = [...match![1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]);
    for (const domain of REQUIRED_BLOCKLIST) expect(entries).toContain(domain);
    expect(entries.length).toBeGreaterThanOrEqual(5);
  });
});

describe.skipIf(!HAS_KEY)("Tavily — real API", () => {
  it("returns a non-empty result list for a normal query", async () => {
    const results = await run({ query: "Stripe funding announcement" });
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns results with exactly { title, url, snippet, publishedDate }", async () => {
    const results = await run({ query: "Stripe funding announcement" });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(Object.keys(r).sort()).toEqual(
        ["publishedDate", "snippet", "title", "url"],
      );
    }
  });

  it("returns only results with a parseable publishedDate inside the recencyDays window", async () => {
    const recencyDays = 30;
    const results = await run({ query: "Stripe funding announcement", recencyDays });
    expect(results.length).toBeGreaterThan(0);
    const now = Date.now();
    for (const r of results) {
      const t = Date.parse(r.publishedDate);
      expect(Number.isNaN(t), `unparseable date: ${r.publishedDate}`).toBe(false);
      expect(now - t).toBeLessThanOrEqual(recencyDays * DAY_MS);
    }
  });

  it("excludes results from blocklisted domains", async () => {
    const results = await run({
      query: "Nvidia stock analysis buy or sell tipranks seekingalpha fool benzinga",
    });
    for (const r of results) {
      const host = new URL(r.url).hostname.replace(/^www\./, "");
      for (const domain of REQUIRED_BLOCKLIST) {
        expect(host === domain || host.endsWith(`.${domain}`)).toBe(false);
      }
    }
  });

  it("sends topic: 'news' in the Tavily request body", async () => {
    // Pass-through spy on the real fetch — observes the request, still hits the real API.
    const realFetch = globalThis.fetch;
    const bodies: unknown[] = [];
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input instanceof Request ? input.url : input).includes("tavily")) {
        bodies.push(JSON.parse(String(init?.body ?? "{}")));
      }
      return realFetch(input, init);
    });
    try {
      await run({ query: "Stripe funding announcement" });
    } finally {
      spy.mockRestore();
    }
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toMatchObject({ topic: "news" });
  });
});
