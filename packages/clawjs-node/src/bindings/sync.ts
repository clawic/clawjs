import path from "path";
import type { BindingDefinition } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import { applyTextMutation, previewDiff } from "../files/managed-blocks.ts";
import { resolveWorkspaceFileLockPath } from "../workspace/manager.ts";

export interface SyncBindingOptions<TSettings> {
  workspaceDir: string;
  binding: BindingDefinition;
  settings: TSettings;
  render: (settings: TSettings) => string;
  backupDir?: string;
  filesystem?: NodeFileSystemHost;
  dryRun?: boolean;
  createMissingOptionalBlock?: boolean;
}

export interface BindingSyncResult {
  filePath: string;
  changed: boolean;
  before: string;
  after: string;
}

export function syncBinding<TSettings>(options: SyncBindingOptions<TSettings>): BindingSyncResult {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const filePath = path.join(options.workspaceDir, options.binding.targetFile);
  const before = filesystem.tryReadText(filePath);
  const rendered = options.render(options.settings);
  if (
    options.binding.mode === "managed_block"
    && options.binding.required === false
    && options.createMissingOptionalBlock !== true
    && before.trim()
    && !before.includes(`<!-- CLAWJS:${options.binding.blockId}:START -->`)
  ) {
    return {
      filePath,
      ...previewDiff(before, before),
    };
  }
  const after = applyTextMutation({
    originalContent: before,
    mode: options.binding.mode,
    content: rendered,
    anchor: options.binding.anchor,
    blockId: options.binding.blockId,
  });

  if (!options.dryRun) {
    filesystem.withLock(resolveWorkspaceFileLockPath(options.workspaceDir, options.binding.targetFile), () => filesystem.writeTextAtomic(filePath, after, {
      backupDir: options.backupDir,
    }));
  }

  return {
    filePath,
    ...previewDiff(before, after),
  };
}
