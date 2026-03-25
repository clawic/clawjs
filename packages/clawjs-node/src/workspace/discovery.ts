import fs from "fs";
import path from "path";

import type { ClawManifest } from "@clawjs/core";

import { CLAWJS_DIR, readWorkspaceManifest, resolveManifestPath } from "./manifest.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";

export interface DiscoveredWorkspace {
  rootDir: string;
  manifestPath: string;
  manifest: ClawManifest | null;
}

export interface DiscoverWorkspacesOptions {
  roots: string[];
  maxDepth?: number;
  filesystem?: NodeFileSystemHost;
}

function scanDirectory(
  root: string,
  currentDepth: number,
  maxDepth: number,
  filesystem: NodeFileSystemHost,
  seen: Set<string>,
  found: DiscoveredWorkspace[],
): void {
  if (currentDepth > maxDepth) return;
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return;

  const manifestPath = resolveManifestPath(root);
  if (filesystem.exists(manifestPath) && !seen.has(root)) {
    seen.add(root);
    found.push({
      rootDir: root,
      manifestPath,
      manifest: readWorkspaceManifest(root, filesystem),
    });
    return;
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    if (entry.name === CLAWJS_DIR && root !== path.dirname(root)) continue;
    scanDirectory(path.join(root, entry.name), currentDepth + 1, maxDepth, filesystem, seen, found);
  }
}

export function discoverWorkspaces(options: DiscoverWorkspacesOptions): DiscoveredWorkspace[] {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const maxDepth = Math.max(0, options.maxDepth ?? 4);
  const seen = new Set<string>();
  const found: DiscoveredWorkspace[] = [];

  for (const root of options.roots) {
    scanDirectory(path.resolve(root), 0, maxDepth, filesystem, seen, found);
  }

  return found.sort((left, right) => left.rootDir.localeCompare(right.rootDir));
}
