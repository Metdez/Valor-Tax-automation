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
GHL webhooks sometimes omit appointment times entirely. The system has three layers:
1. **Webhook payload** — primary source
2. **GHL REST API** — fetches appointment data directly if missing from payload
3. **AI Agent (LangGraph + Gemini Flash + GHL MCP)** — last resort, queries GHL programmatically

### Duplicate-Safe Case Selection
When multiple cases match an email or phone, the handler picks the case with a `SaleDate` (active client), preferring the most recently created.

### Full Activity Dashboard
A Next.js dashboard shows stats, recent activity, officer management, case lookup, and round-robin controls — all backed by Supabase.

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
│   │       ├── round-robin/route.js         # PATCH to set next officer
│   │       ├── officers/route.js            # GET/POST/DELETE officers
│   │       ├── dashboard/stats/route.js     # Dashboard stats API
│   │       ├── activity/route.js            # Paginated activity log
│   │       └── case/route.js               # Case lookup API
│   ├── components/
│   │   ├── Sidebar.js
│   │   ├── StatCard.js
│   │   ├── ActivityTable.js
│   │   ├── OfficerCard.js
│   │   ├── RoundRobinIndicator.js
│   │   ├── AddOfficerForm.js
│   │   └── CaseLookup.js
│   ├── lib/
│   │   ├── supabase.js                      # Client + supabaseRest() + round-robin functions
│   │   ├── irs-logics.js                    # IRS Logics API helpers
│   │   ├── ghl.js                           # GHL API helpers (appointment fallback)
│   │   ├── webhook.js                       # Payload normalization + task builder
│   │   ├── officers.js                      # Dynamic officer loading from Supabase
│   │   ├── dashboard.js                     # Stats aggregation + data queries
│   │   └── agent.js                         # LangGraph AI agent fallback
│   └── tests/
│       └── lib/
│           ├── webhook.test.mjs
│           ├── ghl.test.mjs
│           ├── ghl-mcp.test.mjs
│           └── pending.test.mjs
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
| `GHL_API_KEY` | GoHighLevel API token |
| `GHL_LOCATION_ID` | GHL location ID |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
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
4. `FindCaseByEmail` → fallback to `FindCaseByPhone` (IRS Logics V4)
5. Multiple cases → picks the one with a `SaleDate`, most recent if tied
6. Missing appointment times → fetches from GHL REST API → falls back to AI agent
7. `getCaseOfficer(caseId)` checks for assigned settlement officer → falls back to round-robin
8. `POST /V4/Task/Task` creates task with subject, due date, comments (calendar, AI summary/transcript), assigned officer
9. Logs result to Supabase `task_logs`
10. Returns `{ success, caseId, taskId, assignedTo, assignmentMethod }`

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

## Testing

```bash
cd vercel-webhook

# Unit tests
node tests/lib/webhook.test.mjs

# Build check
npm run build
```

## License

Private — Valor Tax Relief
