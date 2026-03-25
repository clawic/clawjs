# Auth, Compat, and Doctor

ClawJS keeps auth, runtime compatibility, and workspace health in separate stores so they can be refreshed independently across runtime adapters.

## Auth flows

The Node API exposes:

- `claw.providers.list()`
- `claw.providers.catalog()`
- `claw.providers.authState()`
- `claw.auth.status()`
- `claw.auth.diagnostics(provider?)`
- `claw.auth.login(provider, { setDefault?, env? })`
- `claw.auth.setApiKey(provider, key, profileId?)`
- `claw.auth.saveApiKey(provider, key, options?)`
- `claw.auth.removeProvider(provider, legacyAgentDirs?)`

CLI equivalents:

```bash
claw \
  --runtime zeroclaw \
  auth status

claw \
  --runtime zeroclaw \
  auth login \
  --provider openai

claw \
  --runtime zeroclaw \
  auth remove \
  --provider openai
```

`auth login` is adapter-driven. Some adapters normalize aliases before launching a CLI login flow, while others persist credentials through config or auth-store files. ClawJS exposes the same high-level methods either way.

If you need to persist a manual API key without an interactive flow, use `setApiKey` or `saveApiKey`.

## Compat refresh and drift

`claw.compat.refresh()` probes the selected adapter, writes `.clawjs/compat/runtime-snapshot.json`, writes `.clawjs/compat/capability-report.json`, and refreshes the runtime-derived snapshots under `.clawjs/observed/`.

The CLI mirror is:

```bash
claw \
  --runtime zeroclaw \
  compat \
  --workspace /path/to/workspace

claw \
  --runtime zeroclaw \
  compat \
  --workspace /path/to/workspace \
  --refresh
```

`compat --refresh` returns a non-zero exit code when the probe is degraded.

Drift detection looks for mismatches between the stored snapshot and the current probe, including:

- `runtime_adapter`
- `runtime_version`
- `version_family`
- `capability_signature`
- `capability_map`

## What doctor means here

`doctor` combines:

- runtime health
- compat drift
- workspace validation
- managed block inspection
- provider/auth summaries
- scheduler, memory, skills, and channels snapshots

```bash
claw \
  --runtime zeroclaw \
  doctor \
  --workspace /path/to/workspace
```

`buildDoctorReport` stays adapter-specific and narrow. It should report the real command/config capabilities of the selected runtime, not an invented one-size-fits-all abstraction. `buildCombinedDoctorReport` then merges that with workspace and state-level issues.

The practical rule is:

1. Refresh compat after a runtime change.
2. Run doctor to see whether the current workspace still matches the current adapter state.
3. Use the suggested repair path or `workspace repair` when drift is intentional or recoverable.
