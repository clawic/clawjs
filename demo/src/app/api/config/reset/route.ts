import { execFile } from "child_process";
import { NextRequest, NextResponse } from "next/server";

import { resetClawJSWorkspace, resetOpenClawAgentData, removeClawJSFromOpenClawConfig, ALL_RESET_OPTIONS, type ResetOptions } from "@/lib/workspace-reset";
import { invalidateOpenClawAvailabilityCache } from "@/app/api/chat/route";
import { isE2EEnabled, resetE2EState, seedE2EState } from "@/lib/e2e";
import { getClawJSLocalSettings, saveClawJSLocalSettings } from "@/lib/local-settings";
import { findCommand, findCommandFresh } from "@/lib/platform";
import { stopWacliAuth } from "@/lib/wacli-runtime";
import { uninstallAdapter } from "@/lib/runtime-adapters";

interface ExtendedResetOptions extends ResetOptions {
  whatsappCli: boolean;
  openClawWorkspace: boolean;
  openClawUninstall: boolean;
}

async function brewUninstallWacli(): Promise<boolean> {
  const brewBin = await findCommand("brew");
  if (!brewBin) return false;
  return new Promise((resolve) => {
    execFile(brewBin, ["uninstall", "wacli"], { timeout: 30_000 }, (err) => {
      resolve(!err);
    });
  });
}

export async function POST(request: NextRequest) {
  let parsedBody: Partial<ExtendedResetOptions> | null = null;
  try {
    const body = await request.json() as Partial<ExtendedResetOptions>;
    if (body && typeof body === "object") {
      parsedBody = body;
    }
  } catch {
    parsedBody = null;
  }

  if (isE2EEnabled()) {
    resetE2EState();
    const mode = parsedBody?.openClawUninstall ? "clean" : "fresh";
    seedE2EState(mode);
    return NextResponse.json({ ok: true, reset: `e2e-${mode}` });
  }

  try {
    let options: ExtendedResetOptions = { ...ALL_RESET_OPTIONS, whatsappCli: true, openClawWorkspace: true, openClawUninstall: false };

    if (parsedBody) {
      options = {
        conversations: parsedBody.conversations ?? true,
        profile: parsedBody.profile ?? true,
        contextFiles: parsedBody.contextFiles ?? true,
        transcriptions: parsedBody.transcriptions ?? true,
        settings: parsedBody.settings ?? true,
        whatsappData: parsedBody.whatsappData ?? true,
        whatsappCli: parsedBody.whatsappCli ?? true,
        emailAccounts: parsedBody.emailAccounts ?? true,
        calendarAccounts: parsedBody.calendarAccounts ?? true,
        openClawWorkspace: parsedBody.openClawWorkspace ?? true,
        openClawUninstall: parsedBody.openClawUninstall ?? false,
      };
    }

    // Stop wacli auth if we're cleaning up WhatsApp
    if (options.whatsappData || options.whatsappCli) {
      try { stopWacliAuth(); } catch { /* best effort */ }
    }

    const result = resetClawJSWorkspace(options);

    // Async operations: WhatsApp CLI uninstall
    if (options.whatsappCli) {
      const binary = await findCommand("wacli");
      if (binary) {
        await brewUninstallWacli();
      }
    }

    // Disable OpenClaw workspace (not uninstall)
    if (options.openClawWorkspace) {
      try {
        resetOpenClawAgentData();
        removeClawJSFromOpenClawConfig();
        invalidateOpenClawAvailabilityCache();
      } catch { /* best effort */ }
      try {
        const localSettings = getClawJSLocalSettings();
        saveClawJSLocalSettings({ ...localSettings, openClawEnabled: false });
      } catch { /* best effort */ }
    }

    // Uninstall OpenClaw globally via the runtime adapter and verify it is gone.
    if (options.openClawUninstall) {
      try {
        resetOpenClawAgentData();
        removeClawJSFromOpenClawConfig();
        invalidateOpenClawAvailabilityCache();
      } catch { /* best effort */ }
      const uninstallResult = await uninstallAdapter("openclaw");
      if (!uninstallResult.success) {
        return NextResponse.json({
          error: uninstallResult.error || "Failed to uninstall OpenClaw",
        }, { status: 500 });
      }
      const openClawStillPresent = await findCommandFresh("openclaw");
      if (openClawStillPresent) {
        return NextResponse.json({
          error: `OpenClaw uninstall reported success, but the binary is still present at ${openClawStillPresent}.`,
        }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
