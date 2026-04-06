import { supabaseRest } from "@/lib/supabase";

function mapTaskLog(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    caseId: row.case_id,
    lookupMethod: row.lookup_method,
    taskId: row.task_id,
    taskSubject: row.task_subject,
    officerName: row.officer_name,
    officerUserId: row.officer_user_id,
    assignmentMethod: row.assignment_method,
    appointmentTitle: row.appointment_title,
    appointmentStart: row.appointment_start,
    appointmentEnd: row.appointment_end,
    calendarName: row.calendar_name,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export async function getErrorPage({ page = 1, limit = 20, category = "" } = {}) {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, Math.min(limit, 100));
  const offset = (safePage - 1) * safeLimit;

  const filters = ["select=*", "order=created_at.desc"];
  if (category) {
    filters.push(`status=eq.${encodeURIComponent(category)}`);
  } else {
    filters.push("status=neq.success");
  }

  const { data, count } = await supabaseRest(`task_logs?${filters.join("&")}`, {
    count: true,
    headers: { Prefer: "count=exact", Range: `${offset}-${offset + safeLimit - 1}` },
  });

  return {
    logs: (data || []).map(mapTaskLog),
    total: count || 0,
    page: safePage,
    totalPages: Math.max(1, Math.ceil((count || 0) / safeLimit)),
  };
}

export async function getErrorTrend(days = 14) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const data = await supabaseRest(
    `task_logs?status=neq.success&created_at=gte.${since.toISOString()}&select=created_at&order=created_at.asc`
  );

  const counts = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  for (const row of data || []) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    if (counts[day] !== undefined) counts[day]++;
  }

  return Object.entries(counts).map(([date, count]) => ({ date, count }));
}

export async function getErrorStats() {
  const categories = ["case_not_found", "task_failed", "error", "pending_appointment"];

  const [totalResult, ...categoryResults] = await Promise.all([
    supabaseRest("task_logs?status=neq.success&select=id", {
      count: true,
      headers: { Prefer: "count=exact", Range: "0-0" },
    }),
    ...categories.map((cat) =>
      supabaseRest(`task_logs?status=eq.${cat}&select=id`, {
        count: true,
        headers: { Prefer: "count=exact", Range: "0-0" },
      })
    ),
  ]);

  return {
    total: totalResult.count || 0,
    caseNotFound: categoryResults[0].count || 0,
    taskFailed: categoryResults[1].count || 0,
    error: categoryResults[2].count || 0,
    pendingAppointment: categoryResults[3].count || 0,
  };
}
