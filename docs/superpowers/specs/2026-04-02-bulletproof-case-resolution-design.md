# Bulletproof Case Resolution Design

**Date:** 2026-04-02  
**Goal:** Eliminate `case_not_found` and `task_failed` as permanent failure states. Every webhook that has at least a name, email, or phone must result in a created task — no exceptions.

## Problem

The current system has two gaps:
1. `case_not_found` entries can dead-end at `needs_review` — especially when appointment data is also missing (cron early-exit bug, now fixed inline but the broader retry/search logic is still too limited).
2. `task_failed` entries are logged and forgotten — no retry, no recovery.

Both scenarios require manual intervention to resolve, which is unacceptable at scale.

## Approach

**Aggressive Cron with Smarter Search.** The webhook stays fast (queues quickly), and the cron processor is supercharged with an escalating search chain, more retries, faster auto-create, and task-failed recovery.

## Design

### 1. Enhanced Case Search Chain

The cron uses an escalating search strategy that gets more aggressive with each retry:

**Retry 1 (basic re-check):**
- `findCaseByEmail(email)` — exact match
- `findCaseByPhone(phone)` — exact match

**Retry 2 (expanded search):**
- Everything from retry 1, plus:
- `findCaseByPhone(altFormats)` — alternate phone formats: `(267)333-9583` → `2673339583` → `267-333-9583` → `267.333.9583`
- GHL contact enrichment — query GHL for the full contact record, recover any alternate emails/phones not in the pending row, feed those into IRS Logics search

**Retry 3 (AI-assisted):**
- Everything from retry 2, plus:
- AI agent fuzzy match via Gemini — searches GHL by name variations, finds alternate contact info, tries those against IRS Logics

**Retry 4 (auto-create):**
- All search methods exhausted — create the case in IRS Logics immediately
- Assign round-robin officer to the case
- Create task with available data (fallback DueDate if no appointment times)

### 2. Retry Schedule

```
case_not_found:
  Retry 1:  5 minutes   — basic re-check (catches timing-gap cases)
  Retry 2:  10 minutes  — expanded search (alt phone formats + GHL cross-ref)
  Retry 3:  30 minutes  — full search chain + AI agent
  Retry 4:  AUTO-CREATE — guaranteed resolution

task_failed:
  Retry 1:  5 minutes   — same officer
  Retry 2:  10 minutes  — different officer (rotate round-robin)
  Retry 3:  30 minutes  — different officer again
  After 3:  needs_review (only if 3 different officers all fail)

missing_contact_info: (unchanged)
  Retry 1:  5 minutes
  Retry 2:  30 minutes
  Retry 3:  2 hours
  After 3:  needs_review
```

### 3. Contact Info Enrichment (New)

Before running the search chain on retry 2+, the cron enriches the contact record:

```
enrichContactInfo(email, phone):
  1. Search GHL by email or phone (REST → MCP fallback)
  2. If contact found, extract all available fields:
     - Additional emails
     - Additional phone numbers
     - Full name (for name-based search)
  3. Persist any newly discovered info to the pending_tasks row
  4. Return enriched { emails[], phones[] } for IRS Logics search
```

This handles cases where GHL has a contact under a different email/phone than what the webhook sent.

### 4. Alternate Phone Format Search (New)

```
findCaseByPhoneAltFormats(phone):
  Given "(267)333-9583", try IRS Logics FindCaseByPhone with:
    - (267)333-9583  (original, already tried)
    - 2673339583     (digits only)
    - 267-333-9583   (dashed)
    - 267.333.9583   (dotted)
    - +12673339583   (E.164)
  Stop on first match.
```

### 5. AI Agent Fuzzy Match (Enhanced)

The existing Gemini agent in `lib/agent.js` is extended with a new mode for case resolution:

```
findCaseViaAgent(email, phone, firstName, lastName):
  System prompt instructs Gemini to:
    1. Search GHL for the contact by email, phone, and name
    2. If found, extract ALL contact info (all emails, all phones)
    3. Return { emails: [...], phones: [...], name: "..." }
  
  The cron then feeds every returned email/phone into findCase().
```

This catches scenarios like:
- "Kitty Drumwright" in GHL has email `chrissiedrumwright@gmail.com`, but IRS Logics has the case under a different email
- Contact has multiple phone numbers; webhook sent one, case is filed under another

### 6. Task-Failed Recovery (New)

Currently `task_failed` is a dead end. New behavior:

**In the webhook handler (`ghl-webhook/route.js`):**
- When `createTask()` returns `ok: false`, queue to `pending_tasks` with `reason: 'task_failed'` instead of just logging
- Include `case_id` in the pending row (we already found the case)

**In the cron processor:**
- For `task_failed` rows: skip case search (we have the case_id)
- Retry task creation with the same officer first
- On 2nd failure: rotate to a different officer (handles "User account is inactive" errors)
- On 3rd failure with a different officer: rotate again
- After 3 failures with 3 different officers: `needs_review`

### 7. Guarantee Matrix

| Scenario | Current Outcome | New Outcome |
|----------|----------------|-------------|
| Case not found, appointment available | `needs_review` after 30 min | Auto-created at retry 4 (~45 min) |
| Case not found, NO appointment data | Stuck forever (was a bug) | Auto-created with fallback DueDate |
| Case found, task creation fails | `task_failed`, dead end | Retried 3x with officer rotation |
| IRS Logics API transiently down | `needs_review` | Retries until API recovers |
| GHL has alternate contact info | Never discovered | Found via enrichment on retry 2 |
| No email/phone/name | `needs_review` | `needs_review` (only true dead end) |

**The only path to `needs_review`:** the contact has no email, no phone, and no name, OR task creation fails with 3 different officers.

### 8. Files Modified

**`lib/pending.js`:**
- `MAX_CASE_NOT_FOUND_RETRIES`: 2 → 4
- `computeNextRetryAt()`: new schedule (5 min → 10 min → 30 min → auto-create)
- `getRetryStatus()`: case_not_found never returns `"needs_review"` — retries 1-3 return `"pending"`, retry 4 triggers auto-create in the cron (not via status)
- New reason `"task_failed"` with its own 3-retry schedule and `MAX_TASK_FAILED_RETRIES = 3`

**`lib/irs-logics.js`:**
- New `findCaseByPhoneAltFormats(phone)` — tries 4-5 phone format variations
- New `findCaseExhaustive(email, phone, extraEmails, extraPhones)` — runs full search chain

**`lib/ghl.js`:**
- New `enrichContactInfo(email, phone)` — queries GHL for full contact record, returns all emails/phones found

**`app/api/cron/process-pending/route.js`:**
- Rewritten case_not_found handler with escalating search chain tied to retry count
- Contact enrichment on retry 2+
- AI agent search on retry 3
- Guaranteed auto-create on retry 4
- New task_failed handler with officer rotation
- Task-failed entries skip case search (case_id already known)

**`app/api/ghl-webhook/route.js`:**
- On task creation failure: queue to `pending_tasks` with `reason: 'task_failed'` + case_id, instead of just logging

### 9. Files NOT Modified

- Dashboard pages, officer management, round-robin logic — unchanged
- `lib/ghl-mcp.js` — unchanged (already supports all needed search modes)
- `lib/agent.js` — minor prompt extension for case-resolution mode, but the tool infrastructure stays the same
- `lib/webhook.js`, `lib/dedup.js`, `lib/safety-net.js` — unchanged
- All existing tests remain valid

### 10. Testing Plan

- Update `tests/lib/pending.test.mjs` — new retry schedule, new reason `task_failed`
- New test: `findCaseByPhoneAltFormats` generates correct format variations
- New test: `findCaseExhaustive` calls searches in correct order, stops on first match
- New test: `enrichContactInfo` returns additional emails/phones from GHL mock
- New test: cron escalation — verify retry 1 does basic search, retry 2 adds alt formats, retry 3 adds agent, retry 4 auto-creates
- New test: task_failed retry with officer rotation
- Build check: `npm run build` must pass
