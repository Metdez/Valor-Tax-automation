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
- **Action:** Creates a case in IRS Logics with contact data + round-robin officer assignment
- **Infrastructure:** GHL Workflow Webhook → Vercel Serverless Function → IRS Logics V4 API

### Key Files
- `contacts.json` — The 13 case officers used for round-robin assignment
- `execution/create_case.py` — Python script to manually create an IRS Logics case
- `vercel-webhook/api/ghl-webhook.js` — Serverless function (deployed to Vercel) that receives GHL webhooks, maps fields, assigns officer via round-robin, and creates the IRS Logics case
- `directives/create_case.md` — SOP for creating cases via IRS Logics API
- `directives/irs_logics_auth.md` — IRS Logics authentication guide (Basic Auth)
- `directives/ghl_appointment_to_irs_case.md` — SOP for the full GHL → IRS Logics automated flow

### APIs & Auth
- **IRS Logics V4 API** — Basic Auth (public key + secret key). Endpoint: `https://valortax.irslogics.com/publicapi/V4/Case/CaseFile`
- **GoHighLevel** — API token + location ID. Webhook configured in GHL Workflows (Automation → Workflows → Appointment Booked → Outbound Webhook)

### Infrastructure
- **Vercel Project:** `valor` (deployed at `https://valor-sooty.vercel.app`)
- **Supabase Project:** `Valor` (ref: `znqzlmlkcbpfjdngspdu`) — stores `round_robin` table for tracking officer assignment index
- **GHL Location ID:** `vUJH65pfzeYnHCGQnVBW`

### Round-Robin Assignment
Officers from `contacts.json` are assigned as `Set. Officer` on each new case, rotating in order. The current index is stored in Supabase (`round_robin` table, single row). After cycling through all 13 officers, it wraps back to the first.

### Environment Variables (`.env`)
- `IRS_LOGICS_PUBLIC_KEY` / `IRS_LOGICS_SECRET_KEY` — IRS Logics Basic Auth
- `GHL_API_KEY` / `GHL_LOCATION_ID` — GoHighLevel credentials
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — Supabase connection

### GHL Webhook Field Mapping
GHL Workflow sends custom keys: `"First Name"`, `"Last Name"`, `"Email"`, `"Phone"`, `"appointment_id"`, `"appointment_title"`, `"appointment_start_time"`, `"appointment_end_time"`, `"calender"`, `"conversations_ai_summary"`, `"conversations_ai_transcript"`. The webhook handler also supports standard GHL keys (`first_name`, `last_name`, etc.) as fallback.
