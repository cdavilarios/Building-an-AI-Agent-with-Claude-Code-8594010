import { afterEach, describe, expect, it, vi } from "vitest";
import { getAirtableMcp } from "../../src/tools/airtable.ts";

const REQUIRED_TOOLS = [
  "list_tables_for_base",
  "list_records_for_table",
  "create_records_for_table",
  "update_records_for_table",
  "delete_records_for_table",
];

const HAS_ENV = !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID;
if (!HAS_ENV) {
  console.warn(
    "[skip] AIRTABLE_API_KEY or AIRTABLE_BASE_ID unset — Airtable real-API suite skipped",
  );
}

describe("Airtable MCP — missing env (always runs)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws a clear error naming AIRTABLE_API_KEY when it is missing", async () => {
    vi.stubEnv("AIRTABLE_API_KEY", "");
    vi.stubEnv("AIRTABLE_BASE_ID", "appTEST");
    await expect(getAirtableMcp()).rejects.toThrow(/AIRTABLE_API_KEY/);
  });

  it("throws a clear error naming AIRTABLE_BASE_ID when it is missing", async () => {
    vi.stubEnv("AIRTABLE_API_KEY", "patTEST");
    vi.stubEnv("AIRTABLE_BASE_ID", "");
    await expect(getAirtableMcp()).rejects.toThrow(/AIRTABLE_BASE_ID/);
  });
});

describe.skipIf(!HAS_ENV)("Airtable MCP — real API", () => {
  it("connects, discovers the pinned CRUD tool names, and closes cleanly", async () => {
    const client = await getAirtableMcp();
    try {
      const tools = await client.tools();
      for (const name of REQUIRED_TOOLS) {
        expect(Object.keys(tools)).toContain(name);
      }
    } finally {
      await expect(client.close()).resolves.not.toThrow();
    }
  });
});
