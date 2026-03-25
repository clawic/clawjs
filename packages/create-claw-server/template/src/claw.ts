import { Claw, type ClawInstance } from "@clawjs/claw";

const appId = "__APP_SLUG__";

let clawPromise: Promise<ClawInstance> | null = null;

export function getClaw() {
  clawPromise ??= Claw({
    runtime: {
      adapter: "demo",
    },
    workspace: {
      appId,
      workspaceId: appId,
      agentId: appId,
      rootDir: process.cwd(),
    },
  });

  return clawPromise;
}

export async function getClawSnapshot() {
  const claw = await getClaw();
  const runtime = await claw.runtime.status();
  const manifest = await claw.workspace.attach();

  if (!manifest) {
    return {
      ok: true,
      initialized: false,
      runtime,
    };
  }

  const inspection = await claw.workspace.inspect();
  const sessions = claw.conversations.listSessions();

  return {
    ok: true,
    initialized: true,
    runtime,
    manifestPath: inspection.manifestPath,
    workspace: {
      appId: manifest.appId,
      workspaceId: manifest.workspaceId,
      agentId: manifest.agentId,
    },
    sessions: {
      count: sessions.length,
      latestSessionId: sessions[0]?.sessionId ?? null,
    },
  };
}

export async function requireInitializedClaw() {
  const claw = await getClaw();
  const manifest = await claw.workspace.attach();
  if (!manifest) {
    return {
      ok: false as const,
      error: "Workspace is not initialized. Run `npm run claw:init` first.",
    };
  }

  return {
    ok: true as const,
    claw,
    manifest,
  };
}
