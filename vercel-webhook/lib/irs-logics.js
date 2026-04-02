import { OFFICERS } from "./officers.js";

const IRS_LOGICS_BASE = "https://valortax.irslogics.com/publicapi/V4";

export { OFFICERS };

function getAuthHeader() {
  if (!process.env.IRS_LOGICS_PUBLIC_KEY || !process.env.IRS_LOGICS_SECRET_KEY) {
    throw new Error("Missing IRS Logics credentials");
  }

  return (
    "Basic " +
    Buffer.from(
      `${process.env.IRS_LOGICS_PUBLIC_KEY}:${process.env.IRS_LOGICS_SECRET_KEY}`
    ).toString("base64")
  );
}

async function requestIrsLogicsJson(path, init = {}) {
  const response = await fetch(`${IRS_LOGICS_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: getAuthHeader(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : {};

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

function getPayloadData(payload) {
  return payload?.data ?? payload?.Data ?? payload ?? null;
}

export async function findCaseByEmail(email) {
  const { payload } = await requestIrsLogicsJson(
    `/Find/FindCaseByEmail?email=${encodeURIComponent(email)}`
  );

  return payload;
}

export async function findCaseByPhone(phone) {
  const { payload } = await requestIrsLogicsJson(
    `/Find/FindCaseByPhone?phone=${encodeURIComponent(phone)}`
  );

  return payload;
}

export async function getCaseInfo(caseId, details = "") {
  const detailsParam = details ? `&details=${encodeURIComponent(details)}` : "";
  const { ok, status, payload } = await requestIrsLogicsJson(
    `/Case/CaseInfo?CaseID=${encodeURIComponent(caseId)}${detailsParam}`
  );

  if (!ok || payload?.Success === false) {
    throw new Error(payload?.Message || payload?.message || `CaseInfo failed (${status})`);
  }

  return getPayloadData(payload);
}

export async function getCaseOfficer(caseId) {
  const { ok, payload } = await requestIrsLogicsJson(
    `/Case/CaseInfo?CaseID=${encodeURIComponent(caseId)}&details=setofficerid`
  );

  if (!ok || payload?.Success === false) return null;

  const data = getPayloadData(payload);
  const officer = data?.setofficerid;
  if (!officer || !officer.ID) return null;

  return {
    userId: Number(officer.ID),
    name: officer.Name || null,
    email: officer.Email || null,
  };
}

export async function createTask(taskPayload) {
  const { ok, status, payload } = await requestIrsLogicsJson("/Task/Task", {
    method: "POST",
    body: JSON.stringify(taskPayload),
  });

  return {
    ok: ok && payload?.Success !== false,
    status,
    result: payload,
    taskId: payload?.data?.TaskID ?? payload?.Data?.TaskID ?? null,
    errorMessage:
      !ok || payload?.Success === false
        ? payload?.Message || payload?.message || `Task creation failed (${status})`
        : null,
  };
}

export async function createCase({ firstName, lastName, email, phone, officerName }) {
  const body = {
    LastName: lastName || "Unknown",
    FirstName: firstName || undefined,
    Email: email || undefined,
    CellPhone: phone || undefined,
    "Set. Officer": officerName || undefined,
    DuplicateCheck: "Email,CellPhone",
  };
  Object.keys(body).forEach((k) => body[k] === undefined && delete body[k]);

  const { ok, status, payload } = await requestIrsLogicsJson("/Case/CaseFile", {
    method: "POST",
    body: JSON.stringify(body),
  });

  const data = payload?.data ?? payload?.Data ?? null;
  return {
    ok: ok && payload?.Success !== false,
    status,
    caseId: data?.CaseID ?? null,
    result: payload,
    errorMessage:
      !ok || payload?.Success === false
        ? payload?.Message || payload?.message || `Case creation failed (${status})`
        : null,
  };
}

export async function createCaseActivity(activityPayload) {
  const { ok, status, payload } = await requestIrsLogicsJson(
    "/CaseActivity/Activity",
    {
      method: "POST",
      body: JSON.stringify(activityPayload),
    }
  );

  return {
    ok: ok && payload?.Success !== false,
    status,
    result: payload,
    errorMessage:
      !ok || payload?.Success === false
        ? payload?.Message || payload?.message || `Case activity creation failed (${status})`
        : null,
  };
}

export function extractCaseId(response) {
  if (!response || !response.Success) return null;
  const data = response.data || response.Data;
  if (!data) return null;
  if (!Array.isArray(data)) return data.CaseID || null;
  if (data.length === 0) return null;
  if (data.length === 1) return data[0].CaseID;

  const withSaleDate = data.filter((row) => row.SaleDate);
  if (withSaleDate.length > 0) {
    withSaleDate.sort((left, right) => new Date(right.CreatedDate) - new Date(left.CreatedDate));
    return withSaleDate[0].CaseID;
  }

  const sorted = [...data].sort((left, right) => new Date(right.CreatedDate) - new Date(left.CreatedDate));
  return sorted[0].CaseID;
}

export function formatPhone(raw) {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)})${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return undefined;
}

/**
 * Generate alternate phone format variations for IRS Logics search.
 * Returns an array of formats EXCLUDING the original.
 */
export function phoneFormats(raw) {
  if (!raw) return [];
  const digits = raw.replace(/\D/g, "");
  const d10 = digits.length === 11 && digits[0] === "1" ? digits.slice(1) : digits;
  if (d10.length !== 10) return [];

  const area = d10.slice(0, 3);
  const mid = d10.slice(3, 6);
  const last = d10.slice(6);

  const variations = [
    d10,                               // 2673339583
    `(${area})${mid}-${last}`,         // (267)333-9583
    `${area}-${mid}-${last}`,          // 267-333-9583
    `${area}.${mid}.${last}`,          // 267.333.9583
    `+1${d10}`,                        // +12673339583
  ];

  const original = raw.trim();
  return [...new Set(variations)].filter((v) => v !== original);
}

/**
 * Try IRS Logics FindCaseByPhone with multiple phone format variations.
 * Stops on first match. Returns { caseId, lookupMethod } or null values.
 */
export async function findCaseByPhoneAltFormats(phone) {
  const formats = phoneFormats(phone);
  for (const fmt of formats) {
    const result = await findCaseByPhone(fmt);
    const caseId = extractCaseId(result);
    if (caseId) {
      return { caseId, lookupMethod: "phone_alt", lookupResponse: result };
    }
  }
  return { caseId: null, lookupMethod: null, lookupResponse: null };
}

/**
 * Exhaustive case search — tries email, phone, alt phone formats,
 * then any extra emails/phones provided by contact enrichment.
 * Stops on first match.
 */
export async function findCaseExhaustive(email, phone, extraEmails = [], extraPhones = []) {
  // 1. Standard email + phone lookup
  const basic = await findCase(email, phone);
  if (basic.caseId) return basic;

  // 2. Alternate phone formats
  if (phone) {
    const altResult = await findCaseByPhoneAltFormats(phone);
    if (altResult.caseId) return altResult;
  }

  // 3. Extra emails from GHL enrichment
  for (const extraEmail of extraEmails) {
    if (extraEmail && extraEmail !== email) {
      const result = await findCaseByEmail(extraEmail);
      const caseId = extractCaseId(result);
      if (caseId) {
        return { caseId, lookupMethod: "email_enriched", lookupResponse: result };
      }
    }
  }

  // 4. Extra phones from GHL enrichment (with alt formats for each)
  for (const extraPhone of extraPhones) {
    if (extraPhone && extraPhone !== phone) {
      const result = await findCaseByPhone(extraPhone);
      const caseId = extractCaseId(result);
      if (caseId) {
        return { caseId, lookupMethod: "phone_enriched", lookupResponse: result };
      }
      const altResult = await findCaseByPhoneAltFormats(extraPhone);
      if (altResult.caseId) return altResult;
    }
  }

  return { caseId: null, lookupMethod: null, lookupResponse: null };
}

export function parseGhlDate(raw) {
  if (!raw) return undefined;
  const cleaned = raw.replace(/^\w+,\s*/, "");
  const date = new Date(cleaned);

  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toISOString();
}

export async function findCase(email, phone) {
  if (email) {
    const emailResult = await findCaseByEmail(email);
    const emailCaseId = extractCaseId(emailResult);

    if (emailCaseId) {
      return { caseId: emailCaseId, lookupMethod: "email", lookupResponse: emailResult };
    }
  }

  if (phone) {
    const phoneResult = await findCaseByPhone(phone);
    const phoneCaseId = extractCaseId(phoneResult);

    if (phoneCaseId) {
      return { caseId: phoneCaseId, lookupMethod: "phone", lookupResponse: phoneResult };
    }
  }

  return { caseId: null, lookupMethod: null, lookupResponse: null };
}
