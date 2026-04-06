import { NextResponse } from "next/server";
import { getCaseHistory } from "@/lib/dashboard";
import { getCaseInfo } from "@/lib/irs-logics";

export const dynamic = "force-dynamic";

export async function GET(_request, { params }) {
  try {
    const [caseDetails, taskHistory] = await Promise.all([
      getCaseInfo(params.id),
      getCaseHistory(params.id),
    ]);

    return NextResponse.json({
      case: caseDetails,
      taskHistory,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to fetch case details",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
