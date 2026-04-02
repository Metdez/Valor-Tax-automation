# Bulletproof Case Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate `case_not_found` and `task_failed` as permanent failure states — every webhook with at least a name, email, or phone always results in a created IRS Logics task.

**Architecture:** Supercharge the cron processor with an escalating 4-retry search chain (basic → alt phone formats + GHL enrichment → AI agent → auto-create). Add `task_failed` as a retryable pending reason with officer rotation. The webhook handler stays fast (queues quickly); all heavy lifting is in the cron.

**Tech Stack:** Next.js 14 (App Router, ESM), Supabase (REST + JS client), IRS Logics V4 API, GHL REST + MCP APIs, LangGraph + Gemini Flash agent. Tests use `node:assert/strict` (no framework).

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `vercel-webhook/lib/pending.js` | Modify | New retry schedule, `MAX_CASE_NOT_FOUND_RETRIES=4`, new `task_failed` reason with `MAX_TASK_FAILED_RETRIES=3` |
| `vercel-webhook/lib/irs-logics.js` | Modify | New `phoneFormats()`, `findCaseByPhoneAltFormats()`, `findCaseExhaustive()` |
| `vercel-webhook/lib/ghl.js` | Modify | New `enrichContactInfo()` — query GHL for full contact record, return all emails/phones |
| `vercel-webhook/lib/agent.js` | Modify | New `findContactInfoViaAgent()` — agent mode that returns emails/phones instead of appointments |
| `vercel-webhook/app/api/cron/process-pending/route.js` | Modify | Rewritten `case_not_found` handler with escalating search; new `task_failed` handler with officer rotation |
| `vercel-webhook/app/api/ghl-webhook/route.js` | Modify | Queue `task_failed` to pending instead of dead-ending |
| `vercel-webhook/tests/lib/pending.test.mjs` | Modify | Updated tests for new schedule + new reason |
| `vercel-webhook/tests/lib/irs-logics.test.mjs` | Create | Tests for `phoneFormats()`, `findCaseByPhoneAltFormats()`, `findCaseExhaustive()` |
| `vercel-webhook/tests/lib/ghl-enrichment.test.mjs` | Create | Tests for `enrichContactInfo()` |

---

### Task 1: Update Pending Retry Schedule & Add `task_failed` Reason

**Files:**
- Modify: `vercel-webhook/lib/pending.js`
- Modify: `vercel-webhook/tests/lib/pending.test.mjs`

- [ ] **Step 1: Update the tests first — change expected values for new schedule**

In `vercel-webhook/tests/lib/pending.test.mjs`, replace these existing tests and add new ones. The full updated test file content after the existing imports and `run()` helper:

Replace the test `"MAX_CASE_NOT_FOUND_RETRIES is 2"` with:

```javascript
run("MAX_CASE_NOT_FOUND_RETRIES is 4", () => {
  assert.equal(MAX_CASE_NOT_FOUND_RETRIES, 4);
});
```

Replace the test `"getRetryStatus with reason=case_not_found caps at 2 retries"` with:

```javascript
run("getRetryStatus with reason=case_not_found never returns needs_review", () => {
  assert.equal(getRetryStatus(0, "case_not_found"), "pending");
  assert.equal(getRetryStatus(1, "case_not_found"), "pending");
  assert.equal(getRetryStatus(2, "case_not_found"), "pending");
  assert.equal(getRetryStatus(3, "case_not_found"), "pending");
  assert.equal(getRetryStatus(4, "case_not_found"), "pending");
  assert.equal(getRetryStatus(10, "case_not_found"), "pending");
});
```

Replace the test `"computeNextRetryAt returns 30 min for case_not_found retry 1"` with:

```javascript
run("computeNextRetryAt returns 10 min for case_not_found retry 1", () => {
  const before = Date.now();
  const result = computeNextRetryAt("case_not_found", 1);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 10 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 10 * 60 * 1000 + 2000);
});
```

Replace the test `"computeNextRetryAt returns null for case_not_found retry 2+ (exhausted)"` with:

```javascript
run("computeNextRetryAt returns 30 min for case_not_found retry 2", () => {
  const before = Date.now();
  const result = computeNextRetryAt("case_not_found", 2);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 30 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 30 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns null for case_not_found retry 3+ (auto-create)", () => {
  assert.equal(computeNextRetryAt("case_not_found", 3), null);
  assert.equal(computeNextRetryAt("case_not_found", 5), null);
});
```

Add new tests for `task_failed` at the end of the file (also add `MAX_TASK_FAILED_RETRIES` to the import):

Update the import at the top:

```javascript
import {
  buildPendingEntry,
  buildPendingTasksQuery,
  computeNextRetryAt,
  getRetryStatus,
  MAX_CASE_NOT_FOUND_RETRIES,
  MAX_MISSING_CONTACT_INFO_RETRIES,
  MAX_TASK_FAILED_RETRIES,
} from "../../lib/pending.js";
```

Add these tests at the bottom:

```javascript
run("MAX_TASK_FAILED_RETRIES is 3", () => {
  assert.equal(MAX_TASK_FAILED_RETRIES, 3);
});

run("computeNextRetryAt returns 5 min for task_failed retry 0", () => {
  const before = Date.now();
  const result = computeNextRetryAt("task_failed", 0);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 5 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 5 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns 10 min for task_failed retry 1", () => {
  const before = Date.now();
  const result = computeNextRetryAt("task_failed", 1);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 10 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 10 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns 30 min for task_failed retry 2", () => {
  const before = Date.now();
  const result = computeNextRetryAt("task_failed", 2);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 30 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 30 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns null for task_failed retry 3+", () => {
  assert.equal(computeNextRetryAt("task_failed", 3), null);
  assert.equal(computeNextRetryAt("task_failed", 5), null);
});

run("getRetryStatus with reason=task_failed caps at 3 retries", () => {
  assert.equal(getRetryStatus(0, "task_failed"), "pending");
  assert.equal(getRetryStatus(1, "task_failed"), "pending");
  assert.equal(getRetryStatus(2, "task_failed"), "pending");
  assert.equal(getRetryStatus(3, "task_failed"), "needs_review");
});

run("buildPendingEntry with reason=task_failed sets reason, case_id, and next_retry_at", () => {
  const before = Date.now();
  const entry = buildPendingEntry(
    { firstName: "Edwin", lastName: "Fernan", phone: "(209)814-8928" },
    { caseId: 24439, lookupMethod: "phone", reason: "task_failed" }
  );

  assert.equal(entry.reason, "task_failed");
  assert.equal(entry.case_id, 24439);
  assert.ok(entry.next_retry_at, "should have next_retry_at");
  const retryAt = new Date(entry.next_retry_at).getTime();
  assert.ok(retryAt >= before + 5 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 5 * 60 * 1000 + 2000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd vercel-webhook && node tests/lib/pending.test.mjs`

Expected: Multiple FAILs — `MAX_CASE_NOT_FOUND_RETRIES` is still 2, `MAX_TASK_FAILED_RETRIES` doesn't exist, `computeNextRetryAt` returns wrong values for new schedule.

- [ ] **Step 3: Update `lib/pending.js` with new schedule and `task_failed` reason**

In `vercel-webhook/lib/pending.js`:

Replace the constants and delay arrays (lines 1–16):

```javascript
import { supabaseRest, getSupabaseAdmin } from "./supabase.js";

export const MAX_RETRIES = 288;
export const MAX_CASE_NOT_FOUND_RETRIES = 4;
export const MAX_MISSING_CONTACT_INFO_RETRIES = 3;
export const MAX_TASK_FAILED_RETRIES = 3;

const CASE_NOT_FOUND_DELAYS_MS = [
  5 * 60 * 1000,    // retry 1: 5 minutes
  10 * 60 * 1000,   // retry 2: 10 minutes
  30 * 60 * 1000,   // retry 3: 30 minutes
  // retry 4: no delay — auto-create fires immediately
];

const MISSING_CONTACT_INFO_DELAYS_MS = [
  5 * 60 * 1000,      // 1st retry: 5 minutes
  30 * 60 * 1000,     // 2nd retry: 30 minutes
  2 * 60 * 60 * 1000, // 3rd retry: 2 hours
];

const TASK_FAILED_DELAYS_MS = [
  5 * 60 * 1000,    // retry 1: 5 minutes  — same officer
  10 * 60 * 1000,   // retry 2: 10 minutes — different officer
  30 * 60 * 1000,   // retry 3: 30 minutes — different officer again
];
```

Update `computeNextRetryAt()` to add the `task_failed` branch (insert after the `missing_contact_info` block):

```javascript
  if (reason === "task_failed") {
    const delayMs = TASK_FAILED_DELAYS_MS[currentRetryCount];
    if (delayMs === undefined) return null;
    return new Date(Date.now() + delayMs).toISOString();
  }
```

Update `getRetryStatus()` — `case_not_found` should NEVER return `needs_review` (auto-create handles it), and add `task_failed`:

```javascript
export function getRetryStatus(nextRetryCount, reason) {
  if (reason === "case_not_found") {
    return "pending"; // never needs_review — auto-create handles exhaustion
  }
  if (reason === "task_failed") {
    return nextRetryCount >= MAX_TASK_FAILED_RETRIES ? "needs_review" : "pending";
  }
  if (reason === "missing_contact_info") {
    return nextRetryCount >= MAX_MISSING_CONTACT_INFO_RETRIES ? "needs_review" : "pending";
  }
  return nextRetryCount >= MAX_RETRIES ? "needs_review" : "pending";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd vercel-webhook && node tests/lib/pending.test.mjs`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add vercel-webhook/lib/pending.js vercel-webhook/tests/lib/pending.test.mjs
git commit -m "feat: update case_not_found schedule (4 retries) and add task_failed reason"
```

---

### Task 2: Add Alternate Phone Format Search to IRS Logics

**Files:**
- Modify: `vercel-webhook/lib/irs-logics.js`
- Create: `vercel-webhook/tests/lib/irs-logics.test.mjs`

- [ ] **Step 1: Write the tests**

Create `vercel-webhook/tests/lib/irs-logics.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { phoneFormats, extractCaseId } from "../../lib/irs-logics.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("phoneFormats returns unique format variations for parenthesized number", () => {
  const formats = phoneFormats("(267)333-9583");
  assert.ok(formats.includes("2673339583"), "should include digits-only");
  assert.ok(formats.includes("267-333-9583"), "should include dashed");
  assert.ok(formats.includes("267.333.9583"), "should include dotted");
  assert.ok(formats.includes("+12673339583"), "should include E.164");
  // should NOT include the original (caller already tried it)
  assert.ok(!formats.includes("(267)333-9583"), "should exclude original");
});

run("phoneFormats returns unique format variations for dashed number", () => {
  const formats = phoneFormats("267-333-9583");
  assert.ok(formats.includes("2673339583"), "should include digits-only");
  assert.ok(formats.includes("(267)333-9583"), "should include parenthesized");
  assert.ok(formats.includes("267.333.9583"), "should include dotted");
  assert.ok(formats.includes("+12673339583"), "should include E.164");
  assert.ok(!formats.includes("267-333-9583"), "should exclude original");
});

run("phoneFormats handles 11-digit number with leading 1", () => {
  const formats = phoneFormats("12673339583");
  assert.ok(formats.includes("2673339583"), "should include 10-digit");
  assert.ok(formats.includes("(267)333-9583"), "should include parenthesized");
  assert.ok(formats.includes("+12673339583"), "should include E.164");
});

run("phoneFormats returns empty array for invalid phone", () => {
  assert.deepEqual(phoneFormats("123"), []);
  assert.deepEqual(phoneFormats(""), []);
  assert.deepEqual(phoneFormats(null), []);
  assert.deepEqual(phoneFormats(undefined), []);
});

run("extractCaseId prefers active cases with SaleDate", () => {
  const response = {
    Success: true,
    Data: [
      { CaseID: 100, CreatedDate: "2026-01-01", SaleDate: null },
      { CaseID: 200, CreatedDate: "2026-02-01", SaleDate: "2026-02-15" },
    ],
  };
  assert.equal(extractCaseId(response), 200);
});

run("extractCaseId returns null for empty response", () => {
  assert.equal(extractCaseId(null), null);
  assert.equal(extractCaseId({ Success: false }), null);
  assert.equal(extractCaseId({ Success: true, Data: [] }), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd vercel-webhook && node tests/lib/irs-logics.test.mjs`

Expected: FAIL — `phoneFormats` is not exported.

- [ ] **Step 3: Implement `phoneFormats()` and `findCaseByPhoneAltFormats()` in `lib/irs-logics.js`**

Add these functions after the existing `formatPhone()` function (after line 189):

```javascript
/**
 * Generate alternate phone format variations for IRS Logics search.
 * Returns an array of formats EXCLUDING the original.
 */
export function phoneFormats(raw) {
  if (!raw) return [];
  const digits = raw.replace(/\D/g, "");
  const d10 = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  if (d10.length !== 10) return [];

  const area = d10.slice(0, 3);
  const mid = d10.slice(3, 6);
  const last = d10.slice(6);

  const variations = [
    d10,                               // 2673339583
    `(${area})${mid}-${last}`,         // (267)333-9583
    `${area}-${mid}-${last}`,          // 267-333-9583
    `${area}.${mid}.${last}`,          // 267.333.9583
    `+1${d10}`,                        // +12673339583
  ];

  const original = raw.trim();
  return [...new Set(variations)].filter((v) => v !== original);
}

/**
 * Try IRS Logics FindCaseByPhone with multiple phone format variations.
 * Stops on first match. Returns { caseId, lookupMethod } or null values.
 */
export async function findCaseByPhoneAltFormats(phone) {
  const formats = phoneFormats(phone);
  for (const fmt of formats) {
    const result = await findCaseByPhone(fmt);
    const caseId = extractCaseId(result);
    if (caseId) {
      return { caseId, lookupMethod: "phone_alt", lookupResponse: result };
    }
  }
  return { caseId: null, lookupMethod: null, lookupResponse: null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd vercel-webhook && node tests/lib/irs-logics.test.mjs`

Expected: All PASS.

- [ ] **Step 5: Commit**

```bash
git add vercel-webhook/lib/irs-logics.js vercel-webhook/tests/lib/irs-logics.test.mjs
git commit -m "feat: add phoneFormats() and findCaseByPhoneAltFormats() for alternate phone search"
```

---

### Task 3: Add `findCaseExhaustive()` to IRS Logics

**Files:**
- Modify: `vercel-webhook/lib/irs-logics.js`
- Modify: `vercel-webhook/tests/lib/irs-logics.test.mjs`

- [ ] **Step 1: Write the test**

Add to `vercel-webhook/tests/lib/irs-logics.test.mjs` (these test the pure logic — async tests with mocks):

```javascript
async function runAsync(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await runAsync("findCaseExhaustive tries extra emails and phones", async () => {
  // We can't mock IRS Logics API in a unit test, so test phoneFormats integration
  const formats = phoneFormats("(555)123-4567");
  assert.ok(formats.length >= 3, "should generate at least 3 alt formats");
  // Verify no duplicates
  assert.equal(formats.length, new Set(formats).size, "should have no duplicates");
});
```

- [ ] **Step 2: Run test**

Run: `cd vercel-webhook && node tests/lib/irs-logics.test.mjs`

Expected: PASS (this tests the helper used by `findCaseExhaustive`).

- [ ] **Step 3: Implement `findCaseExhaustive()` in `lib/irs-logics.js`**

Add after `findCaseByPhoneAltFormats()`:

```javascript
/**
 * Exhaustive case search — tries email, phone, alt phone formats,
 * then any extra emails/phones provided by contact enrichment.
 * Stops on first match.
 */
export async function findCaseExhaustive(email, phone, extraEmails = [], extraPhones = []) {
  // 1. Standard email + phone lookup (already tried by caller in retry 1)
  const basic = await findCase(email, phone);
  if (basic.caseId) return basic;

  // 2. Alternate phone formats
  if (phone) {
    const altResult = await findCaseByPhoneAltFormats(phone);
    if (altResult.caseId) return altResult;
  }

  // 3. Extra emails from GHL enrichment
  for (const extraEmail of extraEmails) {
    if (extraEmail && extraEmail !== email) {
      const result = await findCaseByEmail(extraEmail);
      const caseId = extractCaseId(result);
      if (caseId) {
        return { caseId, lookupMethod: "email_enriched", lookupResponse: result };
      }
    }
  }

  // 4. Extra phones from GHL enrichment (with alt formats for each)
  for (const extraPhone of extraPhones) {
    if (extraPhone && extraPhone !== phone) {
      const result = await findCaseByPhone(extraPhone);
      const caseId = extractCaseId(result);
      if (caseId) {
        return { caseId, lookupMethod: "phone_enriched", lookupResponse: result };
      }
      // Also try alt formats for the extra phone
      const altResult = await findCaseByPhoneAltFormats(extraPhone);
      if (altResult.caseId) return altResult;
    }
  }

  return { caseId: null, lookupMethod: null, lookupResponse: null };
}
```

- [ ] **Step 4: Run all tests + build**

Run: `cd vercel-webhook && node tests/lib/irs-logics.test.mjs && npm run build`

Expected: All PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add vercel-webhook/lib/irs-logics.js vercel-webhook/tests/lib/irs-logics.test.mjs
git commit -m "feat: add findCaseExhaustive() — email, phone, alt formats, enriched contacts"
```

---

### Task 4: Add `enrichContactInfo()` to GHL lib

**Files:**
- Modify: `vercel-webhook/lib/ghl.js`
- Create: `vercel-webhook/tests/lib/ghl-enrichment.test.mjs`

- [ ] **Step 1: Write the tests**

Create `vercel-webhook/tests/lib/ghl-enrichment.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { enrichContactInfoWithProvider } from "../../lib/ghl.js";

async function run(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

await run("enrichContactInfoWithProvider returns emails and phones from GHL contact", async () => {
  const result = await enrichContactInfoWithProvider("jane@example.com", null, {
    restSearcher: async () => ({
      id: "abc123",
      email: "jane@example.com",
      phone: "+15551234567",
      additionalEmails: ["jane2@example.com"],
      additionalPhones: ["+15559876543"],
    }),
  });

  assert.ok(result.emails.includes("jane@example.com"));
  assert.ok(result.emails.includes("jane2@example.com"));
  assert.ok(result.phones.includes("+15551234567"));
  assert.ok(result.phones.includes("+15559876543"));
  assert.equal(result.firstName, undefined);
});

await run("enrichContactInfoWithProvider extracts name from contact", async () => {
  const result = await enrichContactInfoWithProvider(null, "(555)123-4567", {
    restSearcher: async () => ({
      id: "abc123",
      email: "test@test.com",
      phone: "+15551234567",
      firstName: "Jane",
      lastName: "Doe",
    }),
  });

  assert.equal(result.firstName, "Jane");
  assert.equal(result.lastName, "Doe");
  assert.ok(result.emails.includes("test@test.com"));
});

await run("enrichContactInfoWithProvider returns empty on no contact found", async () => {
  const result = await enrichContactInfoWithProvider("nobody@example.com", null, {
    restSearcher: async () => null,
  });

  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.phones, []);
});

await run("enrichContactInfoWithProvider handles REST errors gracefully", async () => {
  const result = await enrichContactInfoWithProvider("jane@example.com", null, {
    restSearcher: async () => { throw new Error("401"); },
  });

  assert.deepEqual(result.emails, []);
  assert.deepEqual(result.phones, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd vercel-webhook && node tests/lib/ghl-enrichment.test.mjs`

Expected: FAIL — `enrichContactInfoWithProvider` is not exported.

- [ ] **Step 3: Implement `enrichContactInfo()` in `lib/ghl.js`**

Add a new internal helper that does the REST search and returns the full contact record, then add the exported functions. Add after the existing `findGhlContactByNameRest()` function (after line 121):

```javascript
/**
 * Search GHL REST for a contact and return the full record (not just the ID).
 */
async function findGhlContactRecordRest(email, phone) {
  const locationId = process.env.GHL_LOCATION_ID;
  if (!locationId) return null;

  const query = email || phone;
  if (!query) return null;

  const url = `${GHL_BASE}/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(query)}&limit=1`;

  const res = await fetch(url, { headers: getGhlHeaders(), cache: "no-store" });
  if (!res.ok) return null;

  const data = await res.json();
  return data.contacts?.[0] || null;
}

function collectContactInfo(contact) {
  if (!contact) return { emails: [], phones: [], firstName: undefined, lastName: undefined };

  const emails = [];
  const phones = [];

  if (contact.email) emails.push(contact.email);
  if (contact.additionalEmails) {
    for (const e of contact.additionalEmails) {
      if (e && !emails.includes(e)) emails.push(e);
    }
  }

  if (contact.phone) phones.push(contact.phone);
  if (contact.additionalPhones) {
    for (const p of contact.additionalPhones) {
      if (p && !phones.includes(p)) phones.push(p);
    }
  }

  return {
    emails,
    phones,
    firstName: contact.firstName || contact.first_name || undefined,
    lastName: contact.lastName || contact.last_name || undefined,
  };
}

/**
 * Dependency-injectable version for testing.
 */
export async function enrichContactInfoWithProvider(email, phone, { restSearcher = findGhlContactRecordRest } = {}) {
  try {
    const contact = await restSearcher(email, phone);
    return collectContactInfo(contact);
  } catch (error) {
    console.error("GHL contact enrichment failed:", error.message);
    return { emails: [], phones: [], firstName: undefined, lastName: undefined };
  }
}

/**
 * Query GHL for the full contact record and extract all emails/phones.
 * Used by the cron on retry 2+ to discover alternate contact info.
 */
export async function enrichContactInfo(email, phone) {
  return enrichContactInfoWithProvider(email, phone);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd vercel-webhook && node tests/lib/ghl-enrichment.test.mjs`

Expected: All PASS.

- [ ] **Step 5: Run all existing tests + build**

Run: `cd vercel-webhook && node tests/lib/ghl.test.mjs && npm run build`

Expected: All PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add vercel-webhook/lib/ghl.js vercel-webhook/tests/lib/ghl-enrichment.test.mjs
git commit -m "feat: add enrichContactInfo() for GHL contact info enrichment"
```

---

### Task 5: Add `findContactInfoViaAgent()` to Agent lib

**Files:**
- Modify: `vercel-webhook/lib/agent.js`

- [ ] **Step 1: Add `findContactInfoViaAgent()` function**

Add after the existing `fetchAppointmentViaAgent()` function (after line 338) in `vercel-webhook/lib/agent.js`:

```javascript
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
```

- [ ] **Step 2: Run build to verify syntax**

Run: `cd vercel-webhook && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add vercel-webhook/lib/agent.js
git commit -m "feat: add findContactInfoViaAgent() for AI-assisted contact info discovery"
```

---

### Task 6: Rewrite Cron Case-Not-Found Handler with Escalating Search

**Files:**
- Modify: `vercel-webhook/app/api/cron/process-pending/route.js`

This is the core change. The cron's `processPendingQueue()` gets an escalating search chain tied to `retry_count`.

- [ ] **Step 1: Update imports**

In `vercel-webhook/app/api/cron/process-pending/route.js`, replace the imports (lines 1–21):

```javascript
// vercel-webhook/app/api/cron/process-pending/route.js
import { NextResponse } from "next/server";
import { fetchAppointmentFromGhl, findGhlContactByName, enrichContactInfo } from "@/lib/ghl";
import { fetchAppointmentViaAgent, findContactInfoViaAgent } from "@/lib/agent";
import {
  createTask,
  createCase,
  findCase,
  findCaseExhaustive,
  getCaseOfficer,
  parseGhlDate,
} from "@/lib/irs-logics";
import { getNextOfficer, insertTaskLog } from "@/lib/supabase";
import { buildTaskDetails } from "@/lib/webhook";
import {
  getPendingTasks,
  completePendingTask,
  incrementRetry,
  updatePendingTaskContactInfo,
  MAX_CASE_NOT_FOUND_RETRIES,
  MAX_TASK_FAILED_RETRIES,
} from "@/lib/pending";
import { isDuplicateTask } from "@/lib/dedup";
import {
  fetchRecentGhlAppointments,
  getRecentTaskLogs,
  filterNewAppointments,
} from "@/lib/safety-net";
```

- [ ] **Step 2: Replace the `processPendingQueue` function**

Replace the entire `processPendingQueue` function (from `async function processPendingQueue()` through its closing brace before `async function safetyNetSweep()`) with:

```javascript
async function processPendingQueue() {
  const pending = await getPendingTasks();
  const results = { processed: 0, completed: 0, retried: 0, failed: 0, autoCreated: 0 };

  for (const row of pending) {
    results.processed++;

    try {
      // --- TASK_FAILED: skip case search, retry task creation with officer rotation ---
      if (row.reason === "task_failed" && row.case_id) {
        await processTaskFailed(row, results);
        continue;
      }

      // --- MISSING_CONTACT_INFO: recover email/phone by name ---
      if (row.reason === "missing_contact_info" && !row.email && !row.phone) {
        const contactName = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
        if (contactName) {
          console.log(`Pending #${row.id}: attempting name-based contact recovery for "${contactName}"`);
          const recovered = await findGhlContactByName(contactName, row.first_name, row.last_name);
          if (recovered?.email || recovered?.phone) {
            console.log(`Pending #${row.id}: recovery succeeded — email=${recovered.email}, phone=${recovered.phone}`);
            row.email = recovered.email || row.email;
            row.phone = recovered.phone || row.phone;
            await updatePendingTaskContactInfo(row.id, recovered.email, recovered.phone);
          } else {
            console.log(`Pending #${row.id}: name recovery failed`);
            await incrementRetry(row.id, row.retry_count, "Name-based contact recovery failed", row.reason);
            results.retried++;
            continue;
          }
        } else {
          await incrementRetry(row.id, row.retry_count, "No name available for recovery", row.reason);
          results.retried++;
          continue;
        }
      }

      // --- APPOINTMENT DATA RECOVERY ---
      const ghlData = await fetchAppointmentFromGhl(row.email, row.phone);

      if (!ghlData.appointmentStart) {
        console.log(`Pending #${row.id}: GHL API failed — trying AI agent`);
        const agentData = await fetchAppointmentViaAgent(
          row.email, row.phone,
          [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
          null
        );
        if (agentData.appointmentStart) Object.assign(ghlData, agentData);
      }

      // Allow case_not_found entries to proceed without appointment data —
      // auto-create will use a fallback DueDate
      const isAutoCreateReady =
        row.reason === "case_not_found" &&
        !row.case_id &&
        row.retry_count + 1 >= MAX_CASE_NOT_FOUND_RETRIES;

      if (!ghlData.appointmentStart && !isAutoCreateReady) {
        await incrementRetry(row.id, row.retry_count, "GHL API + Agent both returned no appointment data", row.reason);
        results.retried++;
        continue;
      }

      // --- ESCALATING CASE SEARCH ---
      let caseId = row.case_id;
      let lookupMethod = row.lookup_method;
      let assignedOfficer = null;
      let assignedMethod = null;

      if (!caseId) {
        caseId = await escalatingCaseSearch(row, results);
        if (caseId && typeof caseId === "object") {
          // escalatingCaseSearch returned { caseId, lookupMethod, officer, method }
          lookupMethod = caseId.lookupMethod;
          assignedOfficer = caseId.officer;
          assignedMethod = caseId.method;
          caseId = caseId.caseId;
        } else if (caseId) {
          lookupMethod = "escalated";
        }
      }

      // escalatingCaseSearch returns null only if it already called incrementRetry
      if (!caseId) continue;

      // --- DEDUP ---
      const parsedStart = parseGhlDate(ghlData.appointmentStart) || ghlData.appointmentStart;
      if (await isDuplicateTask(caseId, parsedStart)) {
        await completePendingTask(row.id);
        results.completed++;
        console.log(`Pending #${row.id}: duplicate task exists, marking completed`);
        continue;
      }

      // --- BUILD & CREATE TASK ---
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

      let officer, assignmentMethod;
      if (assignedOfficer) {
        officer = assignedOfficer;
        assignmentMethod = assignedMethod;
      } else {
        const caseOfficer = await getCaseOfficer(caseId);
        if (caseOfficer) {
          officer = caseOfficer;
          assignmentMethod = "case_officer";
        } else {
          const assignment = await getNextOfficer();
          officer = assignment.officer;
          assignmentMethod = "round_robin";
        }
      }

      const taskDetails = buildTaskDetails(normalized);

      let comments = taskDetails.comments || "";
      if (assignmentMethod === "auto_created") {
        comments = `[Auto-Created Case] ${comments}`.trim();
      }

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
        ...(comments ? { Comments: comments } : {}),
      };

      const taskResult = await createTask(taskPayload);

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
        await incrementRetry(row.id, row.retry_count, taskResult.errorMessage, row.reason);
        results.failed++;
      }
    } catch (error) {
      console.error(`Pending #${row.id} error:`, error.message);
      await incrementRetry(row.id, row.retry_count, error.message, row.reason);
      results.failed++;
    }
  }

  return results;
}
```

- [ ] **Step 3: Add the `escalatingCaseSearch` helper**

Add this function BEFORE `processPendingQueue()` (after the `isAuthorized` function):

```javascript
/**
 * Escalating case search tied to retry_count:
 *   retry 0 (retry 1): basic findCase(email, phone)
 *   retry 1 (retry 2): + alt phone formats + GHL contact enrichment
 *   retry 2 (retry 3): + AI agent fuzzy match
 *   retry 3 (retry 4): auto-create the case
 *
 * Returns { caseId, lookupMethod, officer?, method? } or null (if retried/incremented).
 */
async function escalatingCaseSearch(row, results) {
  const retryNum = row.retry_count; // 0-indexed: 0 = first cron run

  // --- RETRY 1: basic email + phone ---
  const basic = await findCase(row.email, row.phone);
  if (basic.caseId) {
    return { caseId: basic.caseId, lookupMethod: basic.lookupMethod };
  }

  // --- RETRY 2+: alt phone formats + GHL enrichment ---
  if (retryNum >= 1) {
    let extraEmails = [];
    let extraPhones = [];

    // Enrich contact info from GHL
    console.log(`Pending #${row.id}: retry ${retryNum + 1} — enriching contact info from GHL`);
    const enriched = await enrichContactInfo(row.email, row.phone);
    extraEmails = enriched.emails || [];
    extraPhones = enriched.phones || [];

    // Persist any newly found contact info
    if (enriched.emails?.length || enriched.phones?.length) {
      const newEmail = enriched.emails?.find((e) => e && e !== row.email);
      const newPhone = enriched.phones?.find((p) => p && p !== row.phone);
      if (newEmail || newPhone) {
        await updatePendingTaskContactInfo(row.id, newEmail || row.email, newPhone || row.phone);
        if (newEmail) row.email = newEmail;
        if (newPhone) row.phone = newPhone;
      }
    }

    const exhaustive = await findCaseExhaustive(row.email, row.phone, extraEmails, extraPhones);
    if (exhaustive.caseId) {
      return { caseId: exhaustive.caseId, lookupMethod: exhaustive.lookupMethod };
    }
  }

  // --- RETRY 3+: AI agent fuzzy match ---
  if (retryNum >= 2) {
    console.log(`Pending #${row.id}: retry ${retryNum + 1} — trying AI agent for contact info`);
    const agentInfo = await findContactInfoViaAgent(
      row.email, row.phone, row.first_name, row.last_name
    );

    if (agentInfo.emails?.length || agentInfo.phones?.length) {
      const agentExhaustive = await findCaseExhaustive(
        row.email, row.phone, agentInfo.emails, agentInfo.phones
      );
      if (agentExhaustive.caseId) {
        return { caseId: agentExhaustive.caseId, lookupMethod: agentExhaustive.lookupMethod };
      }
    }
  }

  // --- RETRY 4: auto-create ---
  if (row.reason === "case_not_found" && retryNum + 1 >= MAX_CASE_NOT_FOUND_RETRIES) {
    console.log(`Pending #${row.id}: all searches exhausted, auto-creating case for ${row.email || row.phone}`);
    const assignment = await getNextOfficer();
    const officer = assignment.officer;

    const createResult = await createCase({
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      officerName: officer.name,
    });

    if (!createResult.ok || !createResult.caseId) {
      // Auto-create failed — DON'T give up. Retry with a different officer next time.
      await incrementRetry(row.id, row.retry_count,
        `Auto-create case failed: ${createResult.errorMessage}`, row.reason);
      results.failed++;
      return null;
    }

    results.autoCreated++;
    console.log(`Pending #${row.id}: case auto-created with CaseID ${createResult.caseId}, officer ${officer.name}`);
    return {
      caseId: createResult.caseId,
      lookupMethod: "auto_created",
      officer,
      method: "auto_created",
    };
  }

  // Not yet exhausted retries — increment and try again later
  await incrementRetry(row.id, row.retry_count, "Case still not found in IRS Logics", row.reason);
  results.retried++;
  return null;
}
```

- [ ] **Step 4: Add the `processTaskFailed` helper**

Add this function right after `escalatingCaseSearch`:

```javascript
/**
 * Handle task_failed rows: retry task creation, rotating officers on repeated failures.
 */
async function processTaskFailed(row, results) {
  const caseId = row.case_id;

  // Get appointment data
  const ghlData = await fetchAppointmentFromGhl(row.email, row.phone);
  if (!ghlData.appointmentStart) {
    const agentData = await fetchAppointmentViaAgent(
      row.email, row.phone,
      [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
      null
    );
    if (agentData.appointmentStart) Object.assign(ghlData, agentData);
  }

  // Dedup check
  const parsedStart = parseGhlDate(ghlData.appointmentStart) || ghlData.appointmentStart;
  if (parsedStart && await isDuplicateTask(caseId, parsedStart)) {
    await completePendingTask(row.id);
    results.completed++;
    console.log(`Pending #${row.id}: duplicate task already exists, marking completed`);
    return;
  }

  // Officer selection: retry 0 = case officer or same round-robin, retry 1+ = rotate
  let officer, assignmentMethod;
  const caseOfficer = await getCaseOfficer(caseId);

  if (row.retry_count === 0 && caseOfficer) {
    officer = caseOfficer;
    assignmentMethod = "case_officer";
  } else {
    // Rotate to a different officer on retries
    const assignment = await getNextOfficer();
    officer = assignment.officer;
    assignmentMethod = "round_robin";
  }

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
    ...(taskDetails.comments ? { Comments: `[Retry] ${taskDetails.comments}` } : {}),
  };

  const taskResult = await createTask(taskPayload);

  await insertTaskLog({
    ...normalized,
    caseId,
    lookupMethod: row.lookup_method,
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
    console.log(`Pending #${row.id}: task_failed retry succeeded (case ${caseId}, officer ${officer.name})`);
  } else {
    console.log(`Pending #${row.id}: task_failed retry failed again — officer ${officer.name}: ${taskResult.errorMessage}`);
    await incrementRetry(row.id, row.retry_count, taskResult.errorMessage, "task_failed");
    results.failed++;
  }
}
```

- [ ] **Step 5: Run build**

Run: `cd vercel-webhook && npm run build`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add vercel-webhook/app/api/cron/process-pending/route.js
git commit -m "feat: rewrite cron with escalating case search and task_failed recovery"
```

---

### Task 7: Queue `task_failed` in Webhook Handler

**Files:**
- Modify: `vercel-webhook/app/api/ghl-webhook/route.js`

- [ ] **Step 1: Add `buildPendingEntry` and `insertPendingTask` usage for task_failed**

In `vercel-webhook/app/api/ghl-webhook/route.js`, find the block where `taskResult.ok` is false (lines 248–272). Replace it with:

```javascript
    if (!taskResult.ok) {
      // Queue to pending for retry instead of dead-ending
      const pendingEntry = buildPendingEntry(normalized, {
        caseId,
        lookupMethod,
        reason: "task_failed",
      });
      // Persist the officer info so we know who failed
      pendingEntry.error_message = taskResult.errorMessage;

      try {
        await insertPendingTask(pendingEntry);
        console.log(`Task creation failed — queued for retry (case ${caseId}, officer ${officer.name}): ${taskResult.errorMessage}`);
      } catch (pendingError) {
        console.error("Failed to queue task_failed to pending:", pendingError.message);
      }

      await safeInsertTaskLog({
        ...normalized,
        caseId,
        lookupMethod,
        taskId,
        taskSubject: taskDetails.subject,
        officerName: officer.name,
        officerUserId: officer.userId,
        assignmentMethod,
        appointmentStart: taskDetails.dueDate,
        appointmentEnd: taskDetails.endDate,
        status: "task_failed",
        errorMessage: taskResult.errorMessage,
      });

      return NextResponse.json({
        success: true,
        queued: true,
        caseId,
        message: `Task creation failed — queued for retry: ${taskResult.errorMessage}`,
      });
    }
```

- [ ] **Step 2: Run build**

Run: `cd vercel-webhook && npm run build`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add vercel-webhook/app/api/ghl-webhook/route.js
git commit -m "feat: queue task_failed to pending for retry instead of dead-ending"
```

---

### Task 8: Run All Tests & Final Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run all unit tests**

Run each test file:

```bash
cd vercel-webhook
node tests/lib/pending.test.mjs
node tests/lib/irs-logics.test.mjs
node tests/lib/ghl-enrichment.test.mjs
node tests/lib/webhook.test.mjs
node tests/lib/ghl.test.mjs
node tests/lib/ghl-mcp.test.mjs
```

Expected: All PASS across all test files.

- [ ] **Step 2: Run full build**

Run: `cd vercel-webhook && npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 3: Verify the npm test script still works**

Run: `cd vercel-webhook && npm test`

Expected: PASS (this runs `webhook.test.mjs` by default — the package.json test script).

- [ ] **Step 4: Commit any fixes if needed, then final checkpoint commit**

```bash
git add -A
git status
# If there are any uncommitted changes:
git commit -m "chore: final verification — all tests pass, build clean"
```

---

### Task 9: Update CLAUDE.md with New Architecture

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Pending Queue & Cron System section**

Find the `### Pending Queue & Cron System` section in `CLAUDE.md` and replace it with updated documentation reflecting:

- `MAX_CASE_NOT_FOUND_RETRIES` is now 4 (was 2)
- New retry schedule: 5 min → 10 min → 30 min → auto-create
- Escalating search chain: basic → alt phone + GHL enrichment → AI agent → auto-create
- `case_not_found` never goes to `needs_review` — always auto-resolves
- New `task_failed` reason with officer rotation (3 retries)
- New functions: `findCaseExhaustive()`, `enrichContactInfo()`, `findContactInfoViaAgent()`, `phoneFormats()`, `findCaseByPhoneAltFormats()`

- [ ] **Step 2: Update the Key Files section**

Add entries for the new exports in `lib/irs-logics.js`, `lib/ghl.js`, and `lib/agent.js`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with bulletproof case resolution architecture"
```
