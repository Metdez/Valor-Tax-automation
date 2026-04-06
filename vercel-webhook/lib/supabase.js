import { createClient } from "@supabase/supabase-js";

export function getSupabaseAdmin() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    }
  );
}

// Direct REST helper — bypasses Supabase JS client caching issues on Vercel
export async function supabaseRest(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const method = options.method || "GET";
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (options.count) {
    const contentRange = res.headers.get("content-range");
    const count = contentRange ? parseInt(contentRange.split("/")[1], 10) : 0;
    const data = await res.json();
    return { data, count };
  }

  const text = await res.text();
  if (!text) return null;
  return JSON.parse(text);
}

// Proxy for backward compat
export const supabase = new Proxy(
  {},
  {
    get(_, prop) {
      const client = getSupabaseAdmin();
      const value = client[prop];
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
  }
);

import { getOfficers } from "./officers.js";

export async function peekNextOfficer() {
  const officers = await getOfficers();
  const rows = await supabaseRest("round_robin?id=eq.1&select=current_index");
  const currentIndex = rows[0]?.current_index ?? 0;
  return { currentIndex, nextOfficer: officers[currentIndex % officers.length], officers };
}

export async function getNextOfficer() {
  const { currentIndex, nextOfficer, officers } = await peekNextOfficer();
  const nextIndex = (currentIndex + 1) % officers.length;

  await supabaseRest("round_robin?id=eq.1", {
    method: "PATCH",
    body: { current_index: nextIndex },
    headers: { Prefer: "return=minimal" },
  });

  return { currentIndex, nextIndex, officer: nextOfficer };
}

export async function insertTaskLog(entry) {
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("task_logs").insert({
    first_name: entry.firstName || null,
    last_name: entry.lastName || null,
    email: entry.email || null,
    phone: entry.phone || null,
    case_id: entry.caseId ?? null,
    lookup_method: entry.lookupMethod || null,
    task_id: entry.taskId ?? null,
    task_subject: entry.taskSubject || null,
    officer_name: entry.officerName || null,
    officer_user_id: entry.officerUserId ?? null,
    assignment_method: entry.assignmentMethod || null,
    appointment_title: entry.appointmentTitle || null,
    appointment_start: entry.appointmentStart || null,
    appointment_end: entry.appointmentEnd || null,
    calendar_name: entry.calendarName || null,
    status: entry.status || "success",
    error_message: entry.errorMessage || null,
    ai_summary: entry.aiSummary || null,
    ai_transcript: entry.aiTranscript || null,
  });
  if (error) throw new Error(`task_logs insert failed: ${error.message}`);
}
