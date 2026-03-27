---
title: Workspace
description: Learn the stable .clawjs layout, adapter file contracts, and the main workspace operations.
---

# Workspace

A workspace is an isolated directory that combines one stable ClawJS
layer with one adapter-defined runtime file contract.

A workspace is not the same thing as an agent. The workspace is the
container; the agent is the identity and behavior operating inside that
container.

## Stable internal layout

- `.clawjs/manifest.json`
- `.clawjs/compat/`
- `.clawjs/intents/`
- `.clawjs/observed/`
- `.clawjs/projections/`
- `.clawjs/conversations/`

`intents` store what the user wants, `observed` stores rebuildable
runtime snapshots, and `projections` stores the binding/schema layer
used to project settings into visible workspace files.

## Runtime-facing layout

Each adapter declares its own runtime file contract. Examples:

- **OpenClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`, \`TOOLS.md\`,
  \`IDENTITY.md\`, \`HEARTBEAT.md\`
- **ZeroClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`,
  \`IDENTITY.md\`, \`MEMORY.md\`
- **PicoClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`,
  \`IDENTITY.md\`, \`memory/MEMORY.md\`

## Main operations

- `claw.workspace.init()`
- `claw.workspace.attach()`
- `claw.workspace.validate()`
- `claw.workspace.inspect()`
- `claw.workspace.repair()`
- `claw.workspace.reset()`
- `claw.workspace.canonicalPaths()`

<!-- -->

```ts
await claw.workspace.init();

const snapshot = await claw.workspace.inspect();
console.log(snapshot.manifest);
console.log(snapshot.intents);
console.log(snapshot.observed);
console.log(snapshot.workspaceState);
console.log(snapshot.skillsState);
```
## Workspace and agent IDs

Some examples set `workspaceId` and `agentId` to the same value for
convenience. That is a scaffold default, not a product rule.

The intended model is:

- `workspaceId` identifies the isolated workspace context
- `agentId` identifies the agent identity used in that context

## Productivity Layer With `@clawjs/workspace`

`@clawjs/workspace` extends the base SDK when you want a local-first
productivity layer instead of only runtime primitives.

```bash
npm install @clawjs/workspace
```

```ts
import { createWorkspaceClaw } from "@clawjs/workspace";

const claw = await createWorkspaceClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "ops-main",
    agentId: "ops-main",
    rootDir: "./workspace",
  },
});

await claw.tasks.create({ title: "Triage docs drift" });
await claw.notes.create({ title: "Release notes", content: "Draft summary" });
const results = await claw.search.query({ query: "docs", domains: ["tasks", "notes"] });
```

The productivity instance adds:

- `tasks` for task CRUD, completion, archive, and search
- `notes` for note CRUD, archive, and search
- `people` for person upserts, identity matching, and search
- `inbox` for draft creation, routing replies, ingesting incoming messages, and thread reads
- `events` for calendar-style records and search
- `search`, `context`, and `ui` helpers for cross-domain workflows
- `workspace.tools.describe()` so UIs can render tool metadata from the same runtime-aware source

## Productivity Storage

The productivity layer stores its records under `.clawjs/data` while the
base workspace metadata stays under the stable `.clawjs/manifest`,
`compat`, `intents`, `observed`, and `projections` folders.

That split matters:

- `.clawjs/manifest`, `intents`, `observed`, and `projections` are SDK-owned control planes
- `.clawjs/data` stores user-facing productivity records and generated assets
- runtime-facing files such as `SOUL.md` or `IDENTITY.md` stay outside `.clawjs/`

## Productivity CLI Commands

When a generated project includes the workspace companion, the CLI also
exposes productivity commands on top of the base workspace contract:

```bash
claw tasks list
claw notes create --title "Release notes" --content "Draft"
claw people upsert --name "Iván"
claw inbox list
claw events list
claw workspace-search query "release"
claw workspace-index rebuild
```

Use `workspace-search query` for keyword, semantic, or hybrid search
over tasks, notes, people, inbox, and events. Use
`workspace-index rebuild` after large imports or when you change the
embedding strategy.
