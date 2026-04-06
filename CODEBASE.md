# Valor Dashboard — Codebase Overview

**GHL → IRS Logics Automation Platform for Valor Tax Relief**

---

## What It Does

When a prospect books an appointment in GoHighLevel, this system automatically finds their case in IRS Logics and creates a task — assigned to their settlement officer, or the next officer in rotation if none is assigned. Every step is logged. Every failure is retried. Nothing falls through the cracks.

**The pipeline:**
```
GHL Appointment Booked
  → Webhook fires to Vercel
    → Find case in IRS Logics (email → phone fallback)
      → Fetch appointment data (webhook → GHL API → AI agent → queue)
        → Assign officer (case officer → round-robin fallback)
          → Create task in IRS Logics
            → Log to Supabase
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.2 (App Router, ESM) |
| UI | React 18.3 + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Hosting | Vercel (serverless + cron jobs) |
| CRM | GoHighLevel (webhook + REST API + MCP) |
| Case Management | IRS Logics V4 API (Basic Auth) |
| AI Fallback | LangGraph + Google Gemini Flash |

---

## Architecture

### 3-Layer Design
1. **Directives** (`directives/`) — SOPs in Markdown describing what each integration does, edge cases, and lessons learned
2. **Orchestration** — The webhook handler + cron logic routes between services, handles errors, and decides when to queue vs. retry vs. fail
3. **Execution** — Deterministic lib modules (irs-logics, ghl, supabase, pending) that do one thing reliably

### Why This Works
Probabilistic systems (GHL webhooks, API calls) are wrapped in deterministic execution. Errors surface immediately and are retried automatically. The system self-heals.

---

## Core Features

### Appointment-to-Task Automation
- Triggered by GHL "Appointment Booked" workflow via outbound webhook
- Normalizes messy GHL payload variations (8+ field name aliases for email, phone, times, calendar)
- Handles `calender` field arriving as a JSON object vs. plain string
- Deduplicates: checks `task_logs` before creating — same case + appointment time = skip
- **Contact Info Recovery:** When email/phone are missing but a name exists, searches GHL by name (REST then MCP) to recover the contact's email/phone before proceeding

### Multi-Layer Appointment Data Recovery
GHL webhooks are unreliable. Appointment fields are frequently missing. The system has three fallbacks:

| Layer | Method | When Used |
|-------|--------|-----------|
| 1 | Webhook payload | Always attempted first |
| 2 | GHL REST API | When start/end times are missing |
| 3 | LangGraph AI Agent (Gemini Flash + GHL MCP) | When GHL REST returns nothing |
| 4 | Pending queue | When all fallbacks fail — retried every 5 minutes for 24 hours |

### Intelligent Officer Assignment
1. **Case Officer Priority:** Queries IRS Logics `CaseInfo?details=setofficerid` — if the case has a settlement officer, task goes to them (`assignment_method: "case_officer"`)
2. **Round-Robin Fallback:** If no officer is assigned to the case, the next officer in rotation gets it (`assignment_method: "round_robin"`)
3. **Auto-Created Case:** When a case doesn't exist and retries are exhausted, the system auto-creates the case and assigns a round-robin officer to both the case and task (`assignment_method: "auto_created"`)
4. **Round-robin only advances** when the case has no settlement officer or is auto-created — it never burns a rotation on assigned cases

### Auto-Case Creation (case_not_found)
- When the cron exhausts retries for a `case_not_found` pending task (2 retries: 5 min + 30 min), it auto-creates the case in IRS Logics via `POST /V4/Case/CaseFile`
- Uses contact info from the pending task: first name, last name, email, phone
- Assigns a round-robin officer to both the case (`Set. Officer` field) and the task
- Task comments are prefixed with `[Auto-Created Case]` for traceability
- `DuplicateCheck: "Email,CellPhone"` flags potential duplicates without preventing creation

### Pending Task Queue + Retry System
- Tasks without appointment data are queued to `pending_tasks` instead of failing
- Cron job runs every 5 minutes, re-attempts GHL API + AI agent lookups
- Missing appointment tasks retried up to 288 times (24 hours at 5-minute intervals)
- Case-not-found tasks retried twice (5 min + 30 min), then auto-created
- Missing contact info tasks retried 3 times (5 min + 30 min + 2 hours) via name-based GHL lookup — recovered email/phone are persisted to the pending row
- At retry cap, tasks become `needs_review` — surfaced on dashboard

### Safety Net Sweep
- Runs alongside the cron every 5 minutes
- Fetches recent appointments from GHL for contacts seen in the last 24 hours
- Cross-references against `task_logs` — any appointment without a log gets a task created
- Tags safety-net tasks with `[Safety Net]` in comments for traceability

### Full Audit Logging
Every webhook execution — success or failure — is written to `task_logs` with:
- Contact info, case ID, task ID
- Officer name + user ID + assignment method
- Appointment title, start, end, calendar name
- Status + error message
- No silent failures

---

## API Endpoints

### Webhook
| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/ghl-webhook` | Primary GHL webhook receiver |

### Data
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/case` | Case lookup by email or phone |
| `GET` | `/api/case/[id]` | Case details + task history by ID |
| `GET` | `/api/activity` | Paginated activity log with filters |
| `GET` | `/api/dashboard/stats` | Dashboard metrics aggregation |

### Officers
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/officers` | List active officers |
| `POST` | `/api/officers` | Add officer to rotation |
| `DELETE` | `/api/officers` | Deactivate officer |
| `PATCH` | `/api/round-robin` | Manually set next officer |

### Automation
| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/cron/process-pending` | Cron: process queue + safety net (every 5 min) |

---

## Dashboard Pages

### `/` — Overview
- Stat cards: Total Tasks, Today, This Week, Pending, Needs Review
- Recent activity table (last 10 events with relative timestamps)
- Round-robin list — click any officer to set them as "next up"
- GHL recovery mode status indicator

### `/officers` — Officer Management
- Officer grid with total task counts and this-week counts per officer
- "Next Up" banner showing who's on deck
- Add officer form (name + IRS Logics User ID + phone)
- Remove officers with one click (soft-delete, preserves logs)

### `/activity` — Activity Log
- Full paginated log of every task creation attempt
- Filters: officer, status, date range
- Columns: time, contact, email, phone, case ID, task ID, officer, assignment method, status
- Status badge colors: green (success), yellow (case not found), red (error)

### `/lookup` — Case Lookup
- Search by email or phone
- Returns case details from IRS Logics: name, status, sale date, tax amount, location
- Full task history for the found case

---

## Library Modules

### `lib/webhook.js`
Normalizes GHL webhook payloads into a consistent shape. Handles all field name variations (GHL uses at least 3 different naming conventions). Builds the IRS Logics task payload including subject line, due date, end date, and rich comments with all appointment metadata.

### `lib/irs-logics.js`
All IRS Logics V4 API calls. Handles the quirks: query params (not headers), `Data` vs `data` response key, multiple-case results, date formatting from GHL's human-readable strings to UTC ISO, phone number normalization to `(XXX)XXX-XXXX`. Includes `createCase()` for auto-creating cases via `/V4/Case/CaseFile` when retry logic is exhausted.

### `lib/ghl.js`
GHL REST API helpers for the appointment data fallback. Finds contacts by email/phone, fetches their most recent appointment, resolves calendar name from calendar ID. Returns a standardized appointment shape regardless of data source. Also provides `findGhlContactByName(name, firstName, lastName)` for name-based contact recovery — searches GHL REST then MCP, scores results by name similarity, returns `{ id, email, phone }`.

### `lib/ghl-mcp.js`
MCP (Model Context Protocol) client for GHL. JSON-RPC 2.0 calls to the GHL MCP server. Alternative to the REST API — used when `GHL_MCP_TOKEN` is configured. Normalizes MCP responses to the same shape as REST responses. Supports name-based contact search via `options.name` parameter and `findGhlContactByNameViaMcp(name)`.

### `lib/agent.js`
LangGraph ReAct agent using Gemini Flash. Last-resort appointment data retrieval. Has three tools: `search_contacts`, `get_calendar_events`, `get_contact`. Configurable timeout (default 25s). Gracefully no-ops when `GOOGLE_API_KEY` is not set.

### `lib/supabase.js`
Supabase client + `supabaseRest()` — a direct fetch-based REST helper that bypasses the JS client's caching behavior on Vercel warm starts. All reads use `supabaseRest()`. Writes use the JS client. Includes round-robin state functions: `peekNextOfficer()`, `getNextOfficer()`.

### `lib/officers.js`
Loads the active officer roster from Supabase `officers` table with a hardcoded fallback. Provides lookup by index (modulo for round-robin), user ID, and name.

### `lib/pending.js`
Pending task queue management. Builds pending entries, inserts them, fetches tasks for retry, marks complete, increments retry count, and escalates to `needs_review` at the retry cap. Supports three retry reasons: `missing_appointment` (288 retries), `case_not_found` (2 retries), `missing_contact_info` (3 retries with 5min/30min/2hr schedule). `updatePendingTaskContactInfo()` persists recovered email/phone to pending rows.

### `lib/safety-net.js`
Cross-references recent GHL appointments against `task_logs`. Filters to appointments not yet logged. Used by the cron to catch any that slipped through the webhook.

### `lib/dashboard.js`
Aggregates all dashboard data: stat counts, recent activity, officer stats, round-robin state, pending/review counts. Single function `getDashboardStats()` returns everything the overview page needs.

---

## Supabase Schema

### `task_logs`
Complete audit trail of every webhook execution.
```
id, created_at, first_name, last_name, email, phone,
case_id, lookup_method, task_id, task_subject,
officer_name, officer_user_id, assignment_method,
appointment_title, appointment_start, appointment_end, calendar_name,
status, error_message
```
Status values: `success` | `case_not_found` | `task_failed` | `error` | `pending_appointment`

### `pending_tasks`
Retry queue for appointments without complete data or missing contact info.
```
id, created_at, updated_at, first_name, last_name, email, phone,
appointment_title, calendar_name, ai_summary, ai_transcript,
case_id, lookup_method, status, retry_count, error_message,
reason, next_retry_at
```
Status values: `pending` | `processing` | `needs_review` | `completed`
Reason values: `missing_appointment` | `case_not_found` | `missing_contact_info`

### `officers`
Dynamic officer roster, manageable from the dashboard.
```
id, created_at, name, user_id (IRS Logics), phone, is_active, sort_order
```

### `round_robin`
Single row (`id=1`). Stores `current_index` for officer rotation.

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `IRS_LOGICS_PUBLIC_KEY` | Yes | IRS Logics Basic Auth |
| `IRS_LOGICS_SECRET_KEY` | Yes | IRS Logics Basic Auth |
| `GHL_API_KEY` | Yes | GoHighLevel REST API |
| `GHL_LOCATION_ID` | Yes | GHL location scope |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase server key |
| `CRON_SECRET` | Yes | Cron job authorization |
| `GHL_MCP_TOKEN` | No | GHL MCP server auth (secondary fallback) |
| `GOOGLE_API_KEY` | No | Gemini Flash for AI agent (tertiary fallback) |
| `AGENT_TIMEOUT_MS` | No | AI agent timeout in ms (default: 25000) |

---

## Key Engineering Decisions

**Supabase REST over JS client** — The `@supabase/supabase-js` client returns stale data on Vercel warm starts due to module-level caching. All reads go through `supabaseRest()`, a direct `fetch()` call with `cache: "no-store"`.

**Count queries via REST** — The Supabase JS `{ count: "exact", head: true }` returns 0 on Vercel. Count queries use `Prefer: count=exact` with `Range: 0-0` via `supabaseRest()`.

**Query params, not headers** — IRS Logics V4 docs say "Header Parameters" but the API actually requires query parameters. Using headers returns validation errors.

**Pending queue over hard failures** — Rather than returning a 500 when appointment data is missing, the webhook returns 200 with `queued: true` and retries in the background. This prevents GHL from retrying the webhook and creating duplicates.

**Dedup by composite key** — `caseId + appointmentStart` is checked against `task_logs` before every task creation. GHL sometimes fires webhooks multiple times for the same event.

---

## Deployment

```bash
cd vercel-webhook && npx vercel --prod
```

- **Dashboard:** `https://valor-sooty.vercel.app`
- **Webhook URL:** `https://valor-sooty.vercel.app/api/ghl-webhook`
- **Cron:** Runs every 5 minutes via Vercel's built-in cron scheduler

---

## Testing

```bash
cd vercel-webhook && npm test
```

Unit tests cover: `pickFirstValue`, `normalizeWebhookPayload`, `buildTaskDetails`, `formatPhone`, `parseGhlDate`, `extractCaseId`, deduplication logic, pending task state transitions, GHL REST + MCP integration, safety net filtering.

Build check: `cd vercel-webhook && npm run build`
