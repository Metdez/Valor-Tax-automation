import { NextResponse } from "next/server";
import { getErrorPage, getErrorTrend, getErrorStats } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") || "list";

    if (mode === "stats") {
      const stats = await getErrorStats();
      return NextResponse.json(stats);
    }

    if (mode === "trend") {
      const days = parseInt(searchParams.get("days") || "14", 10);
      const trend = await getErrorTrend(days);
      return NextResponse.json(trend);
    }

    // Default: list mode
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const category = searchParams.get("category") || "";
    const result = await getErrorPage({ page, limit, category });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
