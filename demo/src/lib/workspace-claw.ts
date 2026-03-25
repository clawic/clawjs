/**
 * Workspace-enabled ClawInstance for the demo.
 *
 * Extends the base ClawInstance with tasks, notes, people, inbox, events,
 * search, context, ui, and workspaceIndex capabilities from @clawjs/workspace.
 */
import {
  extendClawWithWorkspace,
  type WorkspaceClawInstance,
} from "@clawjs/workspace";
import { getClaw, resolveClawJSWorkspaceDir } from "./claw.ts";

let wsClawPromise: Promise<WorkspaceClawInstance> | null = null;

export async function getWorkspaceClaw(): Promise<WorkspaceClawInstance> {
  if (!wsClawPromise) {
    wsClawPromise = (async () => {
      const claw = await getClaw();
      const workspaceDir = resolveClawJSWorkspaceDir();
      return extendClawWithWorkspace(claw, { workspaceDir });
    })();
  }
  return wsClawPromise;
}
