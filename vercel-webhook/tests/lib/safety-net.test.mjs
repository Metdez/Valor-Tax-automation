import assert from "node:assert/strict";
import { filterNewAppointments } from "../../lib/safety-net.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("filterNewAppointments removes appointments that have matching task logs", () => {
  const ghlAppointments = [
    { contactEmail: "a@test.com", startTime: "2026-04-01 10:00:00", title: "Consult", calendarName: "Valor Tax" },
    { contactEmail: "b@test.com", startTime: "2026-04-01 11:00:00", title: "Review", calendarName: "Valor Tax" },
    { contactEmail: "c@test.com", startTime: "2026-04-01 12:00:00", title: "Followup", calendarName: "Valor Tax" },
  ];

  const existingLogs = [
    { email: "a@test.com", appointment_start: "2026-04-01T10:00:00.000Z" },
  ];

  const result = filterNewAppointments(ghlAppointments, existingLogs);
  assert.equal(result.length, 2);
  assert.equal(result[0].contactEmail, "b@test.com");
  assert.equal(result[1].contactEmail, "c@test.com");
});

run("filterNewAppointments returns all when no task logs exist", () => {
  const ghlAppointments = [
    { contactEmail: "a@test.com", startTime: "2026-04-01 10:00:00", title: "Consult", calendarName: "Valor Tax" },
  ];

  const result = filterNewAppointments(ghlAppointments, []);
  assert.equal(result.length, 1);
});

run("filterNewAppointments returns empty when all are already logged", () => {
  const ghlAppointments = [
    { contactEmail: "a@test.com", startTime: "2026-04-01 10:00:00", title: "Consult", calendarName: "Valor Tax" },
  ];

  const existingLogs = [
    { email: "a@test.com", appointment_start: "2026-04-01T10:00:00.000Z" },
  ];

  const result = filterNewAppointments(ghlAppointments, existingLogs);
  assert.equal(result.length, 0);
});
