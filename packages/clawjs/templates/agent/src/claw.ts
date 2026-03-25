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

export async function getAgentSnapshot() {
  const claw = await getClaw();
  const runtime = await claw.runtime.status();
  const manifest = await claw.workspace.attach();
  const memory = await claw.memory.list();
  const skills = await claw.skills.list();
  const schedulers = await claw.scheduler.list();
  const sessions = claw.conversations.listSessions();

  return {
    runtime,
    initialized: !!manifest,
    workspace: manifest ? {
      appId: manifest.appId,
      workspaceId: manifest.workspaceId,
      agentId: manifest.agentId,
    } : null,
    memory,
    skills,
    schedulers,
    sessions,
  };
}
