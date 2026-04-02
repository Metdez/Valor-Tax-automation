import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

// ---------------------------------------------------------------------------
// MCP helper — calls GHL MCP server via JSON-RPC 2.0 over SSE
// ---------------------------------------------------------------------------

const GHL_MCP_URL = "https://services.leadconnectorhq.com/mcp/";

/**
 * Sends a JSON-RPC 2.0 `tools/call` request to the GHL MCP server.
 * The response is SSE-formatted — we parse `data:` lines to extract the
 * JSON-RPC result, then pull text from `result.content[]`.
 *
 * @param {string} toolName  MCP tool name (e.g. "contacts_get-contacts")
 * @param {object} args      Tool arguments
 * @returns {string}         Concatenated text content from MCP response
 */
async function callMcpTool(toolName, args) {
  const apiKey = process.env.GHL_API_KEY;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!apiKey) throw new Error("Missing GHL_API_KEY");
  if (!locationId) throw new Error("Missing GHL_LOCATION_ID");

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: { name: toolName, arguments: args },
  });

  const res = await fetch(GHL_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      locationId,
    },
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`MCP ${toolName} HTTP ${res.status}: ${text}`);
  }

  // Response may be SSE (text/event-stream) or plain JSON
  const contentType = res.headers.get("content-type") || "";
  let rpcResult;

  if (contentType.includes("text/event-stream")) {
    const raw = await res.text();
    const dataLines = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    // Find the last parseable JSON-RPC response in the SSE stream
    for (let i = dataLines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(dataLines[i]);
        if (parsed.result !== undefined || parsed.error !== undefined) {
          rpcResult = parsed;
          break;
        }
      } catch {
        // skip non-JSON lines
      }
    }

    if (!rpcResult) {
      throw new Error(`MCP ${toolName}: no JSON-RPC result found in SSE stream`);
    }
  } else {
    rpcResult = await res.json();
  }

  // Check for JSON-RPC error
  if (rpcResult.error) {
    throw new Error(
      `MCP ${toolName} error: ${rpcResult.error.message || JSON.stringify(rpcResult.error)}`
    );
  }

  const result = rpcResult.result;

  // Check for MCP-level error flag
  if (result?.isError) {
    throw new Error(
      `MCP ${toolName} returned error: ${JSON.stringify(result.content || result)}`
    );
  }

  // Extract text from result.content[] (MCP tool response format)
  if (Array.isArray(result?.content)) {
    return result.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
  }

  // Fallback: stringify the result
  return typeof result === "string" ? result : JSON.stringify(result);
}

// ---------------------------------------------------------------------------
// LangGraph tools — thin wrappers around callMcpTool
// ---------------------------------------------------------------------------

const searchContactsTool = tool(
  async ({ query }) => {
    return callMcpTool("contacts_get-contacts", {
      query_locationId: process.env.GHL_LOCATION_ID,
      query_query: query,
      query_limit: 3,
    });
  },
  {
    name: "search_contacts",
    description:
      "Search GHL contacts by email, phone, or name. Returns up to 3 matching contacts with their IDs and details.",
    schema: z.object({
      query: z.string().describe("Email, phone number, or name to search for"),
    }),
  }
);

const getCalendarEventsTool = tool(
  async ({ startTime, endTime, calendarId }) => {
    const args = {
      query_locationId: process.env.GHL_LOCATION_ID,
      query_startTime: startTime,
      query_endTime: endTime,
    };
    if (calendarId) {
      args.query_calendarId = calendarId;
    }
    return callMcpTool("calendars_get-calendar-events", args);
  },
  {
    name: "get_calendar_events",
    description:
      "Get calendar events within a time range. Times must be in epoch milliseconds. Optionally filter by calendarId.",
    schema: z.object({
      startTime: z
        .number()
        .describe("Start of time range in epoch milliseconds"),
      endTime: z
        .number()
        .describe("End of time range in epoch milliseconds"),
      calendarId: z
        .string()
        .optional()
        .describe("Optional calendar ID to filter events"),
    }),
  }
);

const getContactTool = tool(
  async ({ contactId }) => {
    return callMcpTool("contacts_get-contact", {
      path_contactId: contactId,
    });
  },
  {
    name: "get_contact",
    description:
      "Get full details for a specific GHL contact by their contact ID.",
    schema: z.object({
      contactId: z.string().describe("The GHL contact ID"),
    }),
  }
);

const AGENT_TOOLS = [searchContactsTool, getCalendarEventsTool, getContactTool];

// ---------------------------------------------------------------------------
// Agent singleton
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a data-retrieval agent for GoHighLevel (GHL). Your job is to find appointment data for a specific contact.

Instructions:
1. Search for the contact by email first. If no results, try phone number.
2. Once you find the contact, note their contact ID.
3. Use the calendar events tool to find their most recent appointment. Search a wide window (past 30 days to next 30 days from now) if needed.
4. If you know the GHL calendar ID "4RAVGhqQxwItEopVliMI" (Valor Tax Appointment), use it to narrow results.

Return ONLY a JSON object with these exact fields (use null for any you cannot find):
{
  "appointmentTitle": "string or null",
  "appointmentStart": "ISO datetime string or null",
  "appointmentEnd": "ISO datetime string or null",
  "calendarName": "string or null"
}

Do NOT include any text outside the JSON object. Do NOT wrap it in markdown code fences.`;

let cachedAgent = null;

function getAgent() {
  if (cachedAgent) return cachedAgent;

  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    temperature: 0,
    maxOutputTokens: 1024,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  cachedAgent = createReactAgent({
    llm,
    tools: AGENT_TOOLS,
    messageModifier: SYSTEM_PROMPT,
  });

  return cachedAgent;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ALLOWED_FIELDS = new Set([
  "appointmentTitle",
  "appointmentStart",
  "appointmentEnd",
  "calendarName",
]);

/**
 * Fetch appointment data for a GHL contact using a LangGraph AI agent
 * as the last-resort fallback. Returns the same shape as
 * `fetchAppointmentFromGhl()`: { appointmentTitle, appointmentStart,
 * appointmentEnd, calendarName } or {} on failure.
 *
 * Gracefully no-ops (returns {}) when ANTHROPIC_API_KEY is not set.
 *
 * @param {string|null} email
 * @param {string|null} phone
 * @param {string|null} name
 * @param {string|null} appointmentId
 * @returns {Promise<object>}
 */
export async function fetchAppointmentViaAgent(
  email,
  phone,
  name,
  appointmentId
) {
  // Guard: need Google API key for the LLM
  if (!process.env.GOOGLE_API_KEY) {
    console.log("Agent fallback skipped: GOOGLE_API_KEY not set");
    return {};
  }

  // Guard: need at least one search term
  if (!email && !phone && !name) {
    console.log("Agent fallback skipped: no email, phone, or name provided");
    return {};
  }

  const timeoutMs = parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 25000;

  try {
    const searchHints = [
      email ? `email: ${email}` : null,
      phone ? `phone: ${phone}` : null,
      name ? `name: ${name}` : null,
      appointmentId ? `appointmentId: ${appointmentId}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const userMessage = `Find the most recent appointment for this contact: ${searchHints}`;

    const agent = getAgent();

    const resultPromise = agent.invoke(
      { messages: [{ role: "user", content: userMessage }] },
      { recursionLimit: 7 }
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Agent timed out after ${timeoutMs}ms`)),
        timeoutMs
      )
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);

    // Extract the final message from the agent
    const messages = result.messages || [];
    const lastMessage = messages[messages.length - 1];
    const content =
      typeof lastMessage?.content === "string"
        ? lastMessage.content
        : Array.isArray(lastMessage?.content)
          ? lastMessage.content
              .filter((block) => typeof block === "string" || block?.type === "text")
              .map((block) => (typeof block === "string" ? block : block.text))
              .join("\n")
          : "";

    if (!content) {
      console.error("Agent returned empty content");
      return {};
    }

    // Parse JSON from the response using regex
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Agent response contained no JSON:", content.slice(0, 200));
      return {};
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Whitelist only the expected fields
    const result_obj = {};
    for (const key of ALLOWED_FIELDS) {
      if (parsed[key] !== undefined && parsed[key] !== null) {
        result_obj[key] = parsed[key];
      }
    }

    return result_obj;
  } catch (error) {
    console.error("Agent fallback failed:", error.message);
    return {};
  }
}

// ---------------------------------------------------------------------------
// Contact info agent
// ---------------------------------------------------------------------------

const CONTACT_INFO_SYSTEM_PROMPT = `You are a data-retrieval agent for GoHighLevel (GHL). Your job is to find ALL contact information for a specific person.

Instructions:
1. Search for the contact by email first. If no results, try phone number. If no results, try their name.
2. Once you find the contact, get their full details using the get_contact tool.
3. Extract ALL emails and phone numbers associated with this contact.

Return ONLY a JSON object with these exact fields:
{
  "emails": ["array of all email addresses found"],
  "phones": ["array of all phone numbers found"],
  "name": "full name or null"
}

Do NOT include any text outside the JSON object. Do NOT wrap it in markdown code fences.`;

const CONTACT_INFO_FIELDS = new Set(["emails", "phones", "name"]);

let cachedContactInfoAgent = null;

function getContactInfoAgent() {
  if (cachedContactInfoAgent) return cachedContactInfoAgent;

  const llm = new ChatGoogleGenerativeAI({
    model: "gemini-3-flash-preview",
    temperature: 0,
    maxOutputTokens: 1024,
    apiKey: process.env.GOOGLE_API_KEY,
  });

  cachedContactInfoAgent = createReactAgent({
    llm,
    tools: AGENT_TOOLS,
    messageModifier: CONTACT_INFO_SYSTEM_PROMPT,
  });

  return cachedContactInfoAgent;
}

/**
 * Use the AI agent to find all contact info (emails, phones) for a person.
 * Returns { emails: string[], phones: string[], name: string|null } or empty.
 */
export async function findContactInfoViaAgent(email, phone, firstName, lastName) {
  if (!process.env.GOOGLE_API_KEY) {
    console.log("Agent contact search skipped: GOOGLE_API_KEY not set");
    return { emails: [], phones: [], name: null };
  }

  const name = [firstName, lastName].filter(Boolean).join(" ") || null;
  if (!email && !phone && !name) {
    return { emails: [], phones: [], name: null };
  }

  const timeoutMs = parseInt(process.env.AGENT_TIMEOUT_MS, 10) || 25000;

  try {
    const searchHints = [
      email ? `email: ${email}` : null,
      phone ? `phone: ${phone}` : null,
      name ? `name: ${name}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const userMessage = `Find ALL contact information (every email and phone number) for this person: ${searchHints}`;

    const agent = getContactInfoAgent();

    const resultPromise = agent.invoke(
      { messages: [{ role: "user", content: userMessage }] },
      { recursionLimit: 7 }
    );

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Agent timed out after ${timeoutMs}ms`)), timeoutMs)
    );

    const result = await Promise.race([resultPromise, timeoutPromise]);

    const messages = result.messages || [];
    const lastMessage = messages[messages.length - 1];
    const content =
      typeof lastMessage?.content === "string"
        ? lastMessage.content
        : Array.isArray(lastMessage?.content)
          ? lastMessage.content
              .filter((block) => typeof block === "string" || block?.type === "text")
              .map((block) => (typeof block === "string" ? block : block.text))
              .join("\n")
          : "";

    if (!content) return { emails: [], phones: [], name: null };

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { emails: [], phones: [], name: null };

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      emails: Array.isArray(parsed.emails) ? parsed.emails.filter(Boolean) : [],
      phones: Array.isArray(parsed.phones) ? parsed.phones.filter(Boolean) : [],
      name: typeof parsed.name === "string" ? parsed.name : null,
    };
  } catch (error) {
    console.error("Agent contact info search failed:", error.message);
    return { emails: [], phones: [], name: null };
  }
}
