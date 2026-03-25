# Template Packs and Settings-to-File Bindings

ClawJS treats file mutations as structured operations instead of raw string replacement.

## Template packs

The template pack schema is `schemaVersion`, `id`, `name`, and `mutations[]`. The supported mutation modes are:

- `seed_if_missing`
- `replace_full`
- `prepend`
- `append`
- `insert_before_anchor`
- `insert_after_anchor`
- `managed_block`

Each mutation targets a relative path under the workspace root. `content` may be inline, or omitted if the pack ships a sidecar file at the same relative path next to `template-pack.json`.

Example:

```json
{
  "schemaVersion": 1,
  "id": "starter",
  "name": "Starter Pack",
  "mutations": [
    {
      "targetFile": "SOUL.md",
      "mode": "seed_if_missing",
      "content": "# Soul\n"
    },
    {
      "targetFile": "SOUL.md",
      "mode": "managed_block",
      "blockId": "persona",
      "content": "tone = \"direct\""
    }
  ]
}
```

Apply a pack from the CLI:

```bash
claw \
  files apply-template-pack \
  --workspace /path/to/workspace \
  --template-pack /path/to/template-pack.json
```

From the Node API:

```ts
const result = await claw.files.applyTemplatePack("/path/to/template-pack.json");
```

## Settings-to-file bindings

Bindings are stored in `.clawjs/projections/file-bindings.json`, and the settings schema record is stored in `.clawjs/projections/settings-schema.json`.

Persisted settings values now live in `.clawjs/intents/files.json`, because file settings are part of the SDK-owned intent layer rather than a runtime snapshot.

The binding definition has these important fields:

- `id`
- `targetFile`
- `mode`
- `blockId`
- `anchor`
- `required`
- `visibleToUser`
- `settingsPath`

The `mode` values on bindings are the file-mutation subset:

- `managed_block`
- `insert_before_anchor`
- `insert_after_anchor`
- `append`
- `prepend`

Use `diffBinding` for a dry-run preview and `syncBinding` to write the file:

```ts
const binding = {
  id: "tone",
  targetFile: "SOUL.md",
  mode: "managed_block",
  blockId: "tone",
  settingsPath: "tone",
};

const preview = claw.files.diffBinding(binding, { tone: "direct" }, (settings) => `tone=${settings.tone}`);
const applied = claw.files.syncBinding(binding, { tone: "direct" }, (settings) => `tone=${settings.tone}`);
```

If you are storing the binding definitions themselves, use:

```ts
await claw.files.writeBindingStore([binding]);
await claw.files.writeSettingsSchema({
  tone: { type: "string" },
});
```

## Managed blocks

Managed blocks are delimited with:

```md
<!-- CLAWJS:persona:START -->
...
<!-- CLAWJS:persona:END -->
```

The helper APIs surface inspection and preview data so callers can detect malformed or duplicated block markers before syncing.
