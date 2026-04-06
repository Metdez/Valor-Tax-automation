import { NextResponse } from "next/server";
import { lookupCase } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email") || "";
    const phone = searchParams.get("phone") || "";

    if (!email && !phone) {
      return NextResponse.json(
        { error: "Provide either email or phone to look up a case" },
        { status: 400 }
      );
    }

    const result = await lookupCase({ email, phone });

    if (!result) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to look up case",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
