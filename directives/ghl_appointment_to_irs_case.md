# GHL Appointment -> IRS Logics Task (Auto-Sync)

## Overview
When a new appointment is booked in GoHighLevel, find the existing case in IRS Logics by email or phone, then create a task on that case with appointment details. The task is assigned to the case's existing settlement officer; if no officer is assigned, it falls back to round-robin.

## Architecture
```
GHL Appointment Booked
  -> GHL Workflow (Outbound Webhook)
    -> Vercel Serverless Function (/api/ghl-webhook)
      -> GHL REST lookup (primary)
      -> HighLevel MCP lookup (recovery when REST is missing data or errors)
      -> IRS Logics V4 API: Find Case (by email, fallback to phone)
      -> IRS Logics V4 API: Create Task (on found case)
```

## Flow

### Step 1: Find Case
- Try `FindCaseByEmail` first using the webhook email.
- If no match, try `FindCaseByPhone` using phone formatted as `(xxx)xxx-xxxx`.
- If no case is found, queue to `pending_tasks` with `reason: 'case_not_found'` for delayed retry (5 min, then 30 min). If still not found after retries, auto-create the case via `POST /V4/Case/CaseFile`.

### Step 2: Recover GHL Appointment Context
- Use the webhook payload first.
- If appointment fields are missing, try the normal GHL REST endpoints (`lib/ghl.js`).
- If the REST lookup still does not return appointment data, fall back to the **LangGraph AI agent** (`lib/agent.js`).
  - The agent uses Gemini Flash to intelligently query the GHL MCP server (`https://services.leadconnectorhq.com/mcp/`) via JSON-RPC 2.0 over SSE.
  - MCP auth uses the same `GHL_API_KEY` and `GHL_LOCATION_ID` env vars.
  - Agent requires `GOOGLE_API_KEY` env var. Gracefully skipped if not set.
  - Agent has a hard timeout (`AGENT_TIMEOUT_MS`, default 25s). On any failure, returns empty and the pending queue takes over.
  - MCP tools used: `contacts_get-contacts` (search), `contacts_get-contact` (details), `calendars_get-calendar-events` (appointments).
- If the agent also fails, the task is queued to `pending_tasks` for cron retry (up to 6 retries).

### Step 3: Officer Assignment (Case Officer Priority)
1. Call `CaseInfo?CaseID={id}&details=setofficerid` to get the case's settlement officer.
2. If `setofficerid` exists, assign the task to that officer (`assignment_method = "case_officer"`).
3. If `setofficerid` is null, fall back to round-robin (`assignment_method = "round_robin"`).
4. Officers come from Supabase `officers`, with hardcoded fallback if needed.

### Step 4: Create Task
- POST to `/V4/Task/Task` with:
  - `CaseID` from Step 1
  - `Subject`: `Appointment: {name} - {start time}`
  - `DueDate` and `Reminder`: appointment start time in UTC
  - `UserID`: array with the assigned officer's user ID
  - `Comments`: calendar, start and end time, AI summary, transcript
  - `TaskType`: `1`
  - `PriorityID`: `1`
  - `StatusID`: `0`

### Step 5: Write Case Activity
- After the IRS Logics task is created successfully, POST to `/V4/CaseActivity/Activity`.
- Use the same `CaseID`.
- Write a short subject/comment noting that the appointment task was auto-created from the GHL webhook, including:
  - task ID
  - assigned officer
  - assignment method
  - contact name
  - appointment start
  - calendar name
  - AI summary when available
- This activity write is non-blocking. If it fails, log the error server-side but still return webhook success because the primary task was already created.

## GHL Webhook Field Mapping

| GHL Field | Used For |
|----------|----------|
| `Email` / `email` | Find case (primary lookup) |
| `Phone` / `phone` | Find case (fallback lookup) |
| `First Name` / `first_name` | Task subject and logging |
| `Last Name` / `last_name` | Task subject and logging |
| `appointment_title` | Task subject |
| `appointment_start_time` | Task due date and subject |
| `appointment_end_time` | Task comments |
| `calender` | Task comments |
| `conversations_ai_summary` | Task comments |
| `conversations_ai_transcript` | Task comments |

## Deployment (Vercel)

### 1. Deploy
```bash
cd vercel-webhook
npm install
npx vercel --prod
```

### 2. Environment Variables in Vercel
```
IRS_LOGICS_PUBLIC_KEY=<from .env>
IRS_LOGICS_SECRET_KEY=<from .env>
SUPABASE_URL=<from .env>
SUPABASE_SERVICE_ROLE_KEY=<from .env>
GHL_API_KEY=<from .env>
GHL_LOCATION_ID=<from .env>
GOOGLE_API_KEY=<from .env>
AGENT_TIMEOUT_MS=25000  # optional, default 25s
```

### 3. Webhook URL
```
https://valor-sooty.vercel.app/api/ghl-webhook
```

### 4. GHL Workflow Setup
1. Open `Automation -> Workflows` in the GHL sub-account.
2. Add trigger: `Appointment Booked`.
3. Add action: outbound webhook to the Vercel endpoint.
4. Save and publish.

## Testing
```bash
curl -X POST https://valor-sooty.vercel.app/api/ghl-webhook \
  -H "Content-Type: application/json" \
  -d '{"First Name":"Test","Last Name":"User","Email":"test@example.com","Phone":"5551234567","appointment_title":"Test User","appointment_start_time":"Tuesday, March 31, 2026 3:00 PM","appointment_end_time":"Tuesday, March 31, 2026 3:45 PM","calender":"Valor Tax Appointment"}'
```

## Error Cases
- Missing email and phone -> 400
- No case found by email or phone -> queued for retry, then auto-created after retries exhausted
- Task creation fails -> return IRS Logics error details
- Supabase round-robin unavailable -> 500
- GHL REST unavailable -> fall back to AI agent with MCP, then pending queue

## Edge Cases and Notes
- Phone numbers with country code are normalized.
- Invalid phone formats are skipped and email is tried first.
- GHL date strings such as `Tuesday, March 31, 2026 3:00 PM` are parsed to UTC ISO strings.
- If chatbot bookings omit appointment fields, the app tries GHL REST, then the LangGraph AI agent (via GHL MCP), then queues to pending_tasks for cron retry.
- If no case exists after retry logic, the system auto-creates one via `POST /V4/Case/CaseFile` with the contact's name/email/phone, assigns a round-robin officer to both the case and task (`assignment_method: "auto_created"`), and prefixes task comments with `[Auto-Created Case]`.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `IRS_LOGICS_PUBLIC_KEY` | Basic Auth username for IRS Logics API |
| `IRS_LOGICS_SECRET_KEY` | Basic Auth password for IRS Logics API |
| `SUPABASE_URL` | Supabase REST API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `GHL_API_KEY` | GoHighLevel REST API key |
| `GHL_LOCATION_ID` | GoHighLevel sub-account location ID |
| `GOOGLE_API_KEY` | Google API key for the Gemini-powered LangGraph AI agent fallback |
| `AGENT_TIMEOUT_MS` | Optional timeout for agent (default 25000ms) |
