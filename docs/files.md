---
title: Files & Templates
description: Template packs, managed blocks, binding sync, and workspace-file IO.
---

# Files & Templates

The ClawJS file surface combines declarative template packs,
managed-block utilities, binding sync, and workspace-file IO. This page
reflects the actual public API shipped by `@clawjs/claw`.

## claw.files Methods

| Method | Description |
|----|----|
| `applyTemplatePack(templatePackPath?, options?)` | Loads a template pack from disk and applies it to the current workspace. |
| `diffBinding(binding, settings, render)` | Previews the result of a binding sync without writing. |
| `syncBinding(binding, settings, render)` | Applies a single binding to its target file. |
| `readBindingStore()`, `writeBindingStore(bindings)` | Read or replace the binding store under `.clawjs/projections/file-bindings.json`. |
| `readSettingsSchema()`, `writeSettingsSchema(schema)` | Read or replace the persisted schema under `.clawjs/projections/settings-schema.json`. |
| `readSettingsValues()`, `writeSettingsValues(values)` | Read or replace file-setting intent under `.clawjs/intents/files.json`. |
| `validateSettings(values)` | Validates candidate settings against the persisted schema. |
| `renderTemplate(template, values)` | Renders a settings template string with plain object values. |
| `updateSettings(values, options)` | Updates persisted settings values and optionally auto-syncs bindings. |
| `readWorkspaceFile(path)` | Reads a workspace-relative file and returns `string | null`. |
| `writeWorkspaceFile(path, content)` | Atomically replaces a workspace-relative file. |
| `writeWorkspaceFilePreservingManagedBlocks(path, content, options?)` | Writes a file while restoring managed blocks from the current on-disk version. |
| `previewWorkspaceFile(path, content)` | Returns a file-level diff preview without writing. |
| `inspectWorkspaceFile(path)` | Returns the current content plus discovered managed blocks. |
| `inspectManagedBlock(path, blockId)` | Inspects one managed block in one workspace-relative file. |
| `mergeManagedBlocks(original, edited, options?)` | Merges managed blocks from an original string into an edited string. |

## Template Packs

Template packs are serialized `TemplatePack` documents. The
runtime-facing API takes a file path, not an in-memory object.

```ts
await claw.files.applyTemplatePack("./packs/base.json");

import { loadTemplatePack } from "@clawjs/claw";

const pack = loadTemplatePack("./packs/base.json");
console.log(pack.id, pack.mutations.length);

interface TemplatePack {
  schemaVersion: number;
  id: string;
  name: string;
  mutations: TemplateMutation[];
}
```
The supported mutation modes are `seed_if_missing`, `replace_full`,
`prepend`, `append`, `insert_before_anchor`, `insert_after_anchor`, and
`managed_block`.

## Managed Blocks

Managed blocks use the exact marker format
`<!-- CLAWJS:block-id:START -->` and `<!-- CLAWJS:block-id:END -->`.

```ts
import {
  managedBlockMarkers,
  renderManagedBlock,
  inspectManagedBlock,
  extractManagedBlock,
  listManagedBlocks,
  listManagedBlockProblems,
  previewManagedBlockMutation,
  mergeManagedBlocks,
} from "@clawjs/claw";

const markers = managedBlockMarkers("tone");
const serialized = renderManagedBlock("tone", "Use direct language.");
const inspection = inspectManagedBlock(serialized, "tone");
const content = extractManagedBlock(serialized, "tone");
const blocks = listManagedBlocks(serialized);
const problems = listManagedBlockProblems(serialized);
const preview = previewManagedBlockMutation(serialized, "tone", "Use formal language.");
const merged = mergeManagedBlocks(serialized, "# user edits");
```
| Helper | Notes |
|----|----|
| `managedBlockMarkers(blockId)` | Returns the exact start/end marker strings. |
| `renderManagedBlock(blockId, blockContent)` | Serializes a full managed block with markers. |
| `inspectManagedBlock(content, blockId)` | Returns `exists`, indexes, markers, full content, and inner content. |
| `extractManagedBlock(content, blockId)` | Returns the full serialized block content as a string. |
| `listManagedBlocks(content)` | Returns `ManagedBlockInspection[]`. |
| `listManagedBlockProblems(content)` | Detects missing or duplicate markers. |
| `previewManagedBlockMutation(original, blockId, content)` | Returns the before/after preview for a single block update. |
| `mergeManagedBlocks(original, edited, options?)` | Reinserts managed blocks into edited content, optionally for selected block ids only. |

## Binding Sync

A binding is explicit. You pass the binding definition, the current
settings object, and the renderer every time you preview or apply it.

```ts
import type { BindingDefinition } from "@clawjs/core";

const binding: BindingDefinition = {
  id: "tone",
  targetFile: "SOUL.md",
  mode: "managed_block",
  blockId: "tone",
  settingsPath: "tone",
};

const preview = claw.files.diffBinding(
  binding,
  { tone: "direct" },
  (settings) => `tone=${settings.tone}`,
);

const applied = claw.files.syncBinding(
  binding,
  { tone: "direct" },
  (settings) => `tone=${settings.tone}`,
);
```
There is no `registerBinding()` method. Persist projections and
file-setting intent through the explicit store methods instead:

```text
claw.files.writeBindingStore([binding]);
claw.files.writeSettingsSchema({
  type: "object",
  properties: {
    tone: { type: "string" },
  },
});
claw.files.writeSettingsValues({ tone: "direct" });

const update = claw.files.updateSettings(
  { tone: "formal" },
  {
    autoSync: true,
    renderers: {
      tone: (settings) => `tone=${String(settings.tone ?? "")}`,
    },
  },
);
```
## Workspace File IO

```ts
const current = claw.files.readWorkspaceFile("SOUL.md");

const writeResult = claw.files.writeWorkspaceFile("SOUL.md", "# Soul\n");
const preserved = claw.files.writeWorkspaceFilePreservingManagedBlocks("SOUL.md", "# Soul\n");
const filePreview = claw.files.previewWorkspaceFile("SOUL.md", "# Soul\n");
const fileInspection = claw.files.inspectWorkspaceFile("SOUL.md");
const blockInspection = claw.files.inspectManagedBlock("SOUL.md", "tone");
```
`writeWorkspaceFile` and `writeWorkspaceFilePreservingManagedBlocks`
return an `AtomicWriteResult` with `changed` and `filePath`. File
previews return `WorkspaceFilePreview`, which extends the generic diff
preview with `filePath` and `exists`.

## Low-Level Helpers

The package also exports `applyTextMutation`, `previewDiff`,
`createTemplateRenderer`, `renderSettingsTemplate`, `readBindingStore`,
`writeBindingStore`, `readWorkspaceFile`, `writeWorkspaceFile`,
`previewWorkspaceFile`, `inspectWorkspaceFile`, and the related
`resolve*` helpers for callers that need to work below the instance
layer.

For the longer repository-level narrative around template packs and bindings, see [Template Packs and Bindings](/template-packs-and-bindings).
