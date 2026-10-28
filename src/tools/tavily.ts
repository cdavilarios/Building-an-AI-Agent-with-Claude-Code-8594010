import { tool } from "ai";
import { z } from "zod";

const MAX_RESULTS = 5;
const DEFAULT_RECENCY_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// SEO-spam finance listicles: surface for any company-name query, add no support-fit signal.
const BLOCKLIST = [
  "tipranks.com",
  "seekingalpha.com",
  "fool.com",
  "benzinga.com",
  "investorplace.com",
];

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  publishedDate: string;
};

type SearchInput = { query: string; recencyDays?: number };

type TavilyRawResult = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string | null;
};

function isBlocked(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return BLOCKLIST.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return true;
  }
}

export const searchWeb = tool({
  description:
    "Search the web for recent news about a company or topic (press releases, funding announcements, hiring news, product launches). " +
    "Use this when researching a prospect to find current buying signals. " +
    "Returns up to 5 results, each with title, url, snippet, and publishedDate, limited to the last `recencyDays` days (default 90).",
  inputSchema: z.object({
    query: z.string().describe("The search query, e.g. a company name plus a topic"),
    recencyDays: z
      .number()
      .int()
      .positive()
      .default(DEFAULT_RECENCY_DAYS)
      .describe("Only return results published within this many days"),
  }) as z.ZodType<SearchInput, SearchInput>, // widened so direct execute() callers may omit recencyDays
  execute: async ({ query, recencyDays }): Promise<SearchResult[]> => {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error(
        "TAVILY_API_KEY is not set. Add it to .env (see .env.example) to use searchWeb.",
      );
    }
    const days = recencyDays ?? DEFAULT_RECENCY_DAYS;

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        topic: "news", // only news-topic searches reliably populate published_date
        days,
        max_results: MAX_RESULTS * 2, // headroom: blocklist and date filters drop results
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Tavily search failed: ${response.status} ${response.statusText} — ${await response.text()}`,
      );
    }

    const data = (await response.json()) as { results?: TavilyRawResult[] };
    const cutoff = Date.now() - days * DAY_MS;
    const results: SearchResult[] = [];
    for (const r of data.results ?? []) {
      if (!r.url || isBlocked(r.url)) continue;
      const t = r.published_date ? Date.parse(r.published_date) : NaN;
      if (Number.isNaN(t) || t < cutoff) continue;
      results.push({
        title: r.title ?? "",
        url: r.url,
        snippet: r.content ?? "",
        publishedDate: r.published_date!,
      });
      if (results.length === MAX_RESULTS) break;
    }
    return results;
  },
});
