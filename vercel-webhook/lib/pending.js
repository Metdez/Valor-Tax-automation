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

export function computeNextRetryAt(reason, currentRetryCount) {
  if (reason === "case_not_found") {
    const delayMs = CASE_NOT_FOUND_DELAYS_MS[currentRetryCount];
    if (delayMs === undefined) return null;
    return new Date(Date.now() + delayMs).toISOString();
  }
  if (reason === "missing_contact_info") {
    const delayMs = MISSING_CONTACT_INFO_DELAYS_MS[currentRetryCount];
    if (delayMs === undefined) return null;
    return new Date(Date.now() + delayMs).toISOString();
  }
  if (reason === "task_failed") {
    const delayMs = TASK_FAILED_DELAYS_MS[currentRetryCount];
    if (delayMs === undefined) return null;
    return new Date(Date.now() + delayMs).toISOString();
  }
  return null;
}

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

export function buildPendingTasksQuery(limit = 20) {
  const now = new Date().toISOString();
  return `pending_tasks?status=in.(pending,processing)&or=(next_retry_at.is.null,next_retry_at.lte.${now})&order=created_at.asc&limit=${limit}`;
}

export function buildPendingEntry(normalized, { caseId, lookupMethod, reason }) {
  const entry = {
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
    reason: reason || null,
  };

  const nextRetryAt = computeNextRetryAt(reason, 0);
  if (nextRetryAt) entry.next_retry_at = nextRetryAt;

  return entry;
}

export async function insertPendingTask(entry) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("pending_tasks").insert(entry);
  if (error) throw new Error(`pending_tasks insert failed: ${error.message}`);
}

export async function getPendingTasks() {
  const rows = await supabaseRest(buildPendingTasksQuery());
  return rows || [];
}

export async function completePendingTask(id) {
  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body: { status: "completed", updated_at: new Date().toISOString() },
    headers: { Prefer: "return=minimal" },
  });
}

export async function incrementRetry(id, currentRetryCount, errorMessage, reason) {
  const newCount = currentRetryCount + 1;
  const newStatus = getRetryStatus(newCount, reason);

  const body = {
    retry_count: newCount,
    status: newStatus,
    error_message: errorMessage || null,
    updated_at: new Date().toISOString(),
  };

  const nextRetryAt = computeNextRetryAt(reason, newCount);
  if (nextRetryAt) {
    body.next_retry_at = nextRetryAt;
  } else if (reason === "case_not_found") {
    body.next_retry_at = null;
  }

  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body,
    headers: { Prefer: "return=minimal" },
  });
}

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

export async function updatePendingTaskContactInfo(id, email, phone) {
  const body = { updated_at: new Date().toISOString() };
  if (email) body.email = email;
  if (phone) body.phone = phone;

  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body,
    headers: { Prefer: "return=minimal" },
  });
}

/**
 * Transition a pending row to missing_appointment after auto-creating its case
 * (or after task_failed recovery loses its appointment data). Keeps the row in
 * the retry loop until real appointment data is found — we never create tasks
 * with fallback times.
 */
export async function transitionToMissingAppointment(id, { caseId, lookupMethod } = {}) {
  const body = {
    reason: "missing_appointment",
    retry_count: 0,
    status: "pending",
    next_retry_at: null, // missing_appointment retries every cron cycle
    error_message: null,
    updated_at: new Date().toISOString(),
  };
  if (caseId !== undefined) body.case_id = caseId;
  if (lookupMethod !== undefined) body.lookup_method = lookupMethod;

  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body,
    headers: { Prefer: "return=minimal" },
  });
}
