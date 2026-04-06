import { NextResponse } from "next/server";
import { supabaseRest } from "@/lib/supabase";
import { getOfficers } from "@/lib/officers";

export const dynamic = "force-dynamic";

export async function PATCH(request) {
  try {
    const { index } = await request.json();
    const officers = await getOfficers();

    if (typeof index !== "number" || index < 0 || index >= officers.length) {
      return NextResponse.json({ error: "Invalid index" }, { status: 400 });
    }

    await supabaseRest("round_robin?id=eq.1", {
      method: "PATCH",
      body: { current_index: index },
      headers: { Prefer: "return=minimal" },
    });

    return NextResponse.json({
      success: true,
      nextOfficer: officers[index].name,
      index,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
