import { NextResponse } from "next/server";

import { getE2EFixtureMode, isE2EEnabled, isE2EExternalCallsDisabled } from "@/lib/e2e";
import { listSessions } from "@/lib/sessions";

export async function GET() {
  return NextResponse.json({
    enabled: isE2EEnabled(),
    fixtureMode: getE2EFixtureMode(),
    externalCallsDisabled: isE2EExternalCallsDisabled(),
    sessions: listSessions().length,
  });
}
