import { execFile } from "child_process";
import { NextRequest, NextResponse } from "next/server";

import { resetClawJSWorkspace, resetOpenClawAgentData, removeClawJSFromOpenClawConfig, ALL_RESET_OPTIONS, type ResetOptions } from "@/lib/workspace-reset";
import { invalidateOpenClawAvailabilityCache } from "@/app/api/chat/route";
import { isE2EEnabled, resetE2EState, seedE2EState } from "@/lib/e2e";
import { getClawJSLocalSettings, saveClawJSLocalSettings } from "@/lib/local-settings";
import { findCommand } from "@/lib/platform";
import { stopWacliAuth } from "@/lib/wacli-runtime";

interface ExtendedResetOptions extends ResetOptions {
  whatsappCli: boolean;
  openClawWorkspace: boolean;
  openClawUninstall: boolean;
}

function npmUninstallOpenClaw(npmBinary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(npmBinary, ["uninstall", "-g", "openclaw"], { timeout: 60_000 }, (err) => {
      resolve(!err);
    });
  });
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
  if (isE2EEnabled()) {
    resetE2EState();
    seedE2EState("fresh");
    return NextResponse.json({ ok: true, reset: "e2e-fresh" });
  }

  try {
    let options: ExtendedResetOptions = { ...ALL_RESET_OPTIONS, whatsappCli: true, openClawWorkspace: true, openClawUninstall: false };

    try {
      const body = await request.json() as Partial<ExtendedResetOptions>;
      if (body && typeof body === "object") {
        options = {
          conversations: body.conversations ?? true,
          profile: body.profile ?? true,
          contextFiles: body.contextFiles ?? true,
          transcriptions: body.transcriptions ?? true,
          settings: body.settings ?? true,
          whatsappData: body.whatsappData ?? true,
          whatsappCli: body.whatsappCli ?? true,
          emailAccounts: body.emailAccounts ?? true,
          calendarAccounts: body.calendarAccounts ?? true,
          openClawWorkspace: body.openClawWorkspace ?? true,
          openClawUninstall: body.openClawUninstall ?? false,
        };
      }
    } catch {
      // No body or invalid JSON, use defaults (delete all)
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

    // Uninstall OpenClaw globally via npm
    if (options.openClawUninstall) {
      try {
        resetOpenClawAgentData();
        removeClawJSFromOpenClawConfig();
        invalidateOpenClawAvailabilityCache();
      } catch { /* best effort */ }
      const npmBinary = await findCommand("npm");
      if (npmBinary) {
        await npmUninstallOpenClaw(npmBinary);
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset workspace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
