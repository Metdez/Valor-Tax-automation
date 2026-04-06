import { NextResponse } from "next/server";
import { supabaseRest } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const { logId } = await request.json();
    if (!logId) {
      return NextResponse.json({ error: "logId required" }, { status: 400 });
    }

    // Fetch the original task_log row
    const rows = await supabaseRest(
      `task_logs?id=eq.${encodeURIComponent(logId)}&select=*&limit=1`
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
    }

    const row = rows[0];

    // Reconstruct webhook payload from stored fields
    const payload = {
      "First Name": row.first_name,
      "Last Name": row.last_name,
      Email: row.email,
      Phone: row.phone,
      appointment_title: row.appointment_title,
      appointment_start_time: row.appointment_start,
      appointment_end_time: row.appointment_end,
      calender: row.calendar_name,
    };

    // Re-submit to webhook handler
    const webhookUrl = new URL("/api/ghl-webhook", request.url);
    const result = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await result.json();
    return NextResponse.json({ retryResult: data, status: result.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
