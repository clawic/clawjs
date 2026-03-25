import fs from "fs";
import path from "path";
import { templatePackSchema, type TemplateMutation, type TemplatePack } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import { resolveWorkspaceFileLockPath } from "../workspace/manager.ts";
import { applyTextMutation } from "./managed-blocks.ts";

export interface ApplyTemplatePackOptions {
  workspaceDir: string;
  backupDir?: string;
  filesystem?: NodeFileSystemHost;
}

export interface AppliedTemplateMutation {
  targetFile: string;
  changed: boolean;
}

export function loadTemplatePack(templatePackPath: string): TemplatePack {
  const raw = fs.readFileSync(templatePackPath, "utf8");
  return templatePackSchema.parse(JSON.parse(raw));
}

function resolveMutationContent(templatePackPath: string, mutation: TemplateMutation): string {
  if (typeof mutation.content === "string") {
    return mutation.content;
  }

  const sidecarPath = path.join(
    path.dirname(templatePackPath),
    mutation.targetFile
  );
  if (!fs.existsSync(sidecarPath)) {
    throw new Error(`Missing template content for ${mutation.targetFile}`);
  }
  return fs.readFileSync(sidecarPath, "utf8");
}

export function applyTemplatePack(templatePackPath: string, options: ApplyTemplatePackOptions): AppliedTemplateMutation[] {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const pack = loadTemplatePack(templatePackPath);
  const results: AppliedTemplateMutation[] = [];

  for (const mutation of pack.mutations) {
    const filePath = path.join(options.workspaceDir, mutation.targetFile);
    const before = filesystem.tryReadText(filePath);
    const after = applyTextMutation({
      originalContent: before,
      mode: mutation.mode,
      content: resolveMutationContent(templatePackPath, mutation),
      anchor: mutation.anchor,
      blockId: mutation.blockId,
    });
    const result = filesystem.withLock(resolveWorkspaceFileLockPath(options.workspaceDir, mutation.targetFile), () => filesystem.writeTextAtomic(filePath, after, {
      backupDir: options.backupDir,
    }));
    results.push({
      targetFile: mutation.targetFile,
      changed: result.changed,
    });
  }

  return results;
}
