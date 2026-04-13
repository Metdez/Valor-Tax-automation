# Valor Tax Automation

**Fully automated appointment-to-task pipeline** that bridges GoHighLevel and IRS Logics — eliminating manual data entry and ensuring every new appointment is instantly logged to the right case and officer.

## What It Does

When a client books an appointment in GoHighLevel, this system automatically:

1. **Finds the existing case in IRS Logics** — by email or phone from the webhook payload
2. **Assigns the right officer** — checks the case's settlement officer first, falls back to round-robin
3. **Creates a task on the case** — with appointment details, calendar name, and AI conversation context
4. **Logs everything** — every execution (success or failure) is recorded in Supabase

No copy-pasting. No manual entry. No appointments falling through the cracks.

## How It Works

```
┌─────────────────────┐     Webhook      ┌──────────────────────┐     API Calls    ┌─────────────────────┐
│                     │ ──────────────▶  │                      │ ──────────────▶  │                     │
│    GoHighLevel      │                  │   Vercel / Next.js   │                  │    IRS Logics       │
│  (Appointment       │                  │  (Find Case →        │                  │  (Task Created on   │
│   Booked)           │                  │   Assign Officer →   │                  │   Existing Case)    │
│                     │                  │   Create Task)       │                  │                     │
└─────────────────────┘                  └──────────┬───────────┘                  └─────────────────────┘
                                                    │
                                         ┌──────────┴───────────┐
                                         │      Supabase        │
                                         │  - round_robin       │
                                         │  - task_logs         │
                                         │  - officers          │
                                         └──────────────────────┘
```

## Key Features

### Smart Officer Assignment
The system first checks the case's assigned settlement officer in IRS Logics. If the case already has one, the task goes to them. If not, it falls back to round-robin across active officers. Assignment method is logged for every task.

### Round-Robin with Dashboard Control
Active officers are loaded from the Supabase `officers` table. The current rotation index persists across deployments. The dashboard lets you click any officer to set them as "next up" instantly.

### Bulletproof Appointment Fallbacks
GHL webhooks sometimes omit appointment times entirely. The system has four layers:
1. **Webhook payload** — primary source
2. **GHL REST API** — fetches appointment data directly if missing from payload
3. **GHL MCP (Model Context Protocol)** — alternative transport with shape fan-out + response normalization
4. **AI Agent (LangGraph + Gemini Flash + GHL MCP)** — last resort, queries GHL programmatically

### Bulletproof Case Resolution
If no case is found by email or phone, the request is queued to `pending_tasks` with an **escalating search chain** that never dead-ends:
- **Retry 1 (5 min):** basic re-check
- **Retry 2 (10 min):** alternate phone formats + GHL contact enrichment for alternate emails/phones + exhaustive search
- **Retry 3 (30 min):** AI agent fuzzy contact match via Gemini, then exhaustive search
- **Retry 4 (immediate):** **auto-creates the case** in IRS Logics with the contact's info and assigns a round-robin officer

### Pending Queue & Retry System
A Vercel cron job runs every 5 minutes and handles four retry reasons:
- `missing_appointment` — retries every 5 min for 24 hours
- `case_not_found` — escalating 4-stage search chain (see above, never goes to needs_review)
- `task_failed` — 3 retries with **officer rotation** (if one officer's account is inactive, rotates to another)
- `missing_contact_info` — if webhook has only a name, searches GHL by name (REST then MCP) on 5 min / 30 min / 2 hr schedule

The only paths to `needs_review` are: no email/phone/name at all, or task creation failing with 3 different officers.

### Deduplication
Every task creation is checked against existing `task_logs` for the same `case_id` + `appointment_start` to prevent double-booking from webhook retries.

### Safety Net Sweep
The same cron job cross-references recent GHL appointments against `task_logs` to catch any webhooks that were missed entirely, creating tasks for any gaps with a `[Safety Net]` comment prefix.

### Contact Info Recovery by Name
If the webhook payload has a contact name but no email/phone, the system searches GHL by name (REST then MCP) to recover the missing identifiers before giving up.

### Duplicate-Safe Case Selection
When multiple cases match an email or phone, the handler picks the case with a `SaleDate` (active client), preferring the most recently created.

### Full Activity Dashboard
A Next.js dashboard shows stats (including pending queue + needs-review counts), recent activity, officer management, case lookup, and round-robin controls — all backed by Supabase.

## Architecture

This project follows a **3-layer architecture**:

| Layer | Purpose | Location |
|-------|---------|----------|
| **Directives** | SOPs and documentation | `directives/` |
| **Orchestration** | AI-powered decision making | CLAUDE.md / AGENTS.md |
| **Execution** | Deterministic scripts and API handlers | `execution/` + `vercel-webhook/` |

### Project Structure

```
├── directives/                              # Standard Operating Procedures
│   ├── create_case.md                       # IRS Logics case creation SOP
│   ├── create_task.md                       # IRS Logics task creation SOP
│   ├── find_case.md                         # Finding cases by email/phone
│   ├── get_case.md                          # Getting case details by CaseID
│   ├── ghl_appointment_to_irs_case.md       # Full automation flow SOP
│   └── irs_logics_auth.md                   # API authentication guide
├── execution/                               # Deterministic scripts
│   └── create_case.py                       # Python script for manual case creation
├── docs/                                    # Additional documentation
├── vercel-webhook/                          # Next.js 14 App Router project
│   ├── app/
│   │   ├── layout.js                        # Root layout with sidebar nav
│   │   ├── page.js                          # Dashboard overview
│   │   ├── globals.css
│   │   ├── officers/page.js                 # Officer management
│   │   ├── activity/page.js                 # Activity log with filters
│   │   ├── lookup/page.js                   # Case lookup by email/phone
│   │   └── api/
│   │       ├── ghl-webhook/route.js         # Main webhook handler
│   │       ├── cron/process-pending/route.js  # Every-5-min cron: pending queue + safety net
│   │       ├── round-robin/route.js         # PATCH to set next officer
│   │       ├── officers/route.js            # GET/POST/DELETE officers
│   │       ├── dashboard/stats/route.js     # Dashboard stats API
│   │       ├── activity/route.js            # Paginated activity log
│   │       └── case/route.js                # Case lookup API
│   ├── components/
│   │   ├── StatCard.js
│   │   ├── ActivityTable.js
│   │   ├── OfficerCard.js
│   │   ├── RoundRobinIndicator.js
│   │   └── AddOfficerForm.js
│   ├── lib/
│   │   ├── supabase.js                      # Client + supabaseRest() + round-robin functions
│   │   ├── irs-logics.js                    # IRS Logics API helpers (incl. phoneFormats, findCaseExhaustive, createCase)
│   │   ├── ghl.js                           # GHL REST+MCP fallback, name-based recovery, contact enrichment
│   │   ├── ghl-mcp.js                       # Low-level GHL MCP client (shape fan-out + normalization)
│   │   ├── webhook.js                       # Payload normalization + task builder
│   │   ├── dedup.js                         # Duplicate task detection
│   │   ├── pending.js                       # Pending queue CRUD + retry schedules
│   │   ├── safety-net.js                    # Safety net sweep (GHL appointments vs task_logs)
│   │   ├── officers.js                      # Dynamic officer loading from Supabase
│   │   ├── dashboard.js                     # Stats aggregation + data queries
│   │   └── agent.js                         # LangGraph AI agent fallback (appointment + contact recovery)
│   ├── supabase/
│   │   ├── task_logs.sql
│   │   ├── pending_tasks.sql
│   │   └── add_case_not_found_columns.sql
│   ├── tests/lib/
│   │   ├── webhook.test.mjs
│   │   ├── pending.test.mjs
│   │   ├── irs-logics.test.mjs
│   │   ├── ghl.test.mjs
│   │   ├── ghl-enrichment.test.mjs
│   │   └── ghl-mcp.test.mjs
│   └── vercel.json                          # Cron config: */5 * * * *
├── contacts.json                            # Legacy officer roster (superseded by Supabase)
├── IRS LOGICS API DOCS.md                   # Full IRS Logics V4 API reference
├── CLAUDE.md / AGENTS.md / GEMINI.md        # AI agent instructions (mirrored)
└── .env                                     # API keys and secrets
```

## Tech Stack

- **GoHighLevel** — CRM, appointment booking, webhook trigger
- **Next.js 14** (App Router) — Serverless API routes + dashboard frontend
- **Vercel** — Hosting and deployment
- **Supabase** — PostgreSQL: round-robin state, task logs, officer roster
- **IRS Logics V4 API** — Tax case management (find case, create task)
- **LangGraph + Gemini Flash** — AI agent fallback for appointment data retrieval
- **Tailwind CSS** — Dashboard styling (Navy `#3c3b6e` + Red `#c0000a`)

## Setup

### Prerequisites
- GoHighLevel account with API access
- IRS Logics account with API credentials (public key + secret key)
- Vercel account
- Supabase project with `round_robin`, `task_logs`, and `officers` tables
- (Optional) Google API key for the AI agent fallback

### 1. Clone and Configure
```bash
git clone https://github.com/Metdez/Valor-Tax-automation.git
cd Valor-Tax-automation
cp .env.example .env
# Fill in your API keys
```

### 2. Deploy to Vercel
```bash
cd vercel-webhook
npm install
npx vercel --prod
```

### 3. Set Environment Variables
Add these in your Vercel project settings:

| Variable | Purpose |
|----------|---------|
| `IRS_LOGICS_PUBLIC_KEY` | IRS Logics Basic Auth |
| `IRS_LOGICS_SECRET_KEY` | IRS Logics Basic Auth |
| `GHL_API_KEY` | GoHighLevel REST API token |
| `GHL_LOCATION_ID` | GHL location ID |
| `GHL_MCP_TOKEN` | GHL private integration token for MCP endpoint |
| `GHL_MCP_LOCATION_ID` | GHL location ID for MCP (falls back to `GHL_LOCATION_ID`) |
| `GHL_MCP_URL` | Optional MCP endpoint override |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `CRON_SECRET` | Bearer token for the pending-queue cron endpoint |
| `GOOGLE_API_KEY` | Gemini API key (optional — agent skipped if absent) |
| `AGENT_TIMEOUT_MS` | AI agent timeout in ms (optional, default 25000) |

### 4. Configure GHL Workflow
1. Go to **Automation → Workflows**
2. Create trigger: **Appointment Booked**
3. Add action: **Webhook (Outbound)**
4. Set URL: `https://valor-sooty.vercel.app/api/ghl-webhook`
5. Include fields: `First Name`, `Last Name`, `Email`, `Phone`, `appointment_id`, `appointment_title`, `appointment_start_time`, `appointment_end_time`, `calender`, `conversations_ai_summary`, `conversations_ai_transcript`
6. Publish

> **Critical:** `Email` and/or `Phone` must be present in the payload — the case lookup fails without them.

## Webhook Flow

1. GHL fires outbound webhook on "Appointment Booked"
2. Vercel receives `POST /api/ghl-webhook`
3. `normalizeWebhookPayload()` extracts name, email, phone, and appointment fields
4. **Contact info recovery:** if email + phone missing but name present, searches GHL by name (REST → MCP). If still missing, queues with `reason: missing_contact_info`
5. `FindCaseByEmail` → fallback to `FindCaseByPhone` (IRS Logics V4). 5s retry, then queues with `reason: case_not_found` (escalating 4-stage search, ending in auto-case-creation)
6. Multiple cases → picks the one with a `SaleDate`, most recent if tied
7. Missing appointment times → GHL REST → GHL MCP → AI agent (Gemini Flash via LangGraph). If all fail, queues with `reason: missing_appointment`
8. **Dedup check:** `isDuplicateTask()` against `task_logs` — skips if already processed
9. `getCaseOfficer(caseId)` checks for assigned settlement officer → falls back to round-robin
10. `POST /V4/Task/Task` creates task with subject, due date, comments (calendar, AI summary/transcript), assigned officer. On failure → queues with `reason: task_failed` for officer-rotation retry
11. Logs result to Supabase `task_logs`
12. Returns `{ success, caseId, taskId, assignedTo, assignmentMethod }`

## Cron Job (every 5 minutes)

`GET /api/cron/process-pending` runs two parallel jobs:

1. **Pending Queue Processor** — drains up to 20 oldest pending rows whose `next_retry_at` has elapsed, routed by `reason`:
   - `case_not_found` → escalating search chain → auto-create case on final retry
   - `task_failed` → officer rotation across 3 retries
   - `missing_contact_info` → name-based GHL search
   - `missing_appointment` → REST → MCP → AI agent retry
2. **Safety Net Sweep** — cross-references recent GHL appointments against `task_logs` and creates tasks for any that slipped through.

## Dashboard

Live at `https://valor-sooty.vercel.app/`

| Page | Purpose |
|------|---------|
| `/` | Overview: stat cards, recent activity, round-robin list |
| `/officers` | Officer grid, add/remove officers, next-up indicator |
| `/activity` | Searchable/filterable activity log with pagination |
| `/lookup` | Case lookup by email or phone with task history |

## GHL Webhook Field Mapping

| GoHighLevel Field | IRS Logics Usage | Notes |
|-------------------|-----------------|-------|
| `First Name` / `Last Name` | Case lookup context | Used in task comments |
| `Email` | `FindCaseByEmail` | Primary lookup key |
| `Phone` | `FindCaseByPhone` | Fallback lookup key |
| `appointment_title` | Task `Subject` | — |
| `appointment_start_time` | Task `DueDate` + `Reminder` | Parsed from GHL human-readable format |
| `appointment_end_time` | Task `EndDate` | Optional |
| `calender` | Task `Comments` | May arrive as object — stringified automatically |
| `conversations_ai_summary` | Task `Comments` | AI conversation context |
| `conversations_ai_transcript` | Task `Comments` | Full transcript |

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `round_robin` | Single row storing `current_index` for officer rotation |
| `task_logs` | Every webhook execution: contact info, case/task IDs, officer, method, status, errors |
| `officers` | Active officer roster: `name`, `user_id`, `phone`, `is_active`, `sort_order` |
| `pending_tasks` | Retry queue with `reason`, `retry_count`, `next_retry_at`, status (pending/processing/needs_review/completed) |

## Testing

```bash
cd vercel-webhook

# Run all unit tests
npm test

# Individual suites
node tests/lib/webhook.test.mjs
node tests/lib/pending.test.mjs
node tests/lib/irs-logics.test.mjs
node tests/lib/ghl.test.mjs
node tests/lib/ghl-enrichment.test.mjs
node tests/lib/ghl-mcp.test.mjs

# Build check
npm run build
```

## License

Private — Valor Tax Relief
