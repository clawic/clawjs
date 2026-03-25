import fs from "fs";
import path from "path";
import crypto from "crypto";

import type { DiffPreview, ManagedBlockInspection, MergeManagedBlocksOptions } from "../files/managed-blocks.ts";
import { inspectManagedBlock, listManagedBlocks, mergeManagedBlocks, previewDiff } from "../files/managed-blocks.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { migrateCompatSnapshot } from "../compat/store.ts";
import { CLAWJS_DIR, initializeWorkspaceManifest, readWorkspaceManifest, resolveManifestPath } from "./manifest.ts";
import type { CompatSnapshot, WorkspaceConfig, ClawManifest, RuntimeFileDescriptor } from "@clawjs/core";

export const DEFAULT_RUNTIME_FILE_DESCRIPTORS: RuntimeFileDescriptor[] = [
  { key: "SOUL", path: "SOUL.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "USER", path: "USER.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "AGENTS", path: "AGENTS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "TOOLS", path: "TOOLS.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "IDENTITY", path: "IDENTITY.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
  { key: "HEARTBEAT", path: "HEARTBEAT.md", required: true, visibleToUser: true, seedPolicy: "seed_if_missing" },
];

export const CANONICAL_RUNTIME_FILES = DEFAULT_RUNTIME_FILE_DESCRIPTORS.map((descriptor) => descriptor.path) as readonly string[];

export interface WorkspaceValidationResult {
  ok: boolean;
  manifest: ClawManifest | null;
  missingFiles: string[];
  missingDirectories: string[];
}

export interface ResetWorkspaceOptions {
  removeManifest?: boolean;
  removeCompat?: boolean;
  removeProjections?: boolean;
  removeObserved?: boolean;
  removeIntents?: boolean;
  removeConversations?: boolean;
  removeAudit?: boolean;
  removeBackups?: boolean;
  removeLocks?: boolean;
  removeRuntimeFiles?: boolean;
}

export interface WorkspaceResetTarget {
  path: string;
  category:
    | "manifest"
    | "compat"
    | "projections"
    | "observed"
    | "intents"
    | "conversations"
    | "audit"
    | "backups"
    | "locks"
    | "runtime_file";
  exists: boolean;
}

export interface WorkspaceResetPlan {
  options: Required<ResetWorkspaceOptions>;
  targets: WorkspaceResetTarget[];
}

export interface WorkspaceResetResult {
  options: Required<ResetWorkspaceOptions>;
  removedPaths: string[];
  preservedPaths: string[];
}

export interface WorkspaceFilePreview extends DiffPreview {
  filePath: string;
  exists: boolean;
}

export interface WorkspaceFileInspection {
  filePath: string;
  exists: boolean;
  content: string;
  managedBlocks: ManagedBlockInspection[];
}

export interface PreserveManagedBlocksWriteOptions extends MergeManagedBlocksOptions {}

export interface WorkspaceRepairResult {
  manifest: ClawManifest;
  createdDirectories: string[];
  createdRuntimeFiles: string[];
  compatSnapshot: CompatSnapshot | null;
  compatSnapshotMigrated: boolean;
  compatSnapshotSourcePath: string | null;
}

function normalizeRuntimeDescriptors(runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS): RuntimeFileDescriptor[] {
  return runtimeFiles;
}

export function resolveRuntimeFilePath(workspaceDir: string, fileName: string): string {
  return path.join(workspaceDir, fileName);
}

export function resolveWorkspaceFilePath(workspaceDir: string, relativePath: string): string {
  return path.join(workspaceDir, relativePath);
}

export function resolveWorkspaceLockPath(workspaceDir: string): string {
  return path.join(workspaceDir, CLAWJS_DIR, "locks", ".workspace-mutation.lock");
}

export function resolveWorkspaceFileLockPath(workspaceDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const digest = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 12);
  return path.join(workspaceDir, CLAWJS_DIR, "locks", "files", `${digest}.lock`);
}

export function listManagedFiles(workspaceDir: string, runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS): string[] {
  return normalizeRuntimeDescriptors(runtimeFiles)
    .map((descriptor) => resolveRuntimeFilePath(workspaceDir, descriptor.path))
    .filter((filePath) => fs.existsSync(filePath));
}

export function readWorkspaceFile(workspaceDir: string, relativePath: string, filesystem = new NodeFileSystemHost()): string | null {
  const filePath = resolveWorkspaceFilePath(workspaceDir, relativePath);
  return filesystem.exists(filePath) ? filesystem.readText(filePath) : null;
}

export function writeWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
  content: string,
  filesystem = new NodeFileSystemHost()
): ReturnType<NodeFileSystemHost["writeTextAtomic"]> {
  const filePath = resolveWorkspaceFilePath(workspaceDir, relativePath);
  return filesystem.withLock(resolveWorkspaceFileLockPath(workspaceDir, relativePath), () => filesystem.writeTextAtomic(filePath, content));
}

export function previewWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
  content: string,
  filesystem = new NodeFileSystemHost()
): WorkspaceFilePreview {
  const filePath = resolveWorkspaceFilePath(workspaceDir, relativePath);
  const before = filesystem.tryReadText(filePath);
  const after = content.replace(/\r\n/g, "\n");
  return {
    filePath,
    exists: filesystem.exists(filePath),
    ...previewDiff(before, after),
  };
}

export function writeWorkspaceFilePreservingManagedBlocks(
  workspaceDir: string,
  relativePath: string,
  content: string,
  options: PreserveManagedBlocksWriteOptions = {},
  filesystem = new NodeFileSystemHost(),
): ReturnType<NodeFileSystemHost["writeTextAtomic"]> {
  const originalContent = readWorkspaceFile(workspaceDir, relativePath, filesystem) ?? "";
  const mergedContent = mergeManagedBlocks(originalContent, content, options);
  return writeWorkspaceFile(workspaceDir, relativePath, mergedContent, filesystem);
}

export function inspectWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
  filesystem = new NodeFileSystemHost()
): WorkspaceFileInspection {
  const filePath = resolveWorkspaceFilePath(workspaceDir, relativePath);
  const content = filesystem.tryReadText(filePath);
  return {
    filePath,
    exists: filesystem.exists(filePath),
    content,
    managedBlocks: listManagedBlocks(content),
  };
}

export function attachWorkspace(workspaceDir: string, filesystem = new NodeFileSystemHost()): ClawManifest | null {
  return readWorkspaceManifest(workspaceDir, filesystem);
}

export function validateWorkspace(
  workspaceDir: string,
  filesystem = new NodeFileSystemHost(),
  runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS,
): WorkspaceValidationResult {
  const manifest = readWorkspaceManifest(workspaceDir, filesystem);
  const missingFiles = normalizeRuntimeDescriptors(runtimeFiles)
    .filter((descriptor) => descriptor.required)
    .map((descriptor) => descriptor.path)
    .filter((fileName) => !filesystem.exists(resolveRuntimeFilePath(workspaceDir, fileName)));
  const missingDirectories = [
    path.join(workspaceDir, CLAWJS_DIR),
    path.join(workspaceDir, CLAWJS_DIR, "compat"),
    path.join(workspaceDir, CLAWJS_DIR, "projections"),
    path.join(workspaceDir, CLAWJS_DIR, "intents"),
    path.join(workspaceDir, CLAWJS_DIR, "audit"),
    path.join(workspaceDir, CLAWJS_DIR, "observed"),
  ].filter((dirPath) => !filesystem.exists(dirPath));

  return {
    ok: !!manifest && missingDirectories.length === 0 && missingFiles.length === 0,
    manifest,
    missingFiles,
    missingDirectories,
  };
}

export function initializeWorkspace(
  config: WorkspaceConfig,
  runtimeAdapter: string,
  filesystem = new NodeFileSystemHost(),
  templatePackPath?: string,
  runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS,
): ClawManifest {
  return filesystem.withLock(resolveWorkspaceLockPath(config.rootDir), () => {
    const manifest = initializeWorkspaceManifest(config, runtimeAdapter, filesystem, templatePackPath);
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "compat"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "projections"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "intents"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "audit"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "observed"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "backups"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "locks"));
    filesystem.ensureDir(path.join(config.rootDir, CLAWJS_DIR, "conversations"));
    for (const descriptor of normalizeRuntimeDescriptors(runtimeFiles)) {
      if (descriptor.seedPolicy === "never") continue;
      const filePath = resolveRuntimeFilePath(config.rootDir, descriptor.path);
      if (!filesystem.exists(filePath)) {
        filesystem.writeTextAtomic(filePath, "");
      }
    }
    return manifest;
  });
}

function ensureDir(filesystem: NodeFileSystemHost, dirPath: string, createdDirectories: string[]): void {
  if (!filesystem.exists(dirPath)) {
    createdDirectories.push(dirPath);
  }
  filesystem.ensureDir(dirPath);
}

export function repairWorkspace(
  config: WorkspaceConfig,
  runtimeAdapter: string,
  filesystem = new NodeFileSystemHost(),
  templatePackPath?: string,
  runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS,
): WorkspaceRepairResult {
  return filesystem.withLock(resolveWorkspaceLockPath(config.rootDir), () => {
    const createdDirectories: string[] = [];
    const createdRuntimeFiles: string[] = [];

    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "compat"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "projections"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "intents"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "audit"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "observed"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "backups"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "locks"), createdDirectories);
    ensureDir(filesystem, path.join(config.rootDir, CLAWJS_DIR, "conversations"), createdDirectories);

    const manifest = readWorkspaceManifest(config.rootDir, filesystem) ?? initializeWorkspaceManifest(config, runtimeAdapter, filesystem, templatePackPath);

    for (const descriptor of normalizeRuntimeDescriptors(runtimeFiles)) {
      if (descriptor.seedPolicy === "never") continue;
      const filePath = resolveRuntimeFilePath(config.rootDir, descriptor.path);
      if (!filesystem.exists(filePath)) {
        filesystem.writeTextAtomic(filePath, "");
        createdRuntimeFiles.push(filePath);
      }
    }

    const compatMigration = migrateCompatSnapshot(config.rootDir, filesystem);

    return {
      manifest,
      createdDirectories,
      createdRuntimeFiles,
      compatSnapshot: compatMigration.snapshot,
      compatSnapshotMigrated: compatMigration.migrated,
      compatSnapshotSourcePath: compatMigration.sourcePath,
    };
  });
}

export function buildWorkspaceResetPlan(
  workspaceDir: string,
  options: ResetWorkspaceOptions = {},
  filesystem = new NodeFileSystemHost(),
  runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS,
): WorkspaceResetPlan {
  const defaults: Required<ResetWorkspaceOptions> = {
    removeManifest: true,
    removeCompat: true,
    removeProjections: true,
    removeObserved: true,
    removeIntents: true,
    removeConversations: true,
    removeAudit: true,
    removeBackups: false,
    removeLocks: false,
    removeRuntimeFiles: false,
  };
  const effective = { ...defaults, ...options };

  const targets: WorkspaceResetTarget[] = [];
  if (effective.removeManifest) {
    const targetPath = resolveManifestPath(workspaceDir);
    targets.push({ path: targetPath, category: "manifest", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeCompat) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "compat");
    targets.push({ path: targetPath, category: "compat", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeProjections) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "projections");
    targets.push({ path: targetPath, category: "projections", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeObserved) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "observed");
    targets.push({ path: targetPath, category: "observed", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeIntents) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "intents");
    targets.push({ path: targetPath, category: "intents", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeConversations) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "conversations");
    targets.push({ path: targetPath, category: "conversations", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeAudit) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "audit");
    targets.push({ path: targetPath, category: "audit", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeBackups) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "backups");
    targets.push({ path: targetPath, category: "backups", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeLocks) {
    const targetPath = path.join(workspaceDir, CLAWJS_DIR, "locks");
    targets.push({ path: targetPath, category: "locks", exists: filesystem.exists(targetPath) });
  }
  if (effective.removeRuntimeFiles) {
    for (const descriptor of normalizeRuntimeDescriptors(runtimeFiles)) {
      const targetPath = resolveRuntimeFilePath(workspaceDir, descriptor.path);
      targets.push({ path: targetPath, category: "runtime_file", exists: filesystem.exists(targetPath) });
    }
  }

  return {
    options: effective,
    targets,
  };
}

export function resetWorkspace(
  workspaceDir: string,
  options: ResetWorkspaceOptions = {},
  filesystem = new NodeFileSystemHost(),
  runtimeFiles: RuntimeFileDescriptor[] = DEFAULT_RUNTIME_FILE_DESCRIPTORS,
): WorkspaceResetResult {
  return filesystem.withLock(resolveWorkspaceLockPath(workspaceDir), () => {
    const plan = buildWorkspaceResetPlan(workspaceDir, options, filesystem, runtimeFiles);
    const removedPaths: string[] = [];
    const preservedPaths: string[] = [];

    for (const target of plan.targets) {
      if (target.exists) {
        filesystem.remove(target.path);
        removedPaths.push(target.path);
      } else {
        preservedPaths.push(target.path);
      }
    }

    return {
      options: plan.options,
      removedPaths,
      preservedPaths,
    };
  });
}

export function inspectManagedWorkspaceFile(
  workspaceDir: string,
  relativePath: string,
  blockId: string,
  filesystem = new NodeFileSystemHost()
): ManagedBlockInspection {
  const content = readWorkspaceFile(workspaceDir, relativePath, filesystem) ?? "";
  return inspectManagedBlock(content, blockId);
}
