import { execFile } from "child_process";

import { ensureClawWorkspaceReady, getClaw } from "@/lib/claw";
import { getE2EIntegrationStatus, isE2EEnabled, setE2EIntegrationStatus } from "@/lib/e2e";
import {
  getClawJSOpenClawContext,
  getClawJSOpenClawStatus,
  reconcileClawJSOpenClawDefaultModelWithAvailableAuth,
} from "@/lib/openclaw-agent";
import { findCommand, findCommandFresh } from "@/lib/platform";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Setup timed out")), ms)),
  ]);
}

function isBenignWorkspaceSetupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /already exists/i.test(message);
}

async function ensureGatewayRunning(): Promise<void> {
  const binary = await findCommandFresh("openclaw");
  if (!binary) return;

  const isRunning = await new Promise<boolean>((resolve) => {
    execFile(
      binary,
      ["gateway", "call", "--json", "--timeout", "3000", "--params", '{"probe":true,"timeoutMs":2000}', "channels.status"],
      { timeout: 8000 },
      (err) => resolve(!err),
    );
  });

  if (isRunning) return;

  await new Promise<void>((resolve) => {
    execFile(binary, ["gateway", "install"], { timeout: 15_000 }, () => resolve());
  });

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ready = await new Promise<boolean>((resolve) => {
      execFile(
        binary,
        ["gateway", "call", "--json", "--timeout", "3000", "--params", '{"probe":true,"timeoutMs":2000}', "channels.status"],
        { timeout: 8000 },
        (err) => resolve(!err),
      );
    });
    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

async function ensureWhisperInstalled(): Promise<void> {
  const hasWhisperCli = await findCommand("whisper-cli");
  if (hasWhisperCli) return;

  const binary = await findCommandFresh("openclaw");
  const brewPath = await findCommand("brew");

  if (brewPath) {
    await new Promise<void>((resolve) => {
      execFile(brewPath, ["install", "whisper-cpp"], { timeout: 120_000 }, () => resolve());
    });
  }

  if (binary) {
    await new Promise<void>((resolve) => {
      execFile(
        binary,
        ["gateway", "call", "--json", "--timeout", "60000", "--params", '{"name":"openai-whisper","installId":"brew"}', "skills.install"],
        { timeout: 65_000 },
        () => resolve(),
      );
    });
  }
}

export async function POST() {
  if (isE2EEnabled()) {
    const status = getE2EIntegrationStatus();
    const next = {
      ...status,
      openClaw: {
        ...status.openClaw,
        installed: true,
        cliAvailable: true,
        agentConfigured: true,
        modelConfigured: false,
        authConfigured: false,
        ready: false,
        needsSetup: false,
        needsAuth: true,
        lastError: null,
      },
    };
    setE2EIntegrationStatus(next);
    return Response.json({ ok: true, openClaw: next.openClaw });
  }

  try {
    const claw = await withTimeout(ensureClawWorkspaceReady(), 25_000);

    try {
      await withTimeout(claw.runtime.setupWorkspace(), 20_000);
    } catch (error) {
      if (!isBenignWorkspaceSetupError(error)) {
        // keep going and return real runtime status
      }
    }

    await withTimeout(reconcileClawJSOpenClawDefaultModelWithAvailableAuth(), 10_000).catch(() => null);

    void withTimeout(ensureGatewayRunning(), 30_000).catch(() => {
      // best effort; gateway bootstrap should not block onboarding
    });
    void withTimeout(ensureWhisperInstalled(), 130_000).catch(() => {
      // best effort; whisper bootstrap should not block onboarding
    });
    void withTimeout(claw.compat.refresh(), 15_000).catch(() => null);

    const status = await withTimeout(getClawJSOpenClawStatus(), 15_000);
    const ctx = getClawJSOpenClawContext();
    const liveClaw = await getClaw();
    const doctor = await withTimeout(liveClaw.doctor.run(), 10_000).catch(() => null);

    return Response.json({
      ok: status.ready,
      openClaw: {
        ...status,
        doctor,
        context: status.cliAvailable ? {
          agentId: ctx.agentId,
          workspaceDir: ctx.workspaceDir,
          stateDir: ctx.stateDir,
          agentDir: ctx.agentDir,
          agentName: ctx.configuredAgent?.name,
        } : undefined,
      },
    });
  } catch {
    return Response.json({
      ok: false,
      openClaw: {
        installed: false,
        cliAvailable: false,
        agentConfigured: false,
        modelConfigured: false,
        authConfigured: false,
        ready: false,
        needsSetup: true,
        needsAuth: true,
        lastError: "Setup timed out. Runtime may not be installed.",
        version: null,
        latestVersion: null,
        defaultModel: null,
      },
    });
  }
}
