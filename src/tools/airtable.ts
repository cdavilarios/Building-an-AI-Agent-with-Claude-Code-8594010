import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";

const AIRTABLE_MCP_URL = "https://mcp.airtable.com/mcp/";

export async function getAirtableMcp() {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey) {
    throw new Error(
      "AIRTABLE_API_KEY is not set. Add it to .env or your Codespaces secrets.",
    );
  }
  if (!baseId) {
    throw new Error(
      "AIRTABLE_BASE_ID is not set. Copy it from the Airtable base URL (app...) into .env or your Codespaces secrets.",
    );
  }

  return createMCPClient({
    transport: {
      type: "http",
      url: AIRTABLE_MCP_URL,
      headers: { Authorization: `Bearer ${apiKey}` },
    },
  });
}
