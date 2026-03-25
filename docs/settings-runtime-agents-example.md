# Settings Runtime Agents Example

This example is the operational counterpart to chat and onboarding. It shows how to surface:

- runtime adapter status and capabilities
- workspace context
- install/setup/repair actions
- model switching
- agent-oriented operational context

Run [`../examples/settings-runtime-agents-example.ts`](../examples/settings-runtime-agents-example.ts) when you want a settings page that explains why ClawJS exposes a runtime-adapter layer, not only a chat wrapper.

Terminology note:

- `runtime adapter` is the canonical term for OpenClaw, ZeroClaw, and similar integrations
- `workspace` is the isolated container
- `agent` is the identity operating inside that workspace
- `model` selection sits above the provider layer exposed by the adapter

Key API surface:

- `claw.runtime.status()`
- `claw.runtime.installPlan()`
- `claw.runtime.setupWorkspacePlan()`
- `claw.runtime.repairPlan()`
- `claw.models.getDefault()`
- `claw.models.setDefault()`
