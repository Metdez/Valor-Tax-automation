/**
 * Vercel Serverless Function: GHL Appointment → IRS Logics Case
 *
 * Receives a GHL Workflow Outbound Webhook (trigger: Appointment Booked),
 * maps contact + appointment data to IRS Logics fields, checks for duplicates,
 * and creates a new case via the IRS Logics V4 API.
 */

const IRS_LOGICS_URL =
  "https://valortax.irslogics.com/publicapi/V4/Case/CaseFile";

// --- Round-Robin Officers ---
const OFFICERS = [
  "Anthony Edwards",
  "David Wolfson",
  "Dustin Boswell",
  "Ellie London",
  "John Gibson",
  "Michael Rothberg",
  "Nikki Dee",
  "Oscar Morales",
  "Ron Spencer",
  "Val Vallery",
  "Vanessa Thomas",
  "Vincent Parks",
  "Stanley Johnson",
];

async function getNextOfficer() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Get current index
  const getRes = await fetch(
    `${supabaseUrl}/rest/v1/round_robin?id=eq.1&select=current_index`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }
  );
  const rows = await getRes.json();
  const currentIndex = rows[0]?.current_index ?? 0;

  // Pick officer
  const officer = OFFICERS[currentIndex % OFFICERS.length];

  // Increment index (wraps via modulo on next read)
  const nextIndex = (currentIndex + 1) % OFFICERS.length;
  await fetch(`${supabaseUrl}/rest/v1/round_robin?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ current_index: nextIndex }),
  });

  return officer;
}

// --- Helpers ---

function formatPhone(raw) {
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

function formatDOB(raw) {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function formatState(raw) {
  if (!raw) return undefined;
  const s = raw.trim().toUpperCase();
  return s.length === 2 ? s : undefined;
}

// --- Field Mapping ---
// GHL Workflow sends custom keys with spaces/caps:
//   "First Name", "Last Name", "Email", "Phone",
//   "appointment_id", "appointment_title", "appointment_start_time",
//   "appointment_end_time", "calender", "conversations_ai_summary",
//   "conversations_ai_transcript"
// Also supports standard GHL keys (first_name, last_name, etc.) as fallback.

function get(body, ...keys) {
  for (const k of keys) {
    if (body[k]) return body[k];
  }
  return undefined;
}

function mapGHLToIRSLogics(body) {
  const payload = {};

  // Required
  payload.LastName =
    get(body, "Last Name", "last_name", "full_name") || "Unknown";

  // Contact basics
  const firstName = get(body, "First Name", "first_name");
  if (firstName) payload.FirstName = firstName;

  const email = get(body, "Email", "email");
  if (email) payload.Email = email;

  const phone = formatPhone(get(body, "Phone", "phone"));
  if (phone) payload.CellPhone = phone;

  // Address (if added to workflow later)
  const address = get(body, "Address", "address1");
  if (address) payload.Address = address;

  const city = get(body, "City", "city");
  if (city) payload.City = city;

  const state = formatState(get(body, "State", "state"));
  if (state) payload.State = state;

  const zip = get(body, "Zip", "postal_code");
  if (zip) payload.Zip = zip;

  // Date of Birth
  const dob = formatDOB(get(body, "Date of Birth", "date_of_birth"));
  if (dob) payload.DOB = dob;

  // Company / Business
  const biz = get(body, "Company", "company_name");
  if (biz) payload.BusinessName = biz;

  // Build notes from appointment + AI summary
  const notesParts = [];
  const title = get(body, "appointment_title");
  if (title) notesParts.push(`Appointment: ${title}`);

  const calendar = get(body, "calender");
  if (calendar) notesParts.push(`Calendar: ${calendar}`);

  const startTime = get(body, "appointment_start_time");
  if (startTime) notesParts.push(`Start: ${startTime}`);

  const aiSummary = get(body, "conversations_ai_summary");
  if (aiSummary) notesParts.push(`AI Summary: ${aiSummary}`);

  const aiTranscript = get(body, "conversations_ai_transcript");
  if (aiTranscript) notesParts.push(`Transcript: ${aiTranscript}`);

  if (notesParts.length > 0) payload.Notes = notesParts.join("\n");

  // Duplicate check on key identifiers
  payload.DuplicateCheck = "FirstName,LastName,Email,CellPhone";

  return payload;
}

// --- Main Handler ---

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;

  // Basic validation
  if (!body || (!body["Last Name"] && !body.last_name && !body.full_name)) {
    console.error("Missing required contact data:", JSON.stringify(body));
    return res.status(400).json({ error: "Missing Last Name" });
  }

  const irsPayload = mapGHLToIRSLogics(body);

  // Round-robin officer assignment
  const officer = await getNextOfficer();
  irsPayload["Set. Officer"] = officer;

  console.log(`Assigned to: ${officer}`);
  console.log("Mapped IRS Logics payload:", JSON.stringify(irsPayload));

  // Send to IRS Logics
  const credentials = Buffer.from(
    `${process.env.IRS_LOGICS_PUBLIC_KEY}:${process.env.IRS_LOGICS_SECRET_KEY}`
  ).toString("base64");

  try {
    const response = await fetch(IRS_LOGICS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(irsPayload),
    });

    const result = await response.json();
    console.log("IRS Logics response:", JSON.stringify(result));

    if (!response.ok) {
      return res.status(response.status).json({
        error: "IRS Logics API error",
        details: result,
      });
    }

    return res.status(200).json({
      success: true,
      caseId: result.Data?.CaseID || result.data?.CaseID,
      message: result.Message || result.message,
    });
  } catch (err) {
    console.error("Error calling IRS Logics:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
