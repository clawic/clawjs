# Runtime Migration Notes

This repo keeps compatibility normalization logic for the current workspace snapshot path. When adapter behavior changes, prefer schema normalization over ad hoc file rewrites.

## Snapshot migration

Current compat snapshots live at:

- `.clawjs/compat/runtime-snapshot.json`

`migrateCompatSnapshot()` normalizes the current snapshot payload into the current compat schema. `repairWorkspace()` calls that normalization after it recreates the internal workspace layout.

## When runtime compatibility breaks

The compatibility contract is no longer tied to a single CLI surface. It is based on:

- adapter identity
- runtime version
- boolean capability summary
- typed `capabilityMap`
- adapter diagnostics

If a runtime changes behavior:

1. Normalize the new runtime output into the existing schemas.
2. Let `buildCompatDriftReport()` decide whether the stored snapshot is stale.
3. Only then update docs or caller code that depends on the new shape.

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

If you introduce a breaking runtime-compatibility change, bump the relevant schema version, keep the current-path normalization accurate, and document:

- what changed
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
