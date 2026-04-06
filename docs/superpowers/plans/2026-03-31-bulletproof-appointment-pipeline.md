# Bulletproof Appointment Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every GHL appointment (form-booked or chatbot-booked) gets a correct IRS Logics task with real appointment data — never fake timestamps.

**Architecture:** Three-layer safety net: (1) Webhook creates tasks instantly when it has full appointment data, queues to `pending_tasks` when it doesn't. (2) A Vercel cron runs every 5 minutes, processes the pending queue by fetching real appointment data from the GHL API. (3) The same cron does a safety-net sweep of GHL calendar appointments to catch anything that slipped through both paths. Deduplication at every step prevents double-tasks.

**Tech Stack:** Next.js 14 App Router, Supabase (REST + JS client), GHL API, Vercel Cron

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `vercel-webhook/supabase/migrations/20260331_create_pending_tasks.sql` | SQL migration for `pending_tasks` table |
| Create | `vercel-webhook/lib/pending.js` | Insert, fetch, update, and expire pending tasks via Supabase REST |
| Create | `vercel-webhook/lib/dedup.js` | Check `task_logs` for existing tasks by case_id + appointment_start combo |
| Create | `vercel-webhook/lib/safety-net.js` | GHL calendar sweep: fetch recent appointments, compare against task_logs, return unprocessed ones |
| Create | `vercel-webhook/app/api/cron/process-pending/route.js` | Vercel cron endpoint: runs both Job A (pending queue) and Job B (safety net sweep) |
| Modify | `vercel-webhook/app/api/ghl-webhook/route.js` | Add gate: skip task creation when appointment data is missing, queue to `pending_tasks` instead |
| Modify | `vercel-webhook/vercel.json` | Add cron schedule for the new endpoint |
| Modify | `vercel-webhook/lib/dashboard.js` | Add pending count to dashboard stats |
| Modify | `vercel-webhook/app/page.js` | Show pending count indicator on dashboard |
| Create | `vercel-webhook/tests/lib/pending.test.mjs` | Unit tests for pending task helpers |
| Create | `vercel-webhook/tests/lib/dedup.test.mjs` | Unit tests for deduplication logic |
| Create | `vercel-webhook/tests/lib/safety-net.test.mjs` | Unit tests for safety net sweep logic |

---

## Task 1: Create `pending_tasks` Supabase Table

**Files:**
- Create: `vercel-webhook/supabase/migrations/20260331_create_pending_tasks.sql`

This table queues webhook payloads that arrived without appointment data. The cron job processes them.

- [ ] **Step 1: Write the migration SQL**

```sql
-- vercel-webhook/supabase/migrations/20260331_create_pending_tasks.sql
CREATE TABLE IF NOT EXISTS pending_tasks (
  id BIGSERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  appointment_title TEXT,
  calendar_name TEXT,
  ai_summary TEXT,
  ai_transcript TEXT,
  case_id INTEGER,
  lookup_method TEXT,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | needs_review
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for the cron job to quickly find pending rows
CREATE INDEX idx_pending_tasks_status ON pending_tasks (status) WHERE status IN ('pending', 'processing');

-- RLS off — service role key used for all operations
ALTER TABLE pending_tasks DISABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Run the migration against Supabase**

Run from `C:\Users\John Doe\Music`:
```bash
npx supabase db query --linked "$(cat vercel-webhook/supabase/migrations/20260331_create_pending_tasks.sql)"
```

Expected: Table created, no errors.

- [ ] **Step 3: Verify the table exists**

```bash
npx supabase db query --linked "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pending_tasks' ORDER BY ordinal_position;"
```

Expected: All columns listed (id, first_name, last_name, email, phone, appointment_title, calendar_name, ai_summary, ai_transcript, case_id, lookup_method, status, retry_count, error_message, created_at, updated_at).

- [ ] **Step 4: Commit**

```bash
git add vercel-webhook/supabase/migrations/20260331_create_pending_tasks.sql
git commit -m "feat: add pending_tasks table migration for appointment queue"
```

---

## Task 2: Create Pending Task Helpers (`lib/pending.js`)

**Files:**
- Create: `vercel-webhook/lib/pending.js`
- Test: `vercel-webhook/tests/lib/pending.test.mjs`

These helpers insert, fetch, update, and expire entries in the `pending_tasks` table using `supabaseRest()` for reads and `getSupabaseAdmin()` for writes (matching existing patterns in `lib/supabase.js`).

- [ ] **Step 1: Write the failing test**

```js
// vercel-webhook/tests/lib/pending.test.mjs
import assert from "node:assert/strict";
import { buildPendingEntry } from "../../lib/pending.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("buildPendingEntry maps normalized payload + caseId to DB row", () => {
  const entry = buildPendingEntry(
    {
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      phone: "(555)123-4567",
      appointmentTitle: null,
      calendarName: null,
      aiSummary: "Needs help",
      aiTranscript: "Transcript",
    },
    { caseId: 12345, lookupMethod: "email" }
  );

  assert.deepEqual(entry, {
    first_name: "Jane",
    last_name: "Doe",
    email: "jane@example.com",
    phone: "(555)123-4567",
    appointment_title: null,
    calendar_name: null,
    ai_summary: "Needs help",
    ai_transcript: "Transcript",
    case_id: 12345,
    lookup_method: "email",
    status: "pending",
    retry_count: 0,
  });
});

run("buildPendingEntry handles missing optional fields", () => {
  const entry = buildPendingEntry(
    { firstName: "Scott", email: "scott@test.com" },
    { caseId: null, lookupMethod: null }
  );

  assert.equal(entry.first_name, "Scott");
  assert.equal(entry.email, "scott@test.com");
  assert.equal(entry.last_name, undefined);
  assert.equal(entry.case_id, null);
  assert.equal(entry.status, "pending");
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd vercel-webhook && node tests/lib/pending.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// vercel-webhook/lib/pending.js
import { supabaseRest, getSupabaseAdmin } from "./supabase.js";

const MAX_RETRIES = 6; // 6 retries x 5 min = 30 minutes

/**
 * Build a pending_tasks row from a normalized webhook payload.
 */
export function buildPendingEntry(normalized, { caseId, lookupMethod }) {
  return {
    first_name: normalized.firstName,
    last_name: normalized.lastName,
    email: normalized.email,
    phone: normalized.phone,
    appointment_title: normalized.appointmentTitle,
    calendar_name: normalized.calendarName,
    ai_summary: normalized.aiSummary,
    ai_transcript: normalized.aiTranscript,
    case_id: caseId ?? null,
    lookup_method: lookupMethod || null,
    status: "pending",
    retry_count: 0,
  };
}

/**
 * Insert a new pending task into Supabase.
 */
export async function insertPendingTask(entry) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("pending_tasks").insert(entry);
  if (error) throw new Error(`pending_tasks insert failed: ${error.message}`);
}

/**
 * Fetch all pending or processing tasks that haven't exceeded max retries.
 */
export async function getPendingTasks() {
  const rows = await supabaseRest(
    `pending_tasks?status=in.(pending,processing)&retry_count=lt.${MAX_RETRIES}&order=created_at.asc&limit=20`
  );
  return rows || [];
}

/**
 * Mark a pending task as completed.
 */
export async function completePendingTask(id) {
  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body: { status: "completed", updated_at: new Date().toISOString() },
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * Increment retry count. If max retries exceeded, mark as needs_review.
 */
export async function incrementRetry(id, currentRetryCount, errorMessage) {
  const newCount = currentRetryCount + 1;
  const newStatus = newCount >= MAX_RETRIES ? "needs_review" : "pending";

  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body: {
      retry_count: newCount,
      status: newStatus,
      error_message: errorMessage || null,
      updated_at: new Date().toISOString(),
    },
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * Get count of pending tasks (for dashboard).
 */
export async function getPendingCount() {
  const { count } = await supabaseRest(
    "pending_tasks?status=in.(pending,processing)&select=id",
    {
      count: true,
      headers: { Prefer: "count=exact", Range: "0-0" },
    }
  );
  return count || 0;
}

/**
 * Get count of tasks needing manual review (for dashboard).
 */
export async function getNeedsReviewCount() {
  const { count } = await supabaseRest(
    "pending_tasks?status=eq.needs_review&select=id",
    {
      count: true,
      headers: { Prefer: "count=exact", Range: "0-0" },
    }
  );
  return count || 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd vercel-webhook && node tests/lib/pending.test.mjs
```

Expected: PASS for both tests.

- [ ] **Step 5: Commit**

```bash
git add vercel-webhook/lib/pending.js vercel-webhook/tests/lib/pending.test.mjs
git commit -m "feat: add pending task helpers for appointment queue"
```

---

## Task 3: Create Deduplication Helper (`lib/dedup.js`)

**Files:**
- Create: `vercel-webhook/lib/dedup.js`
- Test: `vercel-webhook/tests/lib/dedup.test.mjs`

Before creating any task (from webhook, pending queue, or safety net), check if a task already exists for the same case + appointment time. This prevents duplicates no matter which path fires.

- [ ] **Step 1: Write the failing test**

```js
// vercel-webhook/tests/lib/dedup.test.mjs
import assert from "node:assert/strict";
import { buildDedupKey } from "../../lib/dedup.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("buildDedupKey creates key from caseId + appointmentStart", () => {
  const key = buildDedupKey(12345, "2026-04-02T12:00:00.000Z");
  assert.equal(key, "12345|2026-04-02T12:00:00.000Z");
});

run("buildDedupKey returns null if caseId is missing", () => {
  assert.equal(buildDedupKey(null, "2026-04-02T12:00:00.000Z"), null);
});

run("buildDedupKey returns null if appointmentStart is missing", () => {
  assert.equal(buildDedupKey(12345, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd vercel-webhook && node tests/lib/dedup.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// vercel-webhook/lib/dedup.js
import { supabaseRest } from "./supabase.js";

/**
 * Build a dedup key from caseId + appointmentStart.
 * Returns null if either value is missing (can't dedup without both).
 */
export function buildDedupKey(caseId, appointmentStart) {
  if (!caseId || !appointmentStart) return null;
  return `${caseId}|${appointmentStart}`;
}

/**
 * Check if a task already exists in task_logs for this case + appointment time.
 * Returns true if a duplicate exists.
 */
export async function isDuplicateTask(caseId, appointmentStart) {
  if (!caseId || !appointmentStart) return false;

  const rows = await supabaseRest(
    `task_logs?case_id=eq.${encodeURIComponent(caseId)}&appointment_start=eq.${encodeURIComponent(appointmentStart)}&status=eq.success&select=id&limit=1`
  );

  return Array.isArray(rows) && rows.length > 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd vercel-webhook && node tests/lib/dedup.test.mjs
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add vercel-webhook/lib/dedup.js vercel-webhook/tests/lib/dedup.test.mjs
git commit -m "feat: add deduplication helpers for task creation"
```

---

## Task 4: Create Safety Net Sweep (`lib/safety-net.js`)

**Files:**
- Create: `vercel-webhook/lib/safety-net.js`
- Test: `vercel-webhook/tests/lib/safety-net.test.mjs`

The safety net fetches recent appointments from the GHL Calendar API and filters out any that already have a matching task log. Returns the unprocessed ones so the cron can create tasks for them.

- [ ] **Step 1: Write the failing test**

```js
// vercel-webhook/tests/lib/safety-net.test.mjs
import assert from "node:assert/strict";
import { filterNewAppointments } from "../../lib/safety-net.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("filterNewAppointments removes appointments that have matching task logs", () => {
  const ghlAppointments = [
    { contactEmail: "a@test.com", startTime: "2026-04-01 10:00:00", title: "Consult", calendarName: "Valor Tax" },
    { contactEmail: "b@test.com", startTime: "2026-04-01 11:00:00", title: "Review", calendarName: "Valor Tax" },
    { contactEmail: "c@test.com", startTime: "2026-04-01 12:00:00", title: "Followup", calendarName: "Valor Tax" },
  ];

  const existingLogs = [
    { email: "a@test.com", appointment_start: "2026-04-01T10:00:00.000Z" },
  ];

  const result = filterNewAppointments(ghlAppointments, existingLogs);
  assert.equal(result.length, 2);
  assert.equal(result[0].contactEmail, "b@test.com");
  assert.equal(result[1].contactEmail, "c@test.com");
});

run("filterNewAppointments returns all when no task logs exist", () => {
  const ghlAppointments = [
    { contactEmail: "a@test.com", startTime: "2026-04-01 10:00:00", title: "Consult", calendarName: "Valor Tax" },
  ];

  const result = filterNewAppointments(ghlAppointments, []);
  assert.equal(result.length, 1);
});

run("filterNewAppointments returns empty when all are already logged", () => {
  const ghlAppointments = [
    { contactEmail: "a@test.com", startTime: "2026-04-01 10:00:00", title: "Consult", calendarName: "Valor Tax" },
  ];

  const existingLogs = [
    { email: "a@test.com", appointment_start: "2026-04-01T10:00:00.000Z" },
  ];

  const result = filterNewAppointments(ghlAppointments, existingLogs);
  assert.equal(result.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd vercel-webhook && node tests/lib/safety-net.test.mjs
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// vercel-webhook/lib/safety-net.js
import { findGhlContact, getContactAppointment, getCalendarName } from "./ghl.js";
import { supabaseRest } from "./supabase.js";
import { parseGhlDate } from "./irs-logics.js";

/**
 * Pure function: filter out GHL appointments that already have a matching task log.
 * Matches on email + normalized appointment start time.
 */
export function filterNewAppointments(ghlAppointments, existingLogs) {
  const loggedSet = new Set();

  for (const log of existingLogs) {
    if (log.email && log.appointment_start) {
      // Normalize: strip milliseconds and trailing Z for comparison
      const normalizedStart = log.appointment_start.replace(/\.\d{3}Z$/, "");
      loggedSet.add(`${log.email.toLowerCase()}|${normalizedStart}`);
    }
  }

  return ghlAppointments.filter((appt) => {
    if (!appt.contactEmail || !appt.startTime) return true; // can't dedup, keep it
    const normalizedStart = parseGhlDate(appt.startTime)?.replace(/\.\d{3}Z$/, "") || appt.startTime;
    const key = `${appt.contactEmail.toLowerCase()}|${normalizedStart}`;
    return !loggedSet.has(key);
  });
}

/**
 * Fetch recent GHL appointments from the calendar API.
 * Gets all contacts who had appointments in the last 24 hours.
 * Returns enriched appointment objects with contact info.
 *
 * Note: GHL doesn't have a "list all calendar appointments" endpoint.
 * Instead, we pull recent successful task_logs and recent pending_tasks
 * to get contact emails/phones, then check each for new appointments
 * that aren't yet in task_logs. This is the safety net — it only catches
 * contacts we've seen before (via webhook or pending queue).
 *
 * A true "poll all appointments" approach would require GHL Calendar API
 * access which uses OAuth2 — out of scope for v1.
 */
export async function fetchRecentGhlAppointments() {
  // Get contacts from recent task_logs (last 24h) to re-check for new appointments
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentLogs = await supabaseRest(
    `task_logs?created_at=gte.${encodeURIComponent(oneDayAgo)}&select=email,phone&order=created_at.desc`
  );

  // Also check pending_tasks for contacts
  const pendingContacts = await supabaseRest(
    `pending_tasks?status=in.(pending,processing,needs_review)&select=email,phone`
  );

  // Deduplicate contacts by email
  const contactMap = new Map();
  for (const row of [...(recentLogs || []), ...(pendingContacts || [])]) {
    if (row.email && !contactMap.has(row.email.toLowerCase())) {
      contactMap.set(row.email.toLowerCase(), { email: row.email, phone: row.phone });
    }
  }

  const appointments = [];

  for (const [, contact] of contactMap) {
    try {
      const contactId = await findGhlContact(contact.email, contact.phone);
      if (!contactId) continue;

      const appt = await getContactAppointment(contactId);
      if (!appt || !appt.startTime) continue;

      let calendarName = null;
      if (appt.calendarId) {
        calendarName = await getCalendarName(appt.calendarId);
      }

      appointments.push({
        contactEmail: contact.email,
        contactPhone: contact.phone,
        startTime: appt.startTime,
        endTime: appt.endTime,
        title: appt.title,
        calendarName,
      });
    } catch (err) {
      console.error(`Safety net: failed to check ${contact.email}:`, err.message);
    }
  }

  return appointments;
}

/**
 * Get existing task logs for the last 24 hours (for dedup comparison).
 */
export async function getRecentTaskLogs() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRest(
    `task_logs?created_at=gte.${encodeURIComponent(oneDayAgo)}&status=eq.success&select=email,appointment_start`
  );
  return rows || [];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd vercel-webhook && node tests/lib/safety-net.test.mjs
```

Expected: PASS for all three tests.

- [ ] **Step 5: Commit**

```bash
git add vercel-webhook/lib/safety-net.js vercel-webhook/tests/lib/safety-net.test.mjs
git commit -m "feat: add safety net sweep for catching missed appointments"
```

---

## Task 5: Modify Webhook Handler — Gate Missing Appointment Data

**Files:**
- Modify: `vercel-webhook/app/api/ghl-webhook/route.js`

When the webhook has contact info but no appointment data (chatbot bookings), queue it to `pending_tasks` instead of creating a task with fake timestamps. If it has full data (form bookings), create the task immediately as before.

- [ ] **Step 1: Update the webhook handler**

Add imports at the top of `vercel-webhook/app/api/ghl-webhook/route.js`:

```js
import { buildPendingEntry, insertPendingTask } from "@/lib/pending";
import { isDuplicateTask } from "@/lib/dedup";
```

Replace the existing GHL fallback block (lines 74-94) and the task creation flow. The new logic after case lookup succeeds (after line 72):

```js
    // If the webhook payload is missing appointment times, try GHL API fallback
    if (!normalized.appointmentStart) {
      console.log("Appointment time missing from webhook — fetching from GHL API");
      const ghlData = await fetchAppointmentFromGhl(
        normalized.email,
        normalized.phone
      );

      if (ghlData.appointmentStart) {
        normalized.appointmentStart = ghlData.appointmentStart;
      }
      if (ghlData.appointmentEnd) {
        normalized.appointmentEnd = ghlData.appointmentEnd;
      }
      if (ghlData.appointmentTitle && !normalized.appointmentTitle) {
        normalized.appointmentTitle = ghlData.appointmentTitle;
      }
      if (ghlData.calendarName && !normalized.calendarName) {
        normalized.calendarName = ghlData.calendarName;
      }
    }

    // GATE: If we STILL don't have appointment data after GHL fallback,
    // queue to pending_tasks instead of creating a task with fake times
    if (!normalized.appointmentStart) {
      console.log("Still no appointment data after GHL fallback — queuing to pending_tasks");

      const pendingEntry = buildPendingEntry(normalized, { caseId, lookupMethod });
      await insertPendingTask(pendingEntry);

      await safeInsertTaskLog({
        ...normalized,
        caseId,
        lookupMethod,
        status: "pending_appointment",
        errorMessage: "Appointment data missing — queued for retry via cron",
      });

      return NextResponse.json({
        success: true,
        queued: true,
        caseId,
        message: "Appointment data missing — queued for processing. Task will be created when appointment details are available.",
      });
    }

    // DEDUP: Check if we already created a task for this case + appointment time
    const parsedStartForDedup = parseGhlDate(normalized.appointmentStart) || normalized.appointmentStart;
    if (await isDuplicateTask(caseId, parsedStartForDedup)) {
      console.log(`Duplicate task detected for case ${caseId} at ${parsedStartForDedup} — skipping`);
      return NextResponse.json({
        success: true,
        duplicate: true,
        caseId,
        message: "Task already exists for this appointment",
      });
    }
```

Also add the `parseGhlDate` import at the top:

```js
import { parseGhlDate } from "@/lib/irs-logics";
```

The rest of the handler (officer assignment, task creation, logging) stays unchanged.

- [ ] **Step 2: Run unit tests**

```bash
cd vercel-webhook && node tests/lib/webhook.test.mjs
```

Expected: All existing tests still pass (we didn't change `normalizeWebhookPayload` or `buildTaskDetails`).

- [ ] **Step 3: Run build check**

```bash
cd vercel-webhook && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add vercel-webhook/app/api/ghl-webhook/route.js
git commit -m "feat: gate webhook — queue to pending when appointment data missing"
```

---

## Task 6: Create Cron Endpoint (`/api/cron/process-pending`)

**Files:**
- Create: `vercel-webhook/app/api/cron/process-pending/route.js`

This is the heart of the bulletproof pipeline. Runs every 5 minutes via Vercel cron. Two jobs:

**Job A** — Process the `pending_tasks` queue: fetch real appointment data from GHL API, create the IRS Logics task if data found, increment retry count if not.

**Job B** — Safety net sweep: check GHL for recent appointments that don't have matching task logs, create tasks for any unprocessed ones.

- [ ] **Step 1: Write the cron handler**

```js
// vercel-webhook/app/api/cron/process-pending/route.js
import { NextResponse } from "next/server";
import { fetchAppointmentFromGhl } from "@/lib/ghl";
import { createTask, findCase, getCaseOfficer, parseGhlDate } from "@/lib/irs-logics";
import { getNextOfficer, insertTaskLog } from "@/lib/supabase";
import { buildTaskDetails } from "@/lib/webhook";
import {
  getPendingTasks,
  completePendingTask,
  incrementRetry,
} from "@/lib/pending";
import { isDuplicateTask } from "@/lib/dedup";
import {
  fetchRecentGhlAppointments,
  getRecentTaskLogs,
  filterNewAppointments,
} from "@/lib/safety-net";

export const dynamic = "force-dynamic";

/**
 * Verify the request is from Vercel Cron (production) or allow in dev.
 */
function isAuthorized(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;

  // Allow in development
  if (process.env.NODE_ENV === "development") return true;

  return false;
}

/**
 * Job A: Process pending_tasks queue.
 * For each pending entry, try to fetch appointment data from GHL API.
 * If found, create the IRS Logics task. If not, increment retry.
 */
async function processPendingQueue() {
  const pending = await getPendingTasks();
  const results = { processed: 0, completed: 0, retried: 0, failed: 0 };

  for (const row of pending) {
    results.processed++;

    try {
      // Try GHL API to get appointment data
      const ghlData = await fetchAppointmentFromGhl(row.email, row.phone);

      if (!ghlData.appointmentStart) {
        // Still no data — retry later
        await incrementRetry(row.id, row.retry_count, "GHL API returned no appointment data");
        results.retried++;
        continue;
      }

      // We have appointment data — find the case if we don't have one yet
      let caseId = row.case_id;
      let lookupMethod = row.lookup_method;

      if (!caseId) {
        const lookup = await findCase(row.email, row.phone);
        caseId = lookup.caseId;
        lookupMethod = lookup.lookupMethod;
      }

      if (!caseId) {
        await incrementRetry(row.id, row.retry_count, "Case still not found in IRS Logics");
        results.retried++;
        continue;
      }

      // Dedup check
      const parsedStart = parseGhlDate(ghlData.appointmentStart) || ghlData.appointmentStart;
      if (await isDuplicateTask(caseId, parsedStart)) {
        await completePendingTask(row.id);
        results.completed++;
        console.log(`Pending #${row.id}: duplicate task exists, marking completed`);
        continue;
      }

      // Build normalized payload with enriched data
      const normalized = {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        phone: row.phone,
        appointmentTitle: ghlData.appointmentTitle || row.appointment_title,
        appointmentStart: ghlData.appointmentStart,
        appointmentEnd: ghlData.appointmentEnd,
        calendarName: ghlData.calendarName || row.calendar_name,
        aiSummary: row.ai_summary,
        aiTranscript: row.ai_transcript,
      };

      // Officer assignment
      let officer, assignmentMethod;
      const caseOfficer = await getCaseOfficer(caseId);
      if (caseOfficer) {
        officer = caseOfficer;
        assignmentMethod = "case_officer";
      } else {
        const assignment = await getNextOfficer();
        officer = assignment.officer;
        assignmentMethod = "round_robin";
      }

      // Build and create task
      const taskDetails = buildTaskDetails(normalized);

      const taskPayload = {
        CaseID: caseId,
        Subject: taskDetails.subject,
        TaskType: 1,
        UserID: [officer.userId],
        PriorityID: 1,
        StatusID: 0,
        DueDate: taskDetails.dueDate,
        Reminder: taskDetails.reminder,
        ...(taskDetails.endDate ? { EndDate: taskDetails.endDate } : {}),
        ...(taskDetails.comments ? { Comments: taskDetails.comments } : {}),
      };

      const taskResult = await createTask(taskPayload);

      // Log the result
      await insertTaskLog({
        ...normalized,
        caseId,
        lookupMethod,
        taskId: taskResult.taskId,
        taskSubject: taskDetails.subject,
        officerName: officer.name,
        officerUserId: officer.userId,
        assignmentMethod,
        appointmentStart: taskDetails.dueDate,
        appointmentEnd: taskDetails.endDate,
        status: taskResult.ok ? "success" : "task_failed",
        errorMessage: taskResult.errorMessage || null,
      });

      if (taskResult.ok) {
        await completePendingTask(row.id);
        results.completed++;
        console.log(`Pending #${row.id}: task created successfully (case ${caseId})`);
      } else {
        await incrementRetry(row.id, row.retry_count, taskResult.errorMessage);
        results.failed++;
      }
    } catch (error) {
      console.error(`Pending #${row.id} error:`, error.message);
      await incrementRetry(row.id, row.retry_count, error.message);
      results.failed++;
    }
  }

  return results;
}

/**
 * Job B: Safety net sweep.
 * Check GHL for recent appointments not yet in task_logs.
 */
async function safetyNetSweep() {
  const results = { checked: 0, created: 0, skipped: 0 };

  try {
    const [ghlAppointments, recentLogs] = await Promise.all([
      fetchRecentGhlAppointments(),
      getRecentTaskLogs(),
    ]);

    const newAppointments = filterNewAppointments(ghlAppointments, recentLogs);
    results.checked = ghlAppointments.length;

    for (const appt of newAppointments) {
      try {
        // Find the case
        const lookup = await findCase(appt.contactEmail, appt.contactPhone);
        if (!lookup.caseId) {
          results.skipped++;
          continue;
        }

        // Dedup check
        const parsedStart = parseGhlDate(appt.startTime) || appt.startTime;
        if (await isDuplicateTask(lookup.caseId, parsedStart)) {
          results.skipped++;
          continue;
        }

        // Officer assignment
        let officer, assignmentMethod;
        const caseOfficer = await getCaseOfficer(lookup.caseId);
        if (caseOfficer) {
          officer = caseOfficer;
          assignmentMethod = "case_officer";
        } else {
          const assignment = await getNextOfficer();
          officer = assignment.officer;
          assignmentMethod = "round_robin";
        }

        // Build task
        const normalized = {
          email: appt.contactEmail,
          phone: appt.contactPhone,
          appointmentTitle: appt.title,
          appointmentStart: appt.startTime,
          appointmentEnd: appt.endTime,
          calendarName: appt.calendarName,
        };

        const taskDetails = buildTaskDetails(normalized);

        const taskPayload = {
          CaseID: lookup.caseId,
          Subject: taskDetails.subject,
          TaskType: 1,
          UserID: [officer.userId],
          PriorityID: 1,
          StatusID: 0,
          DueDate: taskDetails.dueDate,
          Reminder: taskDetails.reminder,
          ...(taskDetails.endDate ? { EndDate: taskDetails.endDate } : {}),
          ...(taskDetails.comments
            ? { Comments: `[Safety Net] ${taskDetails.comments}` }
            : { Comments: "[Safety Net] Created by cron sweep" }),
        };

        const taskResult = await createTask(taskPayload);

        await insertTaskLog({
          ...normalized,
          caseId: lookup.caseId,
          lookupMethod: lookup.lookupMethod,
          taskId: taskResult.taskId,
          taskSubject: taskDetails.subject,
          officerName: officer.name,
          officerUserId: officer.userId,
          assignmentMethod,
          appointmentStart: taskDetails.dueDate,
          appointmentEnd: taskDetails.endDate,
          status: taskResult.ok ? "success" : "task_failed",
          errorMessage: taskResult.errorMessage || null,
        });

        if (taskResult.ok) results.created++;
      } catch (err) {
        console.error("Safety net: failed to process appointment:", err.message);
        results.skipped++;
      }
    }
  } catch (error) {
    console.error("Safety net sweep failed:", error.message);
  }

  return results;
}

export async function GET(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("Cron: starting pending queue + safety net sweep");

  const [pendingResults, safetyResults] = await Promise.all([
    processPendingQueue(),
    safetyNetSweep(),
  ]);

  console.log("Cron complete:", { pending: pendingResults, safetyNet: safetyResults });

  return NextResponse.json({
    success: true,
    pending: pendingResults,
    safetyNet: safetyResults,
  });
}
```

- [ ] **Step 2: Run build check**

```bash
cd vercel-webhook && npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add vercel-webhook/app/api/cron/process-pending/route.js
git commit -m "feat: add cron endpoint for pending queue processing + safety net sweep"
```

---

## Task 7: Configure Vercel Cron

**Files:**
- Modify: `vercel-webhook/vercel.json`

- [ ] **Step 1: Update vercel.json with cron config**

Replace the contents of `vercel-webhook/vercel.json`:

```json
{
  "version": 2,
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/process-pending",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

This runs every 5 minutes.

- [ ] **Step 2: Add CRON_SECRET env var note**

Vercel Cron Jobs automatically send the `CRON_SECRET` env var as a Bearer token. You need to add it to the Vercel project:

1. Go to Vercel Dashboard → `valor` project → Settings → Environment Variables
2. Add `CRON_SECRET` with a random value (e.g., generate with `openssl rand -hex 32`)
3. The cron handler checks this to verify the request is from Vercel

- [ ] **Step 3: Commit**

```bash
git add vercel-webhook/vercel.json
git commit -m "feat: configure Vercel cron to run pending processor every 5 minutes"
```

---

## Task 8: Add Pending Count to Dashboard

**Files:**
- Modify: `vercel-webhook/lib/dashboard.js`
- Modify: `vercel-webhook/app/page.js`

Show a pending count and needs-review count on the dashboard so users can see if tasks are queued.

- [ ] **Step 1: Update dashboard.js to include pending counts**

Add import at top of `vercel-webhook/lib/dashboard.js`:

```js
import { getPendingCount, getNeedsReviewCount } from "./pending.js";
```

Add two more parallel calls inside the `Promise.all` in `getDashboardStats()`:

```js
  const [
    totalResponse,
    todayResponse,
    weekResponse,
    successResponse,
    recentLogs,
    officerLogs,
    roundRobinPreview,
    pendingCount,
    needsReviewCount,
  ] = await Promise.all([
    supabaseRest("task_logs?select=id", { count: true, headers: { Prefer: "count=exact", Range: "0-0" } }),
    supabaseRest(`task_logs?select=id&created_at=gte.${encodeURIComponent(todayStart)}`, { count: true, headers: { Prefer: "count=exact", Range: "0-0" } }),
    supabaseRest(`task_logs?select=id&created_at=gte.${encodeURIComponent(weekStart)}`, { count: true, headers: { Prefer: "count=exact", Range: "0-0" } }),
    supabaseRest(`task_logs?select=id&status=eq.success`, { count: true, headers: { Prefer: "count=exact", Range: "0-0" } }),
    supabaseRest("task_logs?select=*&order=created_at.desc&limit=10"),
    supabaseRest("task_logs?select=officer_name,officer_user_id,created_at"),
    peekNextOfficer(),
    getPendingCount(),
    getNeedsReviewCount(),
  ]);
```

Add to the return object:

```js
    pendingCount,
    needsReviewCount,
```

- [ ] **Step 2: Update dashboard page to show pending indicator**

In `vercel-webhook/app/page.js`, add two new stat cards after the existing three:

```jsx
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-5">
        <StatCard title="Total Tasks" value={stats.totalTasks} icon="📋" />
        <StatCard title="Tasks Today" value={stats.tasksToday} icon="📅" />
        <StatCard title="Tasks This Week" value={stats.tasksThisWeek} icon="📊" />
        {stats.pendingCount > 0 && (
          <StatCard title="Pending" value={stats.pendingCount} icon="⏳" />
        )}
        {stats.needsReviewCount > 0 && (
          <StatCard title="Needs Review" value={stats.needsReviewCount} icon="⚠️" />
        )}
      </div>
```

- [ ] **Step 3: Run build check**

```bash
cd vercel-webhook && npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add vercel-webhook/lib/dashboard.js vercel-webhook/app/page.js
git commit -m "feat: show pending and needs-review counts on dashboard"
```

---

## Task 9: Run All Tests + Final Build

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

```bash
cd vercel-webhook && node tests/lib/webhook.test.mjs
cd vercel-webhook && node tests/lib/pending.test.mjs
cd vercel-webhook && node tests/lib/dedup.test.mjs
cd vercel-webhook && node tests/lib/safety-net.test.mjs
```

Expected: All tests pass.

- [ ] **Step 2: Final build check**

```bash
cd vercel-webhook && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 3: Deploy to Vercel**

```bash
cd vercel-webhook && npx vercel --prod
```

After deploy, add `CRON_SECRET` env var in Vercel Dashboard if not done already.

- [ ] **Step 4: Verify cron is registered**

Check Vercel Dashboard → `valor` project → Settings → Cron Jobs. Should show `/api/cron/process-pending` running every 5 minutes.

- [ ] **Step 5: Final commit (if any remaining changes)**

```bash
git add -A
git commit -m "chore: final build verification for bulletproof appointment pipeline"
```

---

## Summary of Changes

| Component | What Changes |
|-----------|-------------|
| **Supabase** | New `pending_tasks` table |
| **Webhook handler** | Gates on missing appointment data → queues instead of creating bad tasks |
| **New: `lib/pending.js`** | Insert/fetch/update/expire pending tasks |
| **New: `lib/dedup.js`** | Prevents duplicate task creation across all paths |
| **New: `lib/safety-net.js`** | GHL calendar sweep to catch missed appointments |
| **New: Cron endpoint** | Processes pending queue + runs safety net every 5 min |
| **`vercel.json`** | Cron schedule added |
| **Dashboard** | Shows pending + needs-review counts |
| **Vercel env** | New `CRON_SECRET` variable required |

## Flow Diagram

```
GHL Appointment Booked
        │
        ▼
   Webhook fires
        │
   ┌────┴────┐
   │ Has appointment data?
   │         │
  YES       NO
   │         │
   ▼         ▼
  Dedup    Try GHL API fallback
  check        │
   │      ┌───┴───┐
   │     YES     NO
   │      │       │
   │      ▼       ▼
   │   Dedup   Queue to
   │   check   pending_tasks
   │      │       │
   ▼      ▼       │
 Create task      │
 immediately      │
   │              │
   ▼              ▼
 task_logs     Cron (every 5 min)
               ┌──────┴──────┐
          Job A: Process    Job B: Safety
          pending queue     net sweep
               │                │
               ▼                ▼
          Fetch GHL API    Check GHL for
          for real data    missed appts
               │                │
               ▼                ▼
          Create task      Create task
          (correct data)   (correct data)
               │                │
               ▼                ▼
            task_logs        task_logs
```
