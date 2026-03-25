import { NextRequest, NextResponse } from "next/server";

import { assertE2EEnabled, seedE2EState } from "@/lib/e2e";

export async function POST(request: NextRequest) {
  try {
    assertE2EEnabled();
    const body = await request.json().catch(() => ({} as { profile?: "seeded" | "fresh" }));
    const profile = body.profile === "fresh" ? "fresh" : "seeded";
    seedE2EState(profile);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to seed E2E state" },
      { status: 500 },
    );
  }
}
