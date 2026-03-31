import { supabaseRest, getSupabaseAdmin } from "./supabase.js";

const MAX_RETRIES = 6;

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

export async function insertPendingTask(entry) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("pending_tasks").insert(entry);
  if (error) throw new Error(`pending_tasks insert failed: ${error.message}`);
}

export async function getPendingTasks() {
  const rows = await supabaseRest(
    `pending_tasks?status=in.(pending,processing)&retry_count=lt.${MAX_RETRIES}&order=created_at.asc&limit=20`
  );
  return rows || [];
}

export async function completePendingTask(id) {
  await supabaseRest(`pending_tasks?id=eq.${id}`, {
    method: "PATCH",
    body: { status: "completed", updated_at: new Date().toISOString() },
    headers: { Prefer: "return=minimal" },
  });
}

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
