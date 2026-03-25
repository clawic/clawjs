# ClawJS Terminology

This document is the canonical naming reference for ClawJS and the wider `create-claw-*` portfolio.

## Canonical terms

### Runtime adapter

A runtime adapter is the integration boundary between ClawJS and a concrete runtime such as `openclaw`, `zeroclaw`, or `picoclaw`.

It owns:

- capability probing
- install/setup/repair flows
- runtime-specific workspace contracts
- auth and provider/model integration
- conversation transport selection

### Workspace

A workspace is the isolated operational directory managed by ClawJS.

It combines:

- the stable `.clawjs/` layer
- the runtime-facing files declared by the selected runtime adapter
- the persisted state and conversations associated with that isolated context

### Agent

An agent is the identity and operational behavior that runs inside a workspace.

Typical agent-facing files or concepts include:

- `SOUL.md`
- `USER.md`
- `IDENTITY.md`
- `TOOLS.md`
- memory or heartbeat conventions

An adapter may expose one agent or many agents. ClawJS still uses `agent` as the product term in both cases.

### Agent profile

An agent profile is a named variant or configuration of the same agent.

Use this term when the identity stays the same but the behavior, credentials, defaults, or operating mode vary.

### Provider

A provider is the external inference or service vendor, for example `openai`, `anthropic`, or another adapter-backed integration.

### Model

A model is the specific model identifier selected through a provider or adapter-specific model surface.

Providers and models are related, but they are not synonyms.

### Gateway

A gateway is a mediation layer between clients, agents, and providers.

Use `gateway` only for network or transport mediation concerns such as:

- shared routing
- guardrails and policy
- retries and transport fallback
- centralized provider boundaries

Do not use `gateway` as a synonym for `runtime adapter`.

## Concept hierarchy

The canonical relationship is:

1. A `runtime adapter` defines capabilities and runtime behavior.
2. A `workspace` is initialized against that adapter.
3. An `agent` operates within that workspace.
4. An `agent profile` can vary that agent's configuration.
5. `provider` and `model` selection sit in the inference layer exposed by the adapter.
6. A `gateway` may sit in front of runtimes or agents, but it is a separate concept.

## Non-synonyms

Do not use these terms interchangeably:

- `gateway` and `runtime adapter`
- `workspace` and `agent`
- `provider` and `model`

## Defaults and scaffolds

Some examples and starters set `workspaceId` and `agentId` to the same value for convenience.

That is a scaffold default, not a product rule. The ontology stays:

- `workspaceId` identifies the isolated workspace context
- `agentId` identifies the agent identity used in that context
