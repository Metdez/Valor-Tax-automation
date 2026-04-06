import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("officers")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ officers: data });
}

export async function POST(request) {
  try {
    const { name, userId, phone } = await request.json();
    if (!name || !userId) {
      return NextResponse.json({ error: "name and userId are required" }, { status: 400 });
    }

    const sb = getSupabaseAdmin();

    // Get max sort_order
    const { data: maxRow } = await sb
      .from("officers")
      .select("sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxRow?.sort_order ?? -1) + 1;

    const { data, error } = await sb
      .from("officers")
      .insert({ name, user_id: userId, phone: phone || "", sort_order: nextOrder })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, officer: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id, userId } = await request.json();
    const sb = getSupabaseAdmin();

    let query = sb.from("officers").update({ is_active: false });
    if (id) query = query.eq("id", id);
    else if (userId) query = query.eq("user_id", userId);
    else return NextResponse.json({ error: "id or userId required" }, { status: 400 });

    const { error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
