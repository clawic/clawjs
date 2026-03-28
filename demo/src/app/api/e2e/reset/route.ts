import { NextRequest, NextResponse } from "next/server";

import { assertE2EEnabled, resetE2EState, seedE2EState } from "@/lib/e2e";

export async function POST(request: NextRequest) {
  try {
    assertE2EEnabled();
    const body = await request.json().catch(() => ({} as { profile?: "seeded" | "fresh" | "clean"; seed?: boolean }));
    resetE2EState();
    if (body.seed !== false) {
      seedE2EState(
        body.profile === "fresh"
          ? "fresh"
          : body.profile === "clean"
            ? "clean"
            : "seeded",
      );
    }
    return NextResponse.json({
      ok: true,
      profile: body.profile === "fresh" ? "fresh" : body.profile === "clean" ? "clean" : "seeded",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reset E2E state" },
      { status: 500 },
    );
  }
}
