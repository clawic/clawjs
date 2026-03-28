---
title: Runtime
description: Understand the adapter lifecycle, capability maps, workspace contracts, and transport behavior.
---

# Runtime

The `claw.runtime` namespace manages the full lifecycle of a Claw-style
runtime adapter: detection, installation, configuration, repair, and
runtime-specific probing.

In ClawJS terminology, OpenClaw, ZeroClaw, PicoClaw, and similar systems
are **runtime adapters**. They are not gateways.

<div class="callout">

**Supported adapters:** `openclaw`, `zeroclaw`, `picoclaw`, `nanobot`,
`nanoclaw`, `nullclaw`, `ironclaw`, `nemoclaw`, `hermes`.

</div>

## Runtime status

```ts
const status = await claw.runtime.status();

console.log(status.adapter);
console.log(status.version);
console.log(status.cliAvailable);
console.log(status.gatewayAvailable);
console.log(status.capabilityMap);
```
The runtime probe is adapter-aware. \`capabilities\` gives a boolean
summary. \`capabilityMap\` gives the typed version with:

- \`supported\`
- \`status\`
- \`strategy\`
- \`diagnostics\`
- \`limitations\`

## Tracked capabilities

- \`runtime\`
- \`workspace\`
- \`auth\`
- \`models\`
- \`conversation_cli\`
- \`conversation_gateway\`
- \`streaming\`
- \`scheduler\`
- \`memory\`
- \`skills\`
- \`channels\`
- \`sandbox\`
- \`plugins\`
- \`doctor\`
- \`compat\`

For adapter support tiers and defaults, see [Support Matrix](/support-matrix). For upgrade and recovery details, see [Runtime Migration Notes](/runtime-migration-notes).

## Lifecycle operations

| Method | Description |
|----|----|
| `status()` | Probe the selected adapter and return current state. |
| `install()` | Install the runtime using adapter-specific commands. |
| `uninstall()` | Remove the runtime using adapter-specific commands. |
| `repair()` | Run adapter-specific repair/doctor actions. |
| `setupWorkspace()` | Register or initialize the current workspace for that adapter. |

## Workspace contracts

Runtime-facing files are defined per adapter, not globally. Examples:

- **OpenClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`, \`TOOLS.md\`,
  \`IDENTITY.md\`, \`HEARTBEAT.md\`
- **ZeroClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`,
  \`IDENTITY.md\`, \`MEMORY.md\`
- **PicoClaw:** \`SOUL.md\`, \`USER.md\`, \`AGENTS.md\`,
  \`IDENTITY.md\`, \`memory/MEMORY.md\`

ClawJS keeps its own managed layer under `.clawjs/` independently of
those runtime contracts. A runtime adapter selects the workspace
contract; the workspace then hosts one agent identity or many, depending
on adapter behavior.

## Agents and runtime adapters

ClawJS keeps `workspace` and `agent` separate conceptually even when an
adapter or scaffold uses the same identifier for both.

- If an adapter exposes one agent, ClawJS still describes it as an
  `agent`.
- If an adapter exposes many agents, the product model does not change.
- An adapter-specific default agent is still an agent, not a different
  top-level concept.

## OpenClaw agent discovery

For OpenClaw settings or diagnostics screens, prefer the async
`resolveOpenClawContextWithCli()` helper over `resolveOpenClawContext()`
when you need the effective agent metadata from both `openclaw.json` and
`openclaw agents list --json`.

```ts
const context = await resolveOpenClawContextWithCli();

console.log(context.configuredAgent?.id);
console.log(context.configuredAgent?.model);
console.log(context.cliAgentDetected);
```

`resolveOpenClawContext()` remains a synchronous config and env reader.
`resolveOpenClawContextWithCli()` is the best-effort helper that also
fills missing `workspace`, `agentDir`, and `model` fields from the live
CLI agent registry when available.

## OpenClaw setup readiness

If an app needs to distinguish "workspace setup finished" from
"model/auth still pending", prefer `getOpenClawSetupStatus()` instead of
recombining `runtime.context()`, `models.getDefault()`, and
`auth.status()` in UI code.

```ts
const setup = await getOpenClawSetupStatus(claw);

console.log(setup.agentConfigured);
console.log(setup.needsSetup);
console.log(setup.needsAuth);
console.log(setup.defaultModel);
```

This helper keeps the OpenClaw setup semantics in the SDK so screens can
reliably treat agent/workspace registration as complete before provider
auth is finished.

## Conversation transport

Conversation transport is adapter-defined. Depending on the runtime,
ClawJS may use:

- CLI prompt transport
- HTTP chat transport
- SSE transport
- WebSocket transport
- hybrid gateway + CLI fallback

## Location overrides

```ts
const claw = await Claw({
  runtime: {
    adapter: "picoclaw",
    homeDir: "/custom/home",
    configPath: "/custom/config.json",
    authStorePath: "/custom/auth.json",
    gateway: {
      url: "http://127.0.0.1:4010",
      configPath: "/custom/gateway.json",
    },
  },
  workspace: {
    appId: "demo",
    workspaceId: "main",
    agentId: "assistant",
    rootDir: "./workspace",
  },
});
```
