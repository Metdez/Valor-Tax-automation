import { NextResponse } from "next/server";
import { getActivityPage } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getActivityPage({
      page: Number(searchParams.get("page") || "1"),
      limit: Number(searchParams.get("limit") || "20"),
      officer: searchParams.get("officer") || "",
      status: searchParams.get("status") || "",
      from: searchParams.get("from") || "",
      to: searchParams.get("to") || "",
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch activity logs",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
