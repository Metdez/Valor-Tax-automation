import { NextResponse } from "next/server";
import { getDashboardStats } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch dashboard stats",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
