# Setup and First Workspace

This guide matches the current multi-runtime CLI/API surface in the repo.

The official flow is:

1. Install the CLI globally.
2. Create a project with `claw new`.
3. Initialize the workspace.
4. Extend the project with `claw generate` and `claw add`.

## Pick a runtime adapter

ClawJS supports these adapters:

- `openclaw`
- `zeroclaw`
- `picoclaw`
- `nanobot`
- `nanoclaw`
- `nullclaw`
- `ironclaw`
- `nemoclaw`
- `hermes`

Every CLI command that depends on runtime behavior accepts `--runtime`.

## Install and verify

```bash
npm install -g @clawjs/cli

claw --help
```

For application code inside a project, the generated starters already include `@clawjs/claw`. If you are wiring Claw into an existing codebase manually:

```bash
npm install @clawjs/claw
```

`claw info --json` gives you a quick summary of the current project, the detected workspace state, and the installed CLI version.

## Create a project

The official project entrypoint is `claw new`.

```bash
claw new app my-app
cd my-app
npm run claw:init
```

Other v1 project types:

- `claw new agent my-agent`
- `claw new server my-server`
- `claw new workspace my-workspace`
- `claw new skill summarize-ticket`
- `claw new plugin jira-integration`

Compatibility note:

- `create-claw-app`
- `create-claw-agent`
- `create-claw-server`
- `create-claw-plugin`

still work, but they are compatibility wrappers around the same scaffolding engine.

## First workspace creation

The workspace root is whichever path you pass as `--workspace`, or the current working directory if you omit it.

Terminology note:

- `runtime adapter` selects runtime behavior and workspace contract
- `workspace` is the isolated operational context
- `agent` is the identity that runs inside that workspace
- examples below use the same value for `workspaceId` and `agentId` only as a convenience default

```bash
claw \
  --runtime zeroclaw \
  workspace init \
  --workspace /path/to/workspace \
  --app-id demo \
  --workspace-id demo-main \
  --agent-id demo-main
```

Add `--template-pack /path/to/template-pack.json` if you want template mutations applied during initialization.

This command creates the stable ClawJS layer:

- `.clawjs/manifest.json`
- `.clawjs/audit/`
- `.clawjs/intents/`
- `.clawjs/observed/`
- `.clawjs/projections/`
- `.clawjs/backups/`
- `.clawjs/locks/`
- `.clawjs/compat/`
- `.clawjs/conversations/`

It also seeds the runtime-facing files defined by the selected adapter.

Generated repositories also include a root `claw.project.json`. That file is what lets `claw generate` and `claw add` extend the repo in a stable way later.

## Extend the project

Once the starter exists, add capabilities from the main CLI rather than dropping back to `npx`.

```bash
claw generate skill support-triage
claw generate provider openai
claw add telegram
claw add scheduler nightly-sync
claw info --json
```

Examples:

- `openclaw` seeds `SOUL.md`, `USER.md`, `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, `HEARTBEAT.md`
- `zeroclaw` seeds `SOUL.md`, `USER.md`, `AGENTS.md`, `IDENTITY.md`, `MEMORY.md`
- `picoclaw` seeds `SOUL.md`, `USER.md`, `AGENTS.md`, `IDENTITY.md`, `memory/MEMORY.md`

## Runtime workspace setup

Some adapters need an explicit setup step after the filesystem layout exists.

```bash
claw \
  --runtime openclaw \
  runtime setup-workspace \
  --workspace /path/to/workspace \
  --app-id demo \
  --workspace-id demo-main \
  --agent-id demo-main
```

The Node API uses the same shape:

```ts
import { Claw } from "@clawjs/claw";

const claw = await Claw({
  runtime: {
    adapter: "zeroclaw",
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "/path/to/workspace",
  },
});

await claw.workspace.init();
await claw.runtime.setupWorkspace();
```

If an adapter exposes only one agent, ClawJS still uses the `agent` term. If an adapter exposes many agents, the model stays the same.

Use adapter-specific location overrides when you need them:

- `binaryPath` for runtimes like `openclaw` when the binary is installed outside the current `PATH`
- `homeDir`
- `configPath`
- `workspacePath`
- `authStorePath`
- `gateway.configPath`

For OpenClaw specifically, you can also set `CLAWJS_OPENCLAW_PATH` if you prefer an environment variable over `runtime.binaryPath`.

## Inspect and validate

Use `workspace inspect` to read file locations and persisted state, and `workspace validate` to confirm the manifest, directories, and runtime contract are present.

The important ownership rule is:

- `.clawjs/intents/` stores what the user wants
- `.clawjs/observed/` stores rebuildable snapshots of what the runtime currently reports
- `.clawjs/projections/` stores how ClawJS projects settings into visible files

```bash
claw \
  --runtime zeroclaw \
  workspace inspect \
  --workspace /path/to/workspace

claw \
  --runtime zeroclaw \
  workspace validate \
  --workspace /path/to/workspace
```

`workspace inspect` now includes the persisted state snapshots for:

- compat
- providers
- scheduler
- memory
- skills
- channels
