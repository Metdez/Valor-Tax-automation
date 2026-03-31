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

function isAuthorized(request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) return true;
  if (process.env.NODE_ENV === "development") return true;
  return false;
}

async function processPendingQueue() {
  const pending = await getPendingTasks();
  const results = { processed: 0, completed: 0, retried: 0, failed: 0 };

  for (const row of pending) {
    results.processed++;

    try {
      const ghlData = await fetchAppointmentFromGhl(row.email, row.phone);

      if (!ghlData.appointmentStart) {
        await incrementRetry(row.id, row.retry_count, "GHL API returned no appointment data");
        results.retried++;
        continue;
      }

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

      const parsedStart = parseGhlDate(ghlData.appointmentStart) || ghlData.appointmentStart;
      if (await isDuplicateTask(caseId, parsedStart)) {
        await completePendingTask(row.id);
        results.completed++;
        console.log(`Pending #${row.id}: duplicate task exists, marking completed`);
        continue;
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
        const lookup = await findCase(appt.contactEmail, appt.contactPhone);
        if (!lookup.caseId) {
          results.skipped++;
          continue;
        }

        const parsedStart = parseGhlDate(appt.startTime) || appt.startTime;
        if (await isDuplicateTask(lookup.caseId, parsedStart)) {
          results.skipped++;
          continue;
        }

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
