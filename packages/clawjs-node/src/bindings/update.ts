import path from "path";
import type { BindingDefinition } from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import { syncBinding, type BindingSyncResult } from "./sync.ts";
import {
  type SettingsValidationIssue,
  type SettingsValuesRecord,
  validateSettingsUpdate,
  writeSettingsValuesRecord,
} from "./store.ts";

export interface UpdateBindingSettingsOptions {
  workspaceDir: string;
  bindings: BindingDefinition[];
  settingsSchema: Record<string, unknown>;
  values: Record<string, unknown>;
  renderers: Record<string, (settings: Record<string, unknown>) => string>;
  filesystem?: NodeFileSystemHost;
  autoSync?: boolean;
  reenableOptionalBindings?: string[];
}

export interface UpdateBindingSettingsResult {
  settings: SettingsValuesRecord;
  validationIssues: SettingsValidationIssue[];
  syncResults: BindingSyncResult[];
}

export function updateBindingSettings(options: UpdateBindingSettingsOptions): UpdateBindingSettingsResult {
  const validationIssues = validateSettingsUpdate(options.settingsSchema, options.values);
  if (validationIssues.length > 0) {
    throw new Error(`Invalid settings update: ${validationIssues.map((issue) => `${issue.path} ${issue.message}`).join(", ")}`);
  }

  const settings = writeSettingsValuesRecord(options.workspaceDir, options.values, options.filesystem);
  if (!options.autoSync) {
    return {
      settings,
      validationIssues,
      syncResults: [],
    };
  }

  const backupDir = path.join(options.workspaceDir, ".clawjs", "backups");
  const syncResults = options.bindings.flatMap((binding) => {
    const render = options.renderers[binding.id];
    if (!render) return [];
    return [syncBinding({
      workspaceDir: options.workspaceDir,
      binding,
      settings: options.values,
      render,
      filesystem: options.filesystem,
      backupDir,
      createMissingOptionalBlock: binding.required !== false
        || (options.reenableOptionalBindings ?? []).includes(binding.id),
    })];
  });

  return {
    settings,
    validationIssues,
    syncResults,
  };
}
