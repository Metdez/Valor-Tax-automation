import assert from "node:assert/strict";
import {
  buildPendingEntry,
  buildPendingTasksQuery,
  computeNextRetryAt,
  getRetryStatus,
  MAX_CASE_NOT_FOUND_RETRIES,
  MAX_MISSING_CONTACT_INFO_RETRIES,
  MAX_TASK_FAILED_RETRIES,
} from "../../lib/pending.js";

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

  assert.equal(entry.first_name, "Jane");
  assert.equal(entry.last_name, "Doe");
  assert.equal(entry.email, "jane@example.com");
  assert.equal(entry.case_id, 12345);
  assert.equal(entry.lookup_method, "email");
  assert.equal(entry.status, "pending");
  assert.equal(entry.retry_count, 0);
  assert.equal(entry.reason, null);
  assert.equal(entry.next_retry_at, undefined);
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
  assert.equal(entry.reason, null);
});

run("buildPendingEntry with reason=case_not_found sets reason and next_retry_at", () => {
  const before = Date.now();
  const entry = buildPendingEntry(
    { firstName: "Test", email: "test@example.com" },
    { caseId: null, lookupMethod: "email", reason: "case_not_found" }
  );

  assert.equal(entry.reason, "case_not_found");
  assert.equal(entry.case_id, null);
  assert.ok(entry.next_retry_at, "should have next_retry_at");
  const retryAt = new Date(entry.next_retry_at).getTime();
  assert.ok(retryAt >= before + 5 * 60 * 1000 - 1000, "next_retry_at should be ~5 min from now");
  assert.ok(retryAt <= before + 5 * 60 * 1000 + 2000, "next_retry_at should be ~5 min from now");
});

run("buildPendingTasksQuery excludes needs_review rows (no infinite loop)", () => {
  const query = buildPendingTasksQuery();

  assert.match(query, /status=in\.\(pending,processing\)/);
  assert.doesNotMatch(query, /needs_review/);
  assert.doesNotMatch(query, /retry_count=lt\./);
});

run("getRetryStatus keeps rows pending until the extended retry window is exhausted", () => {
  assert.equal(getRetryStatus(6), "pending");
  assert.equal(getRetryStatus(287), "pending");
  assert.equal(getRetryStatus(288), "needs_review");
});

run("getRetryStatus with reason=case_not_found never returns needs_review", () => {
  assert.equal(getRetryStatus(0, "case_not_found"), "pending");
  assert.equal(getRetryStatus(1, "case_not_found"), "pending");
  assert.equal(getRetryStatus(2, "case_not_found"), "pending");
  assert.equal(getRetryStatus(3, "case_not_found"), "pending");
  assert.equal(getRetryStatus(4, "case_not_found"), "pending");
  assert.equal(getRetryStatus(10, "case_not_found"), "pending");
});

run("getRetryStatus backward compat — no reason uses MAX_RETRIES=288", () => {
  assert.equal(getRetryStatus(2), "pending");
  assert.equal(getRetryStatus(2, undefined), "pending");
  assert.equal(getRetryStatus(288, undefined), "needs_review");
});

run("computeNextRetryAt returns 5 min for case_not_found retry 0", () => {
  const before = Date.now();
  const result = computeNextRetryAt("case_not_found", 0);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 5 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 5 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns 10 min for case_not_found retry 1", () => {
  const before = Date.now();
  const result = computeNextRetryAt("case_not_found", 1);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 10 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 10 * 60 * 1000 + 2000);
});

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

run("computeNextRetryAt returns null for missing_appointment and other reasons", () => {
  assert.equal(computeNextRetryAt("missing_appointment", 0), null);
  assert.equal(computeNextRetryAt(undefined, 0), null);
  assert.equal(computeNextRetryAt(null, 0), null);
});

run("computeNextRetryAt returns 5 min for missing_contact_info retry 0", () => {
  const before = Date.now();
  const result = computeNextRetryAt("missing_contact_info", 0);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 5 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 5 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns 30 min for missing_contact_info retry 1", () => {
  const before = Date.now();
  const result = computeNextRetryAt("missing_contact_info", 1);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 30 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 30 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns 2 hours for missing_contact_info retry 2", () => {
  const before = Date.now();
  const result = computeNextRetryAt("missing_contact_info", 2);
  assert.ok(result, "should return a timestamp");
  const retryAt = new Date(result).getTime();
  assert.ok(retryAt >= before + 2 * 60 * 60 * 1000 - 1000);
  assert.ok(retryAt <= before + 2 * 60 * 60 * 1000 + 2000);
});

run("computeNextRetryAt returns null for missing_contact_info retry 3+ (exhausted)", () => {
  assert.equal(computeNextRetryAt("missing_contact_info", 3), null);
  assert.equal(computeNextRetryAt("missing_contact_info", 5), null);
});

run("getRetryStatus with reason=missing_contact_info caps at 3 retries", () => {
  assert.equal(getRetryStatus(0, "missing_contact_info"), "pending");
  assert.equal(getRetryStatus(1, "missing_contact_info"), "pending");
  assert.equal(getRetryStatus(2, "missing_contact_info"), "pending");
  assert.equal(getRetryStatus(3, "missing_contact_info"), "needs_review");
  assert.equal(getRetryStatus(4, "missing_contact_info"), "needs_review");
});

run("MAX_MISSING_CONTACT_INFO_RETRIES is 3", () => {
  assert.equal(MAX_MISSING_CONTACT_INFO_RETRIES, 3);
});

run("buildPendingEntry with reason=missing_contact_info sets reason and next_retry_at", () => {
  const before = Date.now();
  const entry = buildPendingEntry(
    { firstName: "Mark", lastName: "Geoff" },
    { caseId: null, lookupMethod: null, reason: "missing_contact_info" }
  );

  assert.equal(entry.reason, "missing_contact_info");
  assert.equal(entry.email, undefined);
  assert.equal(entry.phone, undefined);
  assert.equal(entry.first_name, "Mark");
  assert.equal(entry.last_name, "Geoff");
  assert.ok(entry.next_retry_at, "should have next_retry_at");
  const retryAt = new Date(entry.next_retry_at).getTime();
  assert.ok(retryAt >= before + 5 * 60 * 1000 - 1000, "next_retry_at should be ~5 min from now");
  assert.ok(retryAt <= before + 5 * 60 * 1000 + 2000, "next_retry_at should be ~5 min from now");
});

run("MAX_CASE_NOT_FOUND_RETRIES is 4", () => {
  assert.equal(MAX_CASE_NOT_FOUND_RETRIES, 4);
});

run("buildPendingTasksQuery includes next_retry_at filter", () => {
  const query = buildPendingTasksQuery();
  assert.match(query, /or=\(next_retry_at\.is\.null,next_retry_at\.lte\./);
});

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
