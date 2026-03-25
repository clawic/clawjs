import { NextResponse } from "next/server";

import { getClawSnapshot } from "@/lib/claw";

export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getClawSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
