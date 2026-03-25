import path from "path";
import type { WorkspaceConfig, ClawManifest } from "@clawjs/core";
import { createManifest } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";

export const CLAWJS_DIR = ".clawjs";

export function resolveManifestPath(workspaceDir: string): string {
  return path.join(workspaceDir, CLAWJS_DIR, "manifest.json");
}

export function initializeWorkspaceManifest(
  config: WorkspaceConfig,
  runtimeAdapter: string,
  filesystem = new NodeFileSystemHost(),
  templatePackPath?: string
): ClawManifest {
  const manifest = createManifest(config, runtimeAdapter, templatePackPath);
  const manifestPath = resolveManifestPath(config.rootDir);
  filesystem.writeTextAtomic(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function readWorkspaceManifest(
  workspaceDir: string,
  filesystem = new NodeFileSystemHost()
): ClawManifest | null {
  try {
    return JSON.parse(filesystem.readText(resolveManifestPath(workspaceDir))) as ClawManifest;
  } catch {
    return null;
  }
}
