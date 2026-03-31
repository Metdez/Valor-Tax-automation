import { supabaseRest } from "./supabase.js";

export function buildDedupKey(caseId, appointmentStart) {
  if (!caseId || !appointmentStart) return null;
  return `${caseId}|${appointmentStart}`;
}

export async function isDuplicateTask(caseId, appointmentStart) {
  if (!caseId || !appointmentStart) return false;

  const rows = await supabaseRest(
    `task_logs?case_id=eq.${encodeURIComponent(caseId)}&appointment_start=eq.${encodeURIComponent(appointmentStart)}&status=eq.success&select=id&limit=1`
  );

  return Array.isArray(rows) && rows.length > 0;
}
