import { NextResponse } from "next/server";

import { getE2EFixtureMode, isE2EEnabled, isE2EExternalCallsDisabled } from "@/lib/e2e";
import { getClawJSLocalSettingsPath } from "@/lib/local-settings";
import { resolveClawJSAgentDir, resolveClawJSSessionsDir, resolveClawJSWorkspaceDir, resolveOpenClawStateDir } from "@/lib/openclaw-agent";
import { listSessions } from "@/lib/sessions";
import { getClawJSConfigDir } from "@/lib/user-config";

export async function GET() {
  return NextResponse.json({
    enabled: isE2EEnabled(),
    fixtureMode: getE2EFixtureMode(),
    externalCallsDisabled: isE2EExternalCallsDisabled(),
    sessions: listSessions().length,
    paths: {
      stateDir: resolveOpenClawStateDir(),
      workspaceDir: resolveClawJSWorkspaceDir(),
      agentDir: resolveClawJSAgentDir(),
      conversationsDir: resolveClawJSSessionsDir(),
      configDir: getClawJSConfigDir(),
      localSettingsPath: getClawJSLocalSettingsPath(),
    },
  });
}
