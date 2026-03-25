import path from "path";
import { z } from "zod";
import type { BindingDefinition } from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

const bindingRecordSchema = z.object({
  schemaVersion: z.number().int().positive(),
  bindings: z.array(z.object({
    id: z.string().min(1),
    targetFile: z.string().min(1),
    mode: z.enum(["managed_block", "insert_before_anchor", "insert_after_anchor", "append", "prepend"]),
    blockId: z.string().optional(),
    anchor: z.string().optional(),
    required: z.boolean().optional(),
    visibleToUser: z.boolean().optional(),
    settingsPath: z.string().min(1),
  })),
});

const settingsSchemaRecordSchema = z.object({
  schemaVersion: z.number().int().positive(),
  settingsSchema: z.record(z.unknown()),
});

const settingsValuesRecordSchema = z.object({
  schemaVersion: z.number().int().positive(),
  values: z.record(z.unknown()),
});

export interface BindingStoreRecord {
  schemaVersion: number;
  bindings: BindingDefinition[];
}

export interface SettingsSchemaRecord {
  schemaVersion: number;
  settingsSchema: Record<string, unknown>;
}

export interface SettingsValuesRecord {
  schemaVersion: number;
  values: Record<string, unknown>;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface SettingsValidationIssue {
  path: string;
  message: string;
}

export function resolveBindingsPath(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "projections", "file-bindings.json");
}

export function resolveSettingsSchemaPath(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "projections", "settings-schema.json");
}

export function resolveSettingsValuesPath(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "intents", "files.json");
}

export function readBindingStore(workspaceDir: string, filesystem = new NodeFileSystemHost()): BindingStoreRecord {
  try {
    return bindingRecordSchema.parse(JSON.parse(filesystem.readText(resolveBindingsPath(workspaceDir))));
  } catch {
    return { schemaVersion: 1, bindings: [] };
  }
}

export function writeBindingStore(workspaceDir: string, bindings: BindingDefinition[], filesystem = new NodeFileSystemHost()): BindingStoreRecord {
  const record: BindingStoreRecord = {
    schemaVersion: 1,
    bindings,
  };
  const filePath = resolveBindingsPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify(record, null, 2)}\n`));
  return record;
}

export function readSettingsSchemaRecord(workspaceDir: string, filesystem = new NodeFileSystemHost()): SettingsSchemaRecord {
  try {
    return settingsSchemaRecordSchema.parse(JSON.parse(filesystem.readText(resolveSettingsSchemaPath(workspaceDir))));
  } catch {
    return { schemaVersion: 1, settingsSchema: {} };
  }
}

export function writeSettingsSchemaRecord(workspaceDir: string, settingsSchema: Record<string, unknown>, filesystem = new NodeFileSystemHost()): SettingsSchemaRecord {
  const record: SettingsSchemaRecord = {
    schemaVersion: 1,
    settingsSchema,
  };
  const filePath = resolveSettingsSchemaPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify(record, null, 2)}\n`));
  return record;
}

export function readSettingsValuesRecord(workspaceDir: string, filesystem = new NodeFileSystemHost()): SettingsValuesRecord {
  try {
    return settingsValuesRecordSchema.parse(JSON.parse(filesystem.readText(resolveSettingsValuesPath(workspaceDir))));
  } catch {
    return { schemaVersion: 1, values: {} };
  }
}

export function writeSettingsValuesRecord(workspaceDir: string, values: Record<string, unknown>, filesystem = new NodeFileSystemHost()): SettingsValuesRecord {
  const record: SettingsValuesRecord = {
    schemaVersion: 1,
    values,
  };
  const filePath = resolveSettingsValuesPath(workspaceDir);
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => filesystem.writeTextAtomic(filePath, `${JSON.stringify({
    ...record,
    updatedAt: nowIso(),
  }, null, 2)}\n`));
  return record;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function validateSettingsNode(schemaNode: unknown, value: unknown, currentPath: string): SettingsValidationIssue[] {
  if (!isPlainObject(schemaNode)) return [];
  const expectedType = typeof schemaNode.type === "string" ? schemaNode.type : null;
  if (!expectedType) return [];

  switch (expectedType) {
    case "string":
      return typeof value === "string" ? [] : [{ path: currentPath, message: "expected string" }];
    case "number":
      return typeof value === "number" ? [] : [{ path: currentPath, message: "expected number" }];
    case "boolean":
      return typeof value === "boolean" ? [] : [{ path: currentPath, message: "expected boolean" }];
    case "array":
      if (!Array.isArray(value)) return [{ path: currentPath, message: "expected array" }];
      return Array.isArray(schemaNode.items)
        ? []
        : value.flatMap((entry, index) => validateSettingsNode(schemaNode.items, entry, `${currentPath}[${index}]`));
    case "object": {
      if (!isPlainObject(value)) return [{ path: currentPath, message: "expected object" }];
      const properties = isPlainObject(schemaNode.properties) ? schemaNode.properties : {};
      const required = Array.isArray(schemaNode.required)
        ? schemaNode.required.filter((entry): entry is string => typeof entry === "string")
        : [];
      const issues: SettingsValidationIssue[] = [];
      for (const key of required) {
        if (!(key in value)) {
          issues.push({ path: `${currentPath}.${key}`, message: "missing required value" });
        }
      }
      for (const [key, propertySchema] of Object.entries(properties)) {
        if (!(key in value)) continue;
        issues.push(...validateSettingsNode(propertySchema, value[key], `${currentPath}.${key}`));
      }
      return issues;
    }
    default:
      return [];
  }
}

export function validateSettingsUpdate(settingsSchema: Record<string, unknown>, values: Record<string, unknown>): SettingsValidationIssue[] {
  const issues: SettingsValidationIssue[] = [];
  for (const [key, schemaNode] of Object.entries(settingsSchema)) {
    if (!(key in values)) continue;
    issues.push(...validateSettingsNode(schemaNode, values[key], key));
  }
  return issues;
}
