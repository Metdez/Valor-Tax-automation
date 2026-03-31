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
