import assert from "node:assert/strict";

import {
  extractAppointmentFromContactRecord,
  normalizeMcpToolPayload,
  pickLatestContact,
} from "../../lib/ghl-mcp.js";

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("normalizeMcpToolPayload parses JSON text content", () => {
  const payload = normalizeMcpToolPayload({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          contacts: [{ id: "contact-1", dateAdded: "2026-03-31T12:00:00.000Z" }],
        }),
      },
    ],
  });

  assert.deepEqual(payload, {
    contacts: [{ id: "contact-1", dateAdded: "2026-03-31T12:00:00.000Z" }],
  });
});

run("pickLatestContact prefers the newest dateAdded value", () => {
  const contact = pickLatestContact([
    { id: "contact-1", dateAdded: "2026-03-30T12:00:00.000Z" },
    { id: "contact-2", dateAdded: "2026-03-31T12:00:00.000Z" },
    { id: "contact-3", dateAdded: null },
  ]);

  assert.equal(contact.id, "contact-2");
});

run("extractAppointmentFromContactRecord normalizes nested appointment fields", () => {
  const appointment = extractAppointmentFromContactRecord({
    id: "contact-1",
    appointments: [
      {
        startTime: "2026-04-02 12:00:00",
        endTime: "2026-04-02 12:30:00",
        title: "Consult",
        calendarName: "Valor Tax Appointment",
      },
    ],
  });

  assert.deepEqual(appointment, {
    appointmentTitle: "Consult",
    appointmentStart: "2026-04-02 12:00:00",
    appointmentEnd: "2026-04-02 12:30:00",
    calendarName: "Valor Tax Appointment",
  });
});
