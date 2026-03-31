import { getOfficers } from "./officers.js";
import { findCase, formatPhone, getCaseInfo } from "./irs-logics.js";
import { supabaseRest, peekNextOfficer } from "./supabase.js";
import { getPendingCount, getNeedsReviewCount } from "./pending.js";

const DEFAULT_PAGE_SIZE = 20;

function getStartOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function getStartOfWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 6 : day - 1;
  now.setDate(now.getDate() - diff);
  now.setHours(0, 0, 0, 0);
  return now.toISOString();
}

function getEndExclusive(dateValue) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function buildContactName(row) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "-";
}

function mapTaskLog(row) {
  return {
    ...row,
    contactName: buildContactName(row),
  };
}

export async function getDashboardStats() {
  const officers = await getOfficers();
  const todayStart = getStartOfToday();
  const weekStart = getStartOfWeek();

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

  const totalTasks = totalResponse.count || 0;
  const tasksToday = todayResponse.count || 0;
  const tasksThisWeek = weekResponse.count || 0;
  const successCount = successResponse.count || 0;
  const successRate = totalTasks > 0 ? Number(((successCount / totalTasks) * 100).toFixed(1)) : 0;

  const officerCounts = new Map();
  for (const officer of officers) {
    officerCounts.set(officer.name, {
      name: officer.name,
      userId: officer.userId,
      phone: officer.phone,
      totalTasks: 0,
      tasksThisWeek: 0,
    });
  }

  for (const row of officerLogs || []) {
    if (!row.officer_name) continue;

    const existing =
      officerCounts.get(row.officer_name) ||
      {
        name: row.officer_name,
        userId: row.officer_user_id ?? officers.find((o) => o.name === row.officer_name)?.userId ?? null,
        phone: officers.find((o) => o.name === row.officer_name)?.phone ?? "",
        totalTasks: 0,
        tasksThisWeek: 0,
      };

    existing.totalTasks += 1;
    if (row.created_at >= weekStart) {
      existing.tasksThisWeek += 1;
    }

    officerCounts.set(row.officer_name, existing);
  }

  return {
    totalTasks,
    tasksToday,
    tasksThisWeek,
    successRate,
    roundRobinIndex: roundRobinPreview.currentIndex,
    nextOfficer: roundRobinPreview.nextOfficer.name,
    recentActivity: (recentLogs || []).map(mapTaskLog),
    officerStats: Array.from(officerCounts.values()),
    officers,
    pendingCount,
    needsReviewCount,
  };
}

export async function getActivityPage({
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
  officer = "",
  status = "",
  from = "",
  to = "",
} = {}) {
  const safePage = Number.isFinite(page) ? Math.max(1, page) : 1;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(limit, 100)) : DEFAULT_PAGE_SIZE;
  const offset = (safePage - 1) * safeLimit;

  const filters = [];
  filters.push("select=*");
  filters.push("order=created_at.desc");
  if (officer) filters.push(`officer_name=eq.${encodeURIComponent(officer)}`);
  if (status) filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (from) filters.push(`created_at=gte.${encodeURIComponent(new Date(from).toISOString())}`);
  if (to) filters.push(`created_at=lt.${encodeURIComponent(getEndExclusive(to))}`);

  const { data, count } = await supabaseRest(`task_logs?${filters.join("&")}`, {
    count: true,
    headers: {
      Prefer: "count=exact",
      Range: `${offset}-${offset + safeLimit - 1}`,
    },
  });

  return {
    logs: (data || []).map(mapTaskLog),
    total: count || 0,
    page: safePage,
    totalPages: Math.max(1, Math.ceil((count || 0) / safeLimit)),
  };
}

export async function getCaseHistory(caseId) {
  const data = await supabaseRest(
    `task_logs?case_id=eq.${encodeURIComponent(caseId)}&select=*&order=created_at.desc`
  );
  return (data || []).map(mapTaskLog);
}

export async function lookupCase({ email, phone }) {
  const normalizedPhone = phone ? formatPhone(phone) : undefined;
  const lookup = await findCase(email, normalizedPhone);

  if (!lookup.caseId) {
    return null;
  }

  const [caseDetails, taskHistory] = await Promise.all([
    getCaseInfo(lookup.caseId),
    getCaseHistory(lookup.caseId),
  ]);

  return {
    lookupMethod: lookup.lookupMethod,
    case: caseDetails,
    taskHistory,
  };
}
