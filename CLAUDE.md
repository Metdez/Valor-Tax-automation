# Agent Instructions

> This file is mirrored across CLAUDE.md, AGENTS.md, and GEMINI.md so the same instructions load in any AI environment.

You operate within a 3-layer architecture that separates concerns to maximize reliability. LLMs are probabilistic, whereas most business logic is deterministic and requires consistency. This system fixes that mismatch.

## The 3-Layer Architecture

Layer 1: Directive (What to do)

- Basically just SOPs written in Markdown, live in directives/

- Define the goals, inputs, tools/scripts to use, outputs, and edge cases

- Natural language instructions, like you'd give a mid-level employee

Layer 2: Orchestration (Decision making)

- This is you. Your job: intelligent routing.

- Read directives, call execution tools in the right order, handle errors, ask for clarification, update directives with learnings

- You're the glue between intent and execution. E.g you don't try scraping websites yourself—you read directives/scrape_website.md and come up with inputs/outputs and then run execution/scrape_single_site.py

Layer 3: Execution (Doing the work)

- Deterministic Python scripts in execution/

- Environment variables, api tokens, etc are stored in .env

- Handle API calls, data processing, file operations, database interactions

- Reliable, testable, fast. Use scripts instead of manual work.

Why this works: if you do everything yourself, errors compound. 90% accuracy per step = 59% success over 5 steps. The solution is push complexity into deterministic code. That way you just focus on decision-making.

## Operating Principles

1. Check for tools first

Before writing a script, check execution/ per your directive. Only create new scripts if none exist.

2. Self-anneal when things break

- Read error message and stack trace

- Fix the script and test it again (unless it uses paid tokens/credits/etc—in which case you check w user first)

- Update the directive with what you learned (API limits, timing, edge cases)

- Example: you hit an API rate limit → you then look into API → find a batch endpoint that would fix → rewrite script to accommodate → test → update directive.

3. Update directives as you learn

Directives are living documents. When you discover API constraints, better approaches, common errors, or timing expectations—update the directive. But don't create or overwrite directives without asking unless explicitly told to. Directives are your instruction set and must be preserved (and improved upon over time, not extemporaneously used and then discarded).

4. If a user asks you to build a directive or execution

Always give them multiple options first. Stratify across complexity, difficulty, and cost. Then, ask them which they’d like to try implementing. Important: make sure that there are no other pre-existing directives in the workspace. If there are, clarify with the user prior to any building. Only once you’ve verified this is a new directive and execution and received the user’s consent should you proceed. When you do, match the layout of other directives in their workspace, and use Python where possible. Check .env and any other token or authentication files to know what you have out-of-the-box access to and what needs to be built. After you’re done, ask the user if you can test the solution end-to-end (verify prior to this because some platforms have credits/bill for usage). If there are errors during building, update the relevant directives/executions accordingly.

## Self-annealing loop

Errors are learning opportunities. When something breaks:

1. Fix it

2. Update the tool

3. Test tool, make sure it works

4. Update directive to include new flow

5. System is now stronger

## File Organization

Deliverables vs Intermediates:

- Deliverables: Google Sheets, Google Slides, or other cloud-based outputs that the user can access

- Intermediates: Temporary files needed during processing

Directory structure:

- .tmp/ - All intermediate files (dossiers, scraped data, temp exports). Never commit, always regenerated.

- execution/ - Python scripts (the deterministic tools)

- directives/ - SOPs in Markdown (the instruction set)

- .env - Environment variables and API keys

- credentials.json, token.json - Google OAuth credentials (required files, in .gitignore)

Key principle: Local files are only for processing. Deliverables live in cloud services (Google Sheets, Slides, etc.) where the user can access them. Everything in .tmp/ can be deleted and regenerated.

## Summary

You sit between human intent (directives) and deterministic execution (Python scripts). Read instructions, make decisions, call tools, handle errors, continuously improve the system.

Be pragmatic. Be reliable. Self-anneal.

## Project Context: GHL → IRS Logics Integration

This project automates the flow of lead/case data from GoHighLevel (GHL) into IRS Logics for Valor Tax Relief.

### What It Does
- **Trigger:** New appointment booked in GHL
- **Action:** Finds the existing case in IRS Logics (by email/phone), then creates a task on that case with appointment details, assigned to the case's settlement officer (or round-robin if none assigned)
- **Infrastructure:** GHL Workflow Webhook → Vercel Serverless Function → IRS Logics V4 API (Find Case → Create Task)

### Key Files
- `contacts.json` — The 13 case officers with names, phones, and IRS Logics UserIDs (legacy file, officers now stored in Supabase `officers` table)
- `execution/create_case.py` — Python script to manually create an IRS Logics case
- `vercel-webhook/app/api/ghl-webhook/route.js` — Next.js Route Handler that receives GHL webhooks, finds the existing case, looks up the case's settlement officer (falls back to round-robin), creates a task, and logs to `task_logs`
- `vercel-webhook/app/api/round-robin/route.js` — PATCH endpoint to manually set the round-robin index (click-to-reassign from dashboard)
- `vercel-webhook/app/api/officers/route.js` — GET/POST/DELETE for managing officers dynamically from the dashboard
- `vercel-webhook/app/api/dashboard/stats/route.js` — Dashboard stats API (counts, recent activity, officer stats, round-robin state)
- `vercel-webhook/app/api/activity/route.js` — Paginated activity log API with filters
- `vercel-webhook/app/api/case/route.js` — Case lookup API (by email, phone, or CaseID) with task history
- `vercel-webhook/lib/supabase.js` — Supabase client + `supabaseRest()` helper for direct REST calls (bypasses JS client caching on Vercel) + round-robin functions
- `vercel-webhook/lib/irs-logics.js` — IRS Logics API helpers (findCase, createCase, createTask, getCaseInfo, getCaseOfficer, phoneFormats, findCaseByPhoneAltFormats, findCaseExhaustive, etc.). `findCaseExhaustive(email, phone, extraEmails, extraPhones)` runs the full escalating search: email → phone → alt phone formats → enriched emails → enriched phones (with alt formats). `phoneFormats(phone)` generates alternate format variations (digits-only, dashed, dotted, E.164) excluding the original.
- `vercel-webhook/lib/officers.js` — Dynamic officer loading from Supabase `officers` table with hardcoded fallback
- `vercel-webhook/lib/dashboard.js` — Dashboard data aggregation (stats, activity pagination, case history, case lookup)
- `vercel-webhook/lib/ghl.js` — GHL API helpers with REST+MCP fallback pattern (findGhlContact, getContactAppointment, getCalendarName, fetchAppointmentFromGhl, fetchAppointmentFromGhlWithProviders, findGhlContactByName, enrichContactInfo) — dependency-injectable for testing; `getGhlRecoveryMode()` diagnostic; `findGhlContactByName(name, firstName, lastName)` searches GHL by name (REST then MCP) and returns `{ id, email, phone }` for contact info recovery; `enrichContactInfo(email, phone)` queries GHL for the full contact record and returns `{ emails[], phones[], firstName, lastName }` for discovering alternate contact info
- `vercel-webhook/lib/ghl-mcp.js` — Low-level GHL MCP (Model Context Protocol) client — contact search (by email, phone, or name via `options.name`), contact retrieval, appointment extraction via `https://services.leadconnectorhq.com/mcp/` with extensive shape-normalization (tries up to 6 input variants per query to handle MCP server inconsistencies); `findGhlContactByNameViaMcp(name)` returns `{ id, email, phone }` for name-based recovery
- `vercel-webhook/lib/agent.js` — LangGraph AI agent fallback using GHL MCP server — uses Gemini Flash (`gemini-3-flash-preview`) + 3 MCP tools (`search_contacts`, `get_calendar_events`, `get_contact`) with `recursionLimit: 7` and hard timeout. Two modes: `fetchAppointmentViaAgent(email, phone, name, appointmentId)` finds appointment data; `findContactInfoViaAgent(email, phone, firstName, lastName)` finds all emails/phones for a contact (used by cron retry 3 for AI-assisted fuzzy matching)
- `vercel-webhook/lib/webhook.js` — Webhook payload normalization (normalizeWebhookPayload, buildTaskDetails, pickFirstValue) + `stringifyField()` for handling GHL objects
- `vercel-webhook/lib/dedup.js` — Deduplication check (isDuplicateTask) — queries `task_logs` for existing success entry with same `case_id` + `appointment_start`
- `vercel-webhook/lib/pending.js` — Pending task queue helpers (buildPendingEntry, insertPendingTask, getPendingTasks, completePendingTask, incrementRetry, computeNextRetryAt, updatePendingTaskContactInfo, getPendingCount, getNeedsReviewCount) — manages the `pending_tasks` retry queue with reason-specific schedules (`case_not_found`: 5min/10min/30min/auto-create — never goes to needs_review, `task_failed`: 5min/10min/30min with officer rotation, `missing_appointment`: every 5min for 24hrs, `missing_contact_info`: 5min/30min/2hr). Constants: `MAX_CASE_NOT_FOUND_RETRIES=4`, `MAX_TASK_FAILED_RETRIES=3`
- `vercel-webhook/lib/safety-net.js` — Safety net sweep (fetchRecentGhlAppointments, getRecentTaskLogs, filterNewAppointments) — cross-references GHL appointments against task_logs to catch missed webhooks
- `directives/create_case.md` — SOP for creating cases via IRS Logics API
- `directives/find_case.md` — SOP for finding cases by email/phone
- `directives/create_task.md` — SOP for creating tasks on cases
- `directives/get_case.md` — SOP for getting case details by CaseID
- `directives/irs_logics_auth.md` — IRS Logics authentication guide (Basic Auth)
- `directives/ghl_appointment_to_irs_case.md` — SOP for the full GHL → IRS Logics automated flow
- `vercel-webhook/app/api/cron/process-pending/route.js` — Cron endpoint (every 5 min via Vercel cron) — processes pending queue (with auto-case-creation on retry exhaustion) + runs safety net sweep; requires `CRON_SECRET` Bearer token (bypassed in dev)

### APIs & Auth
- **IRS Logics V4 API** — Basic Auth (public key + secret key). Endpoints: Find (`/V4/Find/FindCaseByEmail`, `/V4/Find/FindCaseByPhone`), Task (`/V4/Task/Task`), Case (`/V4/Case/CaseInfo`, `/V4/Case/CaseFile` for creation), plus Appointment, Billing, CaseActivity, Documents, Fax, Report, Services, User endpoints (see `IRS LOGICS API DOCS.md` for full list)
- **GoHighLevel** — API token + location ID. Webhook configured in GHL Workflows (Automation → Workflows → Appointment Booked → Outbound Webhook). Also used for direct API calls to fetch appointment details as fallback (Contacts search, Contact Appointments, Calendars)

### Infrastructure
- **Vercel Project:** `valor` (deployed at `https://valor-sooty.vercel.app`)
- **Supabase Project:** `Valor` (ref: `znqzlmlkcbpfjdngspdu`)
- **GHL Location ID:** `vUJH65pfzeYnHCGQnVBW`
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS dashboard at `https://valor-sooty.vercel.app/`
- **Colors:** Navy `#3c3b6e` (primary/sidebar) + Red `#c0000a` (accent/highlights)

### Supabase Tables
- **`round_robin`** — Single row (`id=1`), stores `current_index` (integer) for officer rotation
- **`task_logs`** — Logs every webhook execution: contact info, case_id, task_id, officer assigned, assignment_method (`case_officer`/`round_robin`), appointment details, status (`success`/`case_not_found`/`task_failed`/`pending_appointment`/`error`), error_message. Schema in `vercel-webhook/supabase/task_logs.sql`. RLS disabled.
- **`officers`** — Dynamic officer roster: `name`, `user_id` (IRS Logics UserID), `phone`, `is_active` (boolean for soft-delete), `sort_order` (determines round-robin position). Officers can be added/removed from the dashboard UI. RLS disabled.
- **`pending_tasks`** — Retry queue for tasks that couldn't be fully resolved at webhook time. Columns: `first_name`, `last_name`, `email`, `phone`, `appointment_title`, `calendar_name`, `ai_summary`, `ai_transcript`, `case_id`, `lookup_method`, `status` (pending/processing/needs_review/completed), `retry_count` (default 0), `error_message`, `reason` (TEXT: `'missing_appointment'`, `'case_not_found'`, `'task_failed'`, or `'missing_contact_info'`), `next_retry_at` (TIMESTAMPTZ: controls when cron should next process this row — null for missing_appointment rows which retry every cron cycle), `created_at`, `updated_at`. Partial indexes on `status` and `next_retry_at`. RLS disabled. Schema in `vercel-webhook/supabase/pending_tasks.sql`.

### Officer Assignment (Case Officer Priority)
When a task is created, the system first checks the case's assigned settlement officer in IRS Logics via `getCaseOfficer(caseId)` (calls `CaseInfo?CaseID={id}&details=setofficerid`). If the case has a settlement officer (`setofficerid` is not null), the task is assigned to that officer and `assignment_method` is logged as `"case_officer"`. If no officer is assigned to the case, it falls back to round-robin assignment (`assignment_method = "round_robin"`).

### Round-Robin Assignment (Fallback)
Officers are loaded dynamically from the Supabase `officers` table (filtered by `is_active=true`, ordered by `sort_order`). The current index is stored in `round_robin` table. After cycling through all active officers, it wraps back to the first. The dashboard allows clicking any officer to set them as "next up" (PATCH `/api/round-robin`). **Round-robin only advances when the case has no assigned settlement officer.**

### Dashboard Pages
- **`/`** — Overview: stat cards (total tasks, today, this week, + conditional pending/needs-review counts), GHL recovery mode label, recent activity feed, round-robin list (clickable to reassign). Server component calling `getDashboardStats()` directly.
- **`/officers`** — Officer grid with total/weekly task counts, "Add Officer" collapsible form, remove buttons (soft-delete), next-up banner. Server component.
- **`/activity`** — Searchable/filterable activity log with pagination, defaults to current week. Client component with officer/status/date filters. Fetches `GET /api/activity` + `GET /api/officers`.
- **`/lookup`** — Case lookup by email or phone, shows case details + task history. Client component. Self-contained (does NOT use `CaseLookup.js` component). Fetches `GET /api/case`.

### Environment Variables (`.env`)
- `IRS_LOGICS_PUBLIC_KEY` / `IRS_LOGICS_SECRET_KEY` — IRS Logics Basic Auth
- `GHL_API_KEY` / `GHL_LOCATION_ID` — GoHighLevel REST API credentials
- `GHL_MCP_TOKEN` — GHL private integration token for MCP/SSE endpoint (used by `lib/ghl-mcp.js`)
- `GHL_MCP_LOCATION_ID` — GHL location ID for MCP calls (falls back to `GHL_LOCATION_ID` if not set)
- `GHL_MCP_URL` — Optional override for MCP endpoint (default: `https://services.leadconnectorhq.com/mcp/`)
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase connection
- `GOOGLE_API_KEY` — Google API key for the LangGraph AI agent fallback (Gemini, optional — agent gracefully skipped if not set)
- `AGENT_TIMEOUT_MS` — Optional timeout for agent invocation (default 25000ms)
- `CRON_SECRET` — Bearer token for authenticating the `/api/cron/process-pending` endpoint (bypassed in `NODE_ENV=development`)

### GHL Webhook Field Mapping
GHL Workflow sends custom keys: `"First Name"`, `"Last Name"`, `"Email"`, `"Phone"`, `"appointment_id"`, `"appointment_title"`, `"appointment_start_time"`, `"appointment_end_time"`, `"calender"`, `"conversations_ai_summary"`, `"conversations_ai_transcript"`. The webhook handler also supports standard GHL keys (`first_name`, `last_name`, etc.) as fallback, plus additional variations (`start_time`, `startTime`, `selected_slot`, `end_time`, `endTime`, `calendar`, `calendar_name`, `title`).

**Critical:** `Email` and/or `Phone` must be present in the GHL webhook payload — without them the case lookup fails (400 error). The GHL Workflow must be configured to include these fields.

**Known GHL Issue:** The GHL Workflow outbound webhook sometimes sends `calender` as a JSON object (e.g., `{ name: "Valor Tax Appointment", id: "..." }`) instead of a plain string, and may omit `appointment_start_time`/`appointment_end_time` entirely. The handler uses `stringifyField()` for object-to-string conversion and falls back to the GHL API (`fetchAppointmentFromGhl()`) when appointment times are missing.

### Webhook Flow (Step by Step)
1. GHL Workflow fires outbound webhook on "Appointment Booked"
2. Vercel function receives POST at `/api/ghl-webhook`
3. Extracts `Email` and `Phone` from payload via `normalizeWebhookPayload()` (supports multiple GHL field name variations)
3b. **Contact Info Recovery:** If both email and phone are missing but a name is present, calls `findGhlContactByName()` to search GHL by name (REST then MCP). If found, patches `normalized` with the recovered email/phone and continues. If recovery fails, queues to `pending_tasks` with `reason: 'missing_contact_info'` for cron retry (5 min → 30 min → 2 hours → `needs_review`). Only returns 400 if no email, phone, OR name are present.
4. Calls IRS Logics `FindCaseByEmail` (query param, not header) — if no result, falls back to `FindCaseByPhone`. **Race-condition retry:** If no case found, waits 5 seconds and retries once. If still not found, queues to `pending_tasks` with `reason: 'case_not_found'` for delayed retry (5 min, then 30 min, then `needs_review`). Returns `200 { queued: true }`.
5. **Multiple cases may be returned** — the handler picks the case with a `SaleDate` (indicates active client), preferring the most recently created if multiple match
6. **GHL API Fallback:** If appointment times are missing from the webhook payload, fetches them via `fetchAppointmentFromGhl()` — tries GHL REST API first, then falls back to GHL MCP endpoint (`lib/ghl-mcp.js`)
7. **AI Agent Fallback:** If the GHL API+MCP also returned no data, invokes the LangGraph AI agent (`fetchAppointmentViaAgent()`) which uses Gemini Flash to query the GHL MCP server. Requires `GOOGLE_API_KEY`. Gracefully skipped if key not set. Has a hard timeout (default 25s).
7b. **Pending Queue:** If all appointment fallbacks failed, queues to `pending_tasks` via `buildPendingEntry()` + `insertPendingTask()`. Returns `200 { success: true, queued: true }` (not an error, so GHL doesn't retry).
7c. **Deduplication:** Calls `isDuplicateTask(caseId, parsedStart)` — if a successful task_log already exists for this case+time, returns `200 { duplicate: true }` and exits.
8. **Officer Assignment:** Calls `getCaseOfficer(caseId)` to check for an existing settlement officer on the case. If found, assigns to that officer (`case_officer`). If not, falls back to `getNextOfficer()` round-robin (`round_robin`).
9. Creates a Task on the found case via `POST /V4/Task/Task` with:
   - `Subject`: "Appointment: {appointment_title} — {start_time}"
   - `DueDate` / `Reminder`: appointment start time parsed to UTC ISO format (falls back to webhook processing time if GHL didn't send it, with a warning in comments)
   - `EndDate`: appointment end time (if present)
   - `UserID`: array with assigned officer's IRS Logics UserID
   - `Comments`: calendar name, contact name, start/end times (human-readable + UTC), AI summary/transcript
   - `TaskType`: 1 (Task), `PriorityID`: 1 (Medium), `StatusID`: 0 (Incomplete)
10. **Logs to Supabase `task_logs`** — every execution (success or failure) is recorded with full context including `assignment_method`. Uses `safeInsertTaskLog()` wrapper that never throws (logging failures don't crash the request).
11. Returns `{ success, caseId, taskId, assignedTo, assignmentMethod }`

### Pending Queue & Cron System
The pending queue handles four types of retries, distinguished by the `reason` column:

**1. Missing Appointment Data (`reason: 'missing_appointment'`):** When the webhook can't resolve appointment data after all fallbacks (REST, MCP, AI Agent). Retries every 5 minutes for up to 288 attempts (~24 hours), then escalates to `needs_review`.

**2. Case Not Found (`reason: 'case_not_found'`):** When IRS Logics has no case for the contact's email/phone. Uses an **escalating search chain** with 4 retries — **never goes to `needs_review`**, always auto-resolves:
- Retry 1 (5 min): basic `findCase(email, phone)` re-check
- Retry 2 (10 min): + alternate phone formats (`phoneFormats()`) + GHL contact enrichment (`enrichContactInfo()`) to discover alternate emails/phones + `findCaseExhaustive()` search
- Retry 3 (30 min): + AI agent fuzzy match (`findContactInfoViaAgent()`) to find all contact info via Gemini, then feed into `findCaseExhaustive()`
- Retry 4 (immediate): **auto-creates the case** in IRS Logics via `POST /V4/Case/CaseFile` with the contact's name/email/phone, assigns a round-robin officer to both the case (`Set. Officer`) and the task (`assignment_method: "auto_created"`), creates the task (with or without appointment data — uses fallback DueDate if needed), and marks the pending row `completed`. Task comments are prefixed with `[Auto-Created Case]`.

**3. Task Failed (`reason: 'task_failed'`):** When IRS Logics rejects task creation (e.g., "User account is inactive"). The webhook queues it to pending instead of dead-ending. The cron retries with officer rotation:
- Retry 1 (5 min): same officer (case officer or original round-robin)
- Retry 2 (10 min): rotate to a different officer via round-robin
- Retry 3 (30 min): rotate to yet another officer
- After 3 failures with 3 different officers: `needs_review`

**4. Missing Contact Info (`reason: 'missing_contact_info'`):** When the webhook payload has a contact name but no email or phone. The inline name-based GHL lookup failed, so the cron retries `findGhlContactByName()` (REST then MCP). On success, recovered email/phone are persisted to the `pending_tasks` row via `updatePendingTaskContactInfo()`, then the normal appointment + case lookup flow continues. Schedule: 5 min → 30 min → 2 hours → `needs_review`.

**Guarantee: The only path to `needs_review` is** missing contact info (no email, phone, or name) or task creation failing with 3 different officers. Every other scenario auto-resolves.

A Vercel cron job (`vercel.json`: `*/5 * * * *`) hits `GET /api/cron/process-pending` every 5 minutes, which runs two parallel jobs:

1. **Pending Queue Processor (`processPendingQueue`):** Fetches up to 20 oldest pending rows where `next_retry_at` has elapsed (or is null for legacy rows). Routes `task_failed` rows to `processTaskFailed()` (officer rotation). Routes `case_not_found` rows through `escalatingCaseSearch()` (4-stage escalating search chain). For other rows: tries GHL REST → GHL MCP → AI Agent to recover appointment data, and `findCase()` if `case_id` is null. On success: creates IRS Logics task, logs to `task_logs`, marks `completed`. On failure: `incrementRetry()` bumps `retry_count` and sets `next_retry_at` based on reason-specific schedule. Deduplication check via `isDuplicateTask()` before task creation.

2. **Safety Net Sweep (`safetyNetSweep`):** Cross-references recent GHL appointments against `task_logs` to catch any webhooks that were missed entirely. Queries contacts from the last 24 hours of `task_logs` + `pending_tasks`, fetches their latest GHL appointments, filters out already-processed ones via `filterNewAppointments()`, then creates tasks for any gaps. Safety net tasks get `[Safety Net]` prefix in Comments.

### GHL MCP Integration
The GHL MCP server at `https://services.leadconnectorhq.com/mcp/` provides an alternative to the REST API for fetching contact and appointment data. `lib/ghl-mcp.js` handles:
- **Input shape fan-out:** Tries up to 6 input variants per query (different field name conventions: `query`/`search`/`email`/`phone`, with/without `locationId`) because the MCP server accepts inconsistent input shapes.
- **Response normalization:** `normalizeMcpToolPayload()` recursively unwraps MCP response envelopes (checks `content[].text`, `content[].json`, and top-level `result`/`data`/`output`/`response` keys).
- **Appointment extraction:** `normalizeAppointmentRecord()` maps inconsistent field names to canonical form (`startTime`→`appointmentStart`, etc.).
- **Fallback chain in `lib/ghl.js`:** Each function (findGhlContact, getContactAppointment, fetchAppointmentFromGhl) tries REST first, falls back to MCP on failure. `recoverySource` field tracks which path was taken (`"rest"` or `"mcp"`). `getGhlRecoveryMode()` returns diagnostic string: `"REST + MCP"`, `"MCP only"`, `"REST only"`, or `"Not configured"`.

### IRS Logics API Notes (Learned from Testing)
- **All IRS Logics V4 endpoints use query parameters**, not headers, for passing data like `email`, `phone`, `CaseID`. The original API docs say "Header Parameters" but this is wrong — using headers returns "X is required" errors.
- `FindCaseByEmail` and `FindCaseByPhone` return an **array** of cases in `Data`, not a single case.
- The response uses `Data` (capital D), not `data` (lowercase). The handler checks both for safety.
- `CaseInfo` endpoint: `GET /V4/Case/CaseInfo?CaseID={id}` — returns full case details including `StatusID`, `SaleDate`, `Email`, `CellPhone`, etc.
- Date format for Task API: UTC ISO string (e.g., `2026-03-31T22:00:00.000Z`).
- GHL sends human-readable dates like `"Tuesday, March 31, 2026 3:00 PM"` — the handler strips the day-of-week prefix and parses with `new Date()`.
- `CaseInfo` supports a `details` query parameter to include officer assignments: `?details=setofficerid,attorneyid,casemanagerid,caseworkerid`. The `setofficerid` returns an object `{ ID, Name, Email }` or `null`.
- **IRS Logics requires `DueDate` on tasks** — omitting it causes "Validation failed" errors. Always provide a DueDate, even if it's a fallback to current time.
- The `calender` field from GHL webhooks sometimes arrives as a JSON object instead of a string — use `stringifyField()` to extract `.name` or fall back to `JSON.stringify()`.
- **GHL webhook payloads may be missing appointment fields entirely** — the `appointment_start_time`, `appointment_end_time`, and `calender` fields are not always sent. The handler now falls back to the GHL API to fetch appointment details directly.
- GHL API appointment times (from `/contacts/{id}/appointments`) are returned in UTC format (e.g., `"2026-04-02 12:00:00"`).
- **Case creation** via `POST /V4/Case/CaseFile` — `LastName` is the only required field. Accepts `FirstName`, `Email`, `CellPhone` (format `(xxx)xxx-xxxx`), `Set. Officer` (officer name string), `DuplicateCheck` (comma-separated fields to flag duplicates). Returns `{ Success: true, data: { CaseID: 12345 } }`. See `directives/create_case.md` for full field list.

### Officers & UserIDs
The round-robin officers and their IRS Logics UserIDs are stored in the Supabase `officers` table (manageable from the dashboard). Initial 13 officers: 

| Name | UserID |
|------|--------|
| Anthony Edwards | 73 |
| David Wolfson | 71 |
| Dustin Boswell | 64 |
| Ellie London | 68 |
| John Gibson | 58 |
| Michael Rothberg | 35 |
| Nikki Dee | 42 |
| Oscar Morales | 75 |
| Ron Spencer | 78 |
| Val Vallery | 77 |
| Vanessa Thomas | 24 |
| Vincent Parks | 82 |
| Stanley Johnson | 83 |

### Deployment
- **Vercel CLI:** `cd vercel-webhook && npx vercel --prod`
- **Vercel env vars required:** `IRS_LOGICS_PUBLIC_KEY`, `IRS_LOGICS_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_MCP_TOKEN`, `GHL_MCP_LOCATION_ID`, `CRON_SECRET`
- **Vercel env vars optional:** `GOOGLE_API_KEY` (AI agent fallback), `AGENT_TIMEOUT_MS`, `GHL_MCP_URL`
- **Vercel cron:** `vercel.json` configures `*/5 * * * *` cron hitting `/api/cron/process-pending`
- **Webhook URL:** `https://valor-sooty.vercel.app/api/ghl-webhook`
- **Dashboard URL:** `https://valor-sooty.vercel.app/`
- The `vercel-webhook/` directory is a Next.js 14 App Router project with ESM (`"type": "module"` in package.json)
- **Package version:** `2.0.0` (`valor-dashboard`)
- Dependencies: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `tailwindcss`, `autoprefixer`, `postcss`, `@langchain/langgraph`, `@langchain/google-genai`, `@langchain/anthropic`, `@langchain/core`, `zod`

### Error Handling
- Missing `Email` AND `Phone` but name present → attempts name-based GHL lookup (`findGhlContactByName`); if found, continues normal flow; if not found, queues to `pending_tasks` with `reason: 'missing_contact_info'` and returns `200 { queued: true }`
- Missing `Email`, `Phone`, AND name → 400 "Missing email, phone, and name — cannot identify contact"
- No case found by email or phone (after 5s retry) → 200 with `queued: true` (queued to `pending_tasks` with `reason: 'case_not_found'`, escalating search at 5 min → 10 min → 30 min → auto-create — **never dead-ends**)
- All appointment fallbacks failed → 200 with `queued: true` (pending queue, not an error)
- Duplicate task detected → 200 with `duplicate: true` (no task created, no log written)
- Task creation fails → 200 with `queued: true` (queued to `pending_tasks` with `reason: 'task_failed'` for retry with officer rotation — retries 3x with different officers before `needs_review`)
- Supabase round-robin unavailable → 500
- All errors are logged to `task_logs` with status and error_message
- `safeInsertTaskLog()` wrapper ensures logging failures never crash the main request
- Cron endpoint requires `CRON_SECRET` Bearer token (bypassed in development mode) → 401 if unauthorized

### Supabase CLI Access
- **Supabase CLI** is available via `npx supabase` and is already logged in
- **Run SQL on production:** `npx supabase db query --linked "SQL_HERE;"` (uses the Management API, no database password needed)
- **List projects:** `npx supabase projects list`
- The `--linked` flag routes queries through the Management API to the linked Supabase project
- The workdir defaults to `C:\Users\John Doe\Music` — the CLI auto-detects the project from there

### GHL API Notes (Learned from Testing)
- **GHL API Base:** `https://services.leadconnectorhq.com`
- **Auth:** Bearer token (`GHL_API_KEY`), requires `Version: 2021-07-28` header
- **Contact Search:** `GET /contacts/?locationId={id}&query={email_or_phone}&limit=1` — returns `contacts[]` array with `id`, `firstName`, `lastName`, `email`, `phone`, `source`, etc.
- **Contact Appointments:** `GET /contacts/{contactId}/appointments` — returns `events[]` with `startTime`, `endTime`, `title`, `calendarId`, `appointmentStatus`, `appointmentMeta`
- **Calendar Details:** `GET /calendars/{calendarId}` — returns `calendar.name`
- **GHL Calendar ID for Valor Tax:** `4RAVGhqQxwItEopVliMI` (calendar name: "Valor Tax Appointment")
- GHL appointment times in the API response are in UTC (e.g., `"2026-04-02 12:00:00"`)
- Multiple duplicate contacts may exist for the same email — the handler picks the most recently created

### GHL MCP API Notes (Learned from Testing)
- **MCP Endpoint:** `https://services.leadconnectorhq.com/mcp/` (overridable via `GHL_MCP_URL`)
- **Auth:** Requires `GHL_MCP_TOKEN` (private integration token) + `GHL_MCP_LOCATION_ID` (or `GHL_LOCATION_ID`)
- **Protocol:** JSON-RPC 2.0 via POST. Response can be plain JSON or `text/event-stream` (SSE) — `lib/agent.js` handles both formats (SSE: splits on `\n`, filters `data:` lines, finds last valid JSON-RPC result)
- **Input inconsistency:** The MCP server accepts different field name conventions depending on the tool. `lib/ghl-mcp.js` handles this by trying up to 6 input shape variants per query (e.g., `{ query }`, `{ search }`, `{ email }`, `{ locationId, query }`, etc.)
- **Response normalization:** MCP responses can be deeply nested in various envelope structures (`content[].text` with JSON, `content[].json`, top-level `result`/`data`/`output`/`response`). `normalizeMcpToolPayload()` recursively unwraps all of these.
- **Tools used:** `contacts_get-contacts` (search), `contacts_get-contact` (by ID), `calendars_get-calendar-events` (calendar events in a time range)
- **Agent system prompt** instructs Gemini to search by email then phone, find contact ID, search ±30 day calendar window, use hardcoded calendar ID `4RAVGhqQxwItEopVliMI` as hint

### Supabase Client Notes (Learned from Debugging)
- **The Supabase JS client (`@supabase/supabase-js`) has caching issues on Vercel warm starts.** Singleton clients return stale data across invocations. The fix is `supabaseRest()` in `lib/supabase.js` — a direct REST helper using `fetch()` with `cache: "no-store"` that bypasses the JS client entirely.
- **Use `supabaseRest()` for all reads** (round-robin state, task_logs queries, officer list). The JS client (`getSupabaseAdmin()`) is still used for writes (inserts, updates) where caching doesn't matter.
- **Supabase count queries:** `{ count: "exact", head: true }` returns 0 on Vercel. Use `Prefer: count=exact` header with `Range: 0-0` via `supabaseRest()` instead.
- **RLS:** The `task_logs` and `officers` tables have RLS disabled. The service role key is used for all operations.

### Vercel Project Structure
```
vercel-webhook/
├── app/
│   ├── layout.js              # Root layout with sidebar nav (no separate Sidebar.js)
│   ├── page.js                # Dashboard overview (server component)
│   ├── globals.css            # Tailwind + custom styles + scrollbar
│   ├── officers/page.js       # Officer management (server component)
│   ├── activity/page.js       # Activity log with filters (client component)
│   ├── lookup/page.js         # Case lookup (client component)
│   └── api/
│       ├── ghl-webhook/route.js    # Webhook handler
│       ├── cron/process-pending/route.js  # Cron: pending queue + safety net
│       ├── round-robin/route.js    # PATCH to set next officer
│       ├── officers/route.js       # GET/POST/DELETE officers
│       ├── dashboard/stats/route.js
│       ├── activity/route.js
│       └── case/route.js
├── components/
│   ├── StatCard.js             # Pure display (no hooks)
│   ├── ActivityTable.js        # Pure display with timeAgo helper
│   ├── OfficerCard.js          # Client: remove button (DELETE /api/officers)
│   ├── RoundRobinIndicator.js  # Client: click to reassign (PATCH /api/round-robin)
│   ├── AddOfficerForm.js       # Client: collapsible add form (POST /api/officers)
│   └── CaseLookup.js           # Client: orphaned — not used by any page (lookup/page.js is self-contained)
├── lib/
│   ├── supabase.js             # Client + supabaseRest() + round-robin + insertTaskLog
│   ├── irs-logics.js           # IRS Logics API helpers (findCase, createTask, getCaseOfficer, etc.)
│   ├── ghl.js                  # GHL REST+MCP fallback (fetchAppointmentFromGhl, getGhlRecoveryMode)
│   ├── ghl-mcp.js              # Low-level GHL MCP client (shape fan-out, response normalization)
│   ├── webhook.js              # Webhook payload normalization + task detail builder
│   ├── dedup.js                # isDuplicateTask — checks task_logs for existing success
│   ├── pending.js              # Pending queue CRUD (MAX_RETRIES=288 ≈ 24hrs at 5min intervals)
│   ├── safety-net.js           # Safety net sweep (cross-ref GHL appointments vs task_logs)
│   ├── officers.js             # Dynamic officer loading from Supabase with hardcoded fallback
│   ├── dashboard.js            # Stats aggregation + data queries (9 parallel Supabase queries)
│   └── agent.js                # LangGraph AI agent fallback (Gemini Flash + 3 MCP tools)
├── supabase/
│   ├── add_case_not_found_columns.sql  # Migration: reason + next_retry_at columns
│   ├── pending_tasks.sql       # pending_tasks table schema
│   └── task_logs.sql           # task_logs table schema
├── tests/
│   └── lib/
│       ├── webhook.test.mjs    # Tests: pickFirstValue, normalizeWebhookPayload, buildTaskDetails, formatPhone, parseGhlDate, extractCaseId
│       ├── pending.test.mjs    # Tests: buildPendingEntry, buildPendingTasksQuery, getRetryStatus, computeNextRetryAt
│       ├── ghl.test.mjs        # Tests: fetchAppointmentFromGhlWithProviders (REST→MCP fallback)
│       └── ghl-mcp.test.mjs    # Tests: normalizeMcpToolPayload, pickLatestContact, extractAppointmentFromContactRecord
├── tailwind.config.js
├── next.config.js
├── jsconfig.json               # @/* path alias → ./*
├── postcss.config.js
├── package.json
└── vercel.json                 # Cron: */5 * * * * → /api/cron/process-pending
```

### Testing
- **All unit tests:** `cd vercel-webhook && npm test` (runs `node tests/lib/webhook.test.mjs`)
- **Individual test files:** (all use simple `node:assert/strict` runner, no test framework)
  - `node tests/lib/webhook.test.mjs` — pickFirstValue, normalizeWebhookPayload (incl. object calendar), buildTaskDetails, formatPhone, parseGhlDate, extractCaseId
  - `node tests/lib/pending.test.mjs` — buildPendingEntry, buildPendingTasksQuery, getRetryStatus, computeNextRetryAt (pure functions only; async Supabase functions not tested). Covers all 4 reasons: case_not_found (4 retries, never needs_review), task_failed (3 retries), missing_contact_info, missing_appointment
  - `node tests/lib/irs-logics.test.mjs` — phoneFormats (format variations, edge cases), extractCaseId (SaleDate priority, empty response)
  - `node tests/lib/ghl.test.mjs` — fetchAppointmentFromGhlWithProviders with injected REST/MCP providers (tests REST→MCP fallback), scoreNameMatch
  - `node tests/lib/ghl-enrichment.test.mjs` — enrichContactInfoWithProvider with injected REST searcher (tests email/phone extraction, name extraction, error handling)
  - `node tests/lib/ghl-mcp.test.mjs` — normalizeMcpToolPayload, pickLatestContact, extractAppointmentFromContactRecord
- **Build check:** `cd vercel-webhook && npm run build` — always run after multi-file changes
- **Manual API test:** Use `node -e` with the IRS Logics or GHL API credentials from `.env` to test endpoints directly
