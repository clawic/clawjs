# Runtime Migration Notes

This repo already has compatibility migration logic. When adapter behavior changes, prefer a migration path over ad hoc file rewrites.

## Snapshot migration

Current compat snapshots live at:

- `.clawjs/compat/runtime-snapshot.json`

Legacy files that are still migrated automatically:

- `.clawjs/compat.json`
- `.clawjs/runtime-snapshot.json`

`migrateCompatSnapshot()` normalizes those legacy layouts into the current compat snapshot schema. `repairWorkspace()` calls that migration after it recreates the internal workspace layout.

## When runtime compatibility breaks

The compatibility contract is no longer tied to a single CLI surface. It is based on:

- adapter identity
- runtime version
- boolean capability summary
- typed `capabilityMap`
- adapter diagnostics

If a runtime changes behavior:

1. Preserve the old data shape long enough to read legacy snapshots.
2. Normalize the new runtime output into the existing schemas.
3. Let `buildCompatDriftReport()` decide whether the stored snapshot is stale.
4. Only then update docs or caller code that depends on the new shape.

Examples of adapter-specific probe surfaces that may drift:

- `openclaw --version`
- `openclaw models status --json`
- `zeroclaw providers`
- `zeroclaw models refresh`
- `picoclaw model_list --json`
- `nanobot`, `nanoclaw`, `nullclaw`, `ironclaw`, `nemoclaw`, or `hermes` config and catalog commands

## Schema versions

The JSON records stored by ClawJS all carry a `schemaVersion`. That includes:

- workspace manifest
- compat snapshot
- capability report
- workspace state snapshots
- provider state snapshots
- scheduler, memory, skills, and channels snapshots
- template pack schema

If you introduce a breaking runtime-compatibility change, bump the relevant schema version, keep a migration path for the previous one, and document:

- what changed
- which files are migrated automatically
- which commands or APIs now require a fresh `compat --refresh` or `workspace repair`

## Practical recovery path

If a workspace is partially broken after an adapter upgrade, the usual recovery sequence is:

```bash
claw \
  --runtime zeroclaw \
  compat \
  --workspace /path/to/workspace \
  --refresh

claw \
  --runtime zeroclaw \
  doctor \
  --workspace /path/to/workspace

claw \
  --runtime zeroclaw \
  workspace repair \
  --workspace /path/to/workspace
```

That sequence refreshes the runtime snapshot, checks drift, and repairs the managed workspace layout without touching unrelated user files.
