const DEFAULT_GHL_MCP_URL = "https://services.leadconnectorhq.com/mcp/";

function tryParseJson(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getByPath(value, path) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function firstArray(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function firstObject(value, paths) {
  for (const path of paths) {
    const candidate = getByPath(value, path);
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return candidate;
    }
  }

  return null;
}

function getDateValue(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeAppointmentRecord(record) {
  if (!record || typeof record !== "object") return null;

  const calendar = record.calendar;
  const normalized = {
    appointmentTitle:
      record.title ??
      record.appointmentTitle ??
      record.name ??
      null,
    appointmentStart:
      record.startTime ??
      record.appointmentStart ??
      record.start ??
      record.startDate ??
      null,
    appointmentEnd:
      record.endTime ??
      record.appointmentEnd ??
      record.end ??
      record.endDate ??
      null,
    calendarName:
      record.calendarName ??
      calendar?.name ??
      (typeof calendar === "string" ? calendar : null) ??
      record.groupName ??
      null,
  };

  if (!Object.values(normalized).some(Boolean)) {
    return null;
  }

  return normalized;
}

export function isGhlMcpConfigured(env = process.env) {
  return Boolean(env.GHL_MCP_TOKEN && (env.GHL_MCP_LOCATION_ID || env.GHL_LOCATION_ID));
}

function getGhlMcpHeaders(env = process.env) {
  const token = env.GHL_MCP_TOKEN;
  const locationId = env.GHL_MCP_LOCATION_ID || env.GHL_LOCATION_ID;

  if (!token) {
    throw new Error("Missing GHL_MCP_TOKEN");
  }

  if (!locationId) {
    throw new Error("Missing GHL_MCP_LOCATION_ID");
  }

  return {
    Authorization: `Bearer ${token}`,
    locationId,
    "Content-Type": "application/json",
  };
}

export function normalizeMcpToolPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload ?? {};
  }

  if (Array.isArray(payload.content)) {
    for (const item of payload.content) {
      if (item?.json && typeof item.json === "object") {
        return item.json;
      }

      if (typeof item?.text === "string") {
        const parsed = tryParseJson(item.text);
        if (parsed !== item.text) {
          return normalizeMcpToolPayload(parsed);
        }
      }
    }
  }

  for (const key of ["result", "data", "output", "response"]) {
    if (payload[key] !== undefined) {
      return normalizeMcpToolPayload(payload[key]);
    }
  }

  return payload;
}

export function pickLatestContact(contacts) {
  if (!Array.isArray(contacts) || contacts.length === 0) {
    return null;
  }

  return [...contacts].sort((left, right) => {
    return getDateValue(right.dateAdded || right.date_added) - getDateValue(left.dateAdded || left.date_added);
  })[0];
}

export function extractAppointmentFromContactRecord(record) {
  const directMatch = normalizeAppointmentRecord(record);
  if (directMatch?.appointmentStart) {
    return directMatch;
  }

  const arrays = firstArray(record, [
    "appointments",
    "events",
    "data.appointments",
    "data.events",
    "contact.appointments",
    "contact.events",
  ]);

  const objectMatches = [
    firstObject(record, ["appointment", "latestAppointment", "lastAppointment", "nextAppointment"]),
    ...arrays,
  ]
    .map((candidate) => normalizeAppointmentRecord(candidate))
    .filter(Boolean);

  if (objectMatches.length === 0) {
    return null;
  }

  return objectMatches.sort((left, right) => {
    return getDateValue(right.appointmentStart) - getDateValue(left.appointmentStart);
  })[0];
}

export async function callGhlMcpTool(tool, input = {}, { env = process.env, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(env.GHL_MCP_URL || DEFAULT_GHL_MCP_URL, {
    method: "POST",
    headers: getGhlMcpHeaders(env),
    body: JSON.stringify({ tool, input }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GHL MCP ${tool} failed (${response.status}): ${body}`);
  }

  return response.json();
}

function extractContacts(payload) {
  const normalized = normalizeMcpToolPayload(payload);
  return firstArray(normalized, [
    "contacts",
    "data.contacts",
    "result.contacts",
    "items",
    "results",
    "data",
  ]).filter((value) => value && typeof value === "object");
}

function extractContactObject(payload) {
  const normalized = normalizeMcpToolPayload(payload);

  if (normalized?.contact && typeof normalized.contact === "object") {
    return normalized.contact;
  }

  const listContact = pickLatestContact(extractContacts(normalized));
  if (listContact) {
    return listContact;
  }

  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    return normalized;
  }

  return null;
}

export async function searchGhlContactsViaMcp(email, phone, options = {}) {
  if (!isGhlMcpConfigured(options.env)) {
    return [];
  }

  const locationId = (options.env || process.env).GHL_MCP_LOCATION_ID || (options.env || process.env).GHL_LOCATION_ID;
  const queries = [email, phone, options.name].filter(Boolean);

  for (const query of queries) {
    const candidateInputs = [
      { query, limit: 10 },
      { locationId, query, limit: 10 },
      { search: query, limit: 10 },
      { locationId, search: query, limit: 10 },
      { email: query, phone: query, limit: 10 },
      { locationId, email: query, phone: query, limit: 10 },
    ];

    for (const input of candidateInputs) {
      try {
        const payload = await callGhlMcpTool("contacts_get-contacts", input, options);
        const contacts = extractContacts(payload);
        if (contacts.length > 0) {
          return contacts;
        }
      } catch (error) {
        console.error("GHL MCP contact search failed:", error.message);
      }
    }
  }

  return [];
}

export async function getGhlContactViaMcp(contactId, options = {}) {
  if (!contactId || !isGhlMcpConfigured(options.env)) {
    return null;
  }

  const locationId = (options.env || process.env).GHL_MCP_LOCATION_ID || (options.env || process.env).GHL_LOCATION_ID;
  const candidateInputs = [
    { contactId },
    { id: contactId },
    { locationId, contactId },
    { locationId, id: contactId },
  ];

  for (const input of candidateInputs) {
    try {
      const payload = await callGhlMcpTool("contacts_get-contact", input, options);
      const contact = extractContactObject(payload);
      if (contact) {
        return contact;
      }
    } catch (error) {
      console.error("GHL MCP get contact failed:", error.message);
    }
  }

  return null;
}

export async function findGhlContactIdViaMcp(email, phone, options = {}) {
  const contact = pickLatestContact(await searchGhlContactsViaMcp(email, phone, options));
  return contact?.id || contact?.contactId || null;
}

export async function fetchAppointmentByContactIdFromMcp(contactId, options = {}) {
  const contact = await getGhlContactViaMcp(contactId, options);
  const appointment = extractAppointmentFromContactRecord(contact);

  if (!appointment?.appointmentStart) {
    return null;
  }

  return {
    startTime: appointment.appointmentStart,
    endTime: appointment.appointmentEnd || null,
    title: appointment.appointmentTitle || null,
    calendarId: contact?.calendarId || contact?.calendar?.id || null,
    calendarName: appointment.calendarName || null,
  };
}

export async function findGhlContactByNameViaMcp(name, options = {}) {
  const contacts = await searchGhlContactsViaMcp(null, null, { ...options, name });
  const contact = pickLatestContact(contacts);
  if (!contact) return null;
  return {
    id: contact.id || contact.contactId || null,
    email: contact.email || null,
    phone: contact.phone || contact.cellPhone || contact.cell_phone || null,
  };
}

export async function fetchAppointmentFromMcp(email, phone, options = {}) {
  if (!isGhlMcpConfigured(options.env)) {
    return {};
  }

  const contact = pickLatestContact(await searchGhlContactsViaMcp(email, phone, options));
  if (!contact) {
    return {};
  }

  const directAppointment = extractAppointmentFromContactRecord(contact);
  if (directAppointment?.appointmentStart) {
    return directAppointment;
  }

  const contactId = contact.id || contact.contactId;
  if (!contactId) {
    return {};
  }

  const detailedAppointment = await fetchAppointmentByContactIdFromMcp(contactId, options);
  if (!detailedAppointment?.startTime) {
    return {};
  }

  return {
    appointmentTitle: detailedAppointment.title || undefined,
    appointmentStart: detailedAppointment.startTime || undefined,
    appointmentEnd: detailedAppointment.endTime || undefined,
    calendarName: detailedAppointment.calendarName || undefined,
  };
}
