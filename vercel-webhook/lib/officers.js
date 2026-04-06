import { supabaseRest } from "./supabase.js";

// Hardcoded fallback in case Supabase table is empty
const FALLBACK_OFFICERS = [
  { name: "Anthony Edwards", userId: 73, phone: "(657) 204-1237" },
  { name: "David Wolfson", userId: 71, phone: "(657) 335-4205" },
  { name: "Dustin Boswell", userId: 64, phone: "(657) 300-0047" },
  { name: "Ellie London", userId: 68, phone: "(657) 204-1023" },
  { name: "John Gibson", userId: 58, phone: "(657) 900-4821" },
  { name: "Michael Rothberg", userId: 35, phone: "(657) 660-4448" },
  { name: "Nikki Dee", userId: 42, phone: "(657) 701-4979" },
  { name: "Oscar Morales", userId: 75, phone: "(657) 300-7148" },
  { name: "Ron Spencer", userId: 78, phone: "(657) 204-1011" },
  { name: "Val Vallery", userId: 77, phone: "(657) 600-0876" },
  { name: "Vanessa Thomas", userId: 24, phone: "(657) 348-2787" },
  { name: "Vincent Parks", userId: 82, phone: "(657) 312-3380" },
  { name: "Stanley Johnson", userId: 83, phone: "(657) 300-0018" },
];

// Fetch active officers from Supabase, ordered by sort_order
export async function getOfficers() {
  try {
    const data = await supabaseRest(
      "officers?select=name,user_id,phone,sort_order&is_active=eq.true&order=sort_order.asc"
    );

    if (!data || !Array.isArray(data) || data.length === 0) {
      return FALLBACK_OFFICERS;
    }

    return data.map((row) => ({
      name: row.name,
      userId: row.user_id,
      phone: row.phone || "",
    }));
  } catch {
    return FALLBACK_OFFICERS;
  }
}

// Keep synchronous exports for backward compat — but these use fallback only
export const OFFICERS = FALLBACK_OFFICERS;

export function getOfficerByIndex(index, officers = FALLBACK_OFFICERS) {
  return officers[index % officers.length];
}

export function getOfficerByUserId(userId) {
  return FALLBACK_OFFICERS.find((o) => o.userId === Number(userId)) ?? null;
}

export function getOfficerByName(name) {
  return FALLBACK_OFFICERS.find((o) => o.name === name) ?? null;
}
