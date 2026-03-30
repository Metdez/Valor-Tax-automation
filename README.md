# Valor Tax Automation

**Fully automated lead-to-case pipeline** that bridges GoHighLevel and IRS Logics — eliminating manual data entry and ensuring every new prospect is instantly assigned to the right team member.

## What It Does

When a potential client books an appointment in GoHighLevel, this system automatically:

1. **Captures the lead data** — name, email, phone, appointment details, and AI conversation summaries
2. **Creates a case in IRS Logics** — with all contact information properly formatted and mapped
3. **Assigns a Settlement Officer** — using an intelligent round-robin system that distributes cases evenly across your team

No copy-pasting. No manual entry. No leads falling through the cracks.

## How It Works

```
┌─────────────────────┐     Webhook      ┌──────────────────────┐     API Call     ┌─────────────────────┐
│                     │ ──────────────▶  │                      │ ──────────────▶  │                     │
│    GoHighLevel      │                  │   Vercel Function    │                  │    IRS Logics       │
│  (Appointment       │                  │  (Field Mapping +    │                  │  (Case Created +    │
│   Booked)           │                  │   Round-Robin)       │                  │   Officer Assigned) │
│                     │                  │                      │                  │                     │
└─────────────────────┘                  └──────────┬───────────┘                  └─────────────────────┘
                                                    │
                                                    │ Read/Update Index
                                                    ▼
                                          ┌──────────────────────┐
                                          │      Supabase        │
                                          │  (Round-Robin State) │
                                          └──────────────────────┘
```

## Key Features

### Instant Case Creation
The moment an appointment is booked, a fully populated case appears in IRS Logics — complete with contact details, appointment info, and AI-generated conversation summaries.

### Smart Round-Robin Assignment
Cases are automatically distributed across your team in a fair, rotating order. No favoritism, no bottlenecks, no manual assignment overhead. The rotation state persists in Supabase so it survives deployments and restarts.

### Intelligent Field Mapping
Phone numbers, dates, and state codes are automatically reformatted to match IRS Logics' required formats. Invalid data is gracefully handled — never breaks the pipeline.

### Duplicate Detection
Every case is checked against existing records using name, email, and phone to flag potential duplicates before they clutter your system.

### AI Conversation Context
When GHL's conversational AI interacts with a lead, the summary and transcript are automatically attached to the IRS Logics case notes — giving your team instant context before their first call.

## Architecture

This project follows a **3-layer architecture** designed for reliability:

| Layer | Purpose | Location |
|-------|---------|----------|
| **Directives** | SOPs and documentation | `directives/` |
| **Orchestration** | AI-powered decision making | CLAUDE.md / AGENTS.md |
| **Execution** | Deterministic scripts and functions | `execution/` + `vercel-webhook/` |

### Project Structure

```
├── directives/                          # Standard Operating Procedures
│   ├── create_case.md                   # IRS Logics case creation SOP
│   ├── ghl_appointment_to_irs_case.md   # Full automation flow SOP
│   └── irs_logics_auth.md               # API authentication guide
├── execution/                           # Deterministic scripts
│   └── create_case.py                   # Python script for manual case creation
├── vercel-webhook/                      # Serverless webhook handler
│   ├── api/
│   │   └── ghl-webhook.js              # Main webhook endpoint
│   ├── package.json
│   └── vercel.json
├── contacts.json                        # Round-robin officer roster
├── CLAUDE.md                            # AI agent instructions
├── AGENTS.md                            # AI agent instructions (mirror)
└── GEMINI.md                            # AI agent instructions (mirror)
```

## Tech Stack

- **GoHighLevel** — CRM, appointment booking, workflow automation
- **Vercel** — Serverless function hosting (zero-config, auto-scaling)
- **Supabase** — PostgreSQL database for round-robin state management
- **IRS Logics** — Tax case management platform (V4 API)
- **Python** — Manual case creation scripts

## Setup

### Prerequisites
- GoHighLevel account with API access
- IRS Logics account with API credentials (public key + secret key)
- Vercel account
- Supabase project

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
- `IRS_LOGICS_PUBLIC_KEY`
- `IRS_LOGICS_SECRET_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. Configure GHL Workflow
1. Go to **Automation → Workflows**
2. Create trigger: **Appointment Booked**
3. Add action: **Webhook (Outbound)**
4. Set URL to your Vercel endpoint: `https://your-project.vercel.app/api/ghl-webhook`
5. Publish

## Field Mapping

| GoHighLevel | IRS Logics | Format |
|-------------|-----------|--------|
| First Name | FirstName | — |
| Last Name | LastName | **Required** |
| Email | Email | — |
| Phone | CellPhone | `(xxx)xxx-xxxx` |
| Address | Address | — |
| City | City | — |
| State | State | 2-char code |
| Zip | Zip | — |
| Date of Birth | DOB | `MM/dd/yyyy` |
| Company | BusinessName | — |
| Contact Source | SourceName | — |
| Appointment + AI Summary | Notes | Combined |

## License

Private — Valor Tax Relief
