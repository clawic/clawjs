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
