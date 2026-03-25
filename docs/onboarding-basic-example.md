# Onboarding Basico Example

This example shows the smallest first-run flow you can build on top of ClawJS:

- initialize a workspace
- seed the canonical runtime files
- inspect the manifest and capability map

Run [`../examples/onboarding-basic-example.ts`](../examples/onboarding-basic-example.ts) when you want a local-first onboarding with no providers or channels yet.

Terminology note:

- onboarding starts by selecting a runtime adapter and initializing a workspace
- the example intentionally stops before provider, model, or channel setup

Key API surface:

- `Claw({ runtime: { adapter: "demo" } })`
- `claw.workspace.init()`
- `claw.workspace.inspect()`
- `claw.runtime.status()`
