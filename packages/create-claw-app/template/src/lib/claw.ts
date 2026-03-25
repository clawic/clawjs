import { Claw } from "@clawjs/claw";

const appId = "__APP_SLUG__";

export async function getClawSnapshot() {
  const claw = await Claw({
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
  };
}
