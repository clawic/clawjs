# Demo terminology note

This note is intentionally implementation-facing. The current task does not modify the demo UI.

## Required demo follow-up

When the demo terminology work is implemented later, apply these rules:

- Separate `Runtime`, `Workspace`, `Agent`, and `Provider / Model` into distinct settings concepts.
- If a runtime adapter only exposes one agent, still render an `Agent` section and show the selected default agent explicitly.
- If a runtime adapter exposes many agents, add an agent selector without collapsing that selector into workspace selection.
- Use `agent profile` for variants of the same agent instead of overloading `agent`, `preset`, or `workspace`.
- Reserve `gateway` for transport or mediation UI only. Do not label OpenClaw, ZeroClaw, or other runtimes as gateways.
- Where scaffolds currently use the same value for `workspaceId` and `agentId`, explain that this is a convenience default rather than a system invariant.

## Recommended demo information architecture

Order the settings surface like this:

1. `Runtime adapter`
2. `Workspace`
3. `Agent`
4. `Agent profile` when applicable
5. `Providers`
6. `Models`
7. `Gateway` only when a transport mediation surface actually exists
