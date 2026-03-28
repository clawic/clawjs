---
title: Authentication
description: Provider auth flows are normalized at the API layer while storage and login mechanics remain adapter-specific.
---

# Authentication

ClawJS separates runtime adapters, providers, models, and credentials.
Auth is normalized at the API layer, but the storage and login mechanics
remain adapter-specific.

## Main APIs

- `claw.providers.list()`
- `claw.providers.catalog()`
- `claw.providers.authState()`
- `claw.auth.status()`
- `claw.auth.diagnostics(provider?)`
- `claw.auth.prepareLogin(provider)`
- `claw.auth.login(provider, options?)`
- `claw.auth.setApiKey(provider, key, profileId?)`
- `claw.auth.saveApiKey(provider, key, options?)`
- `claw.auth.removeProvider(provider)`

Auth writes now update two separate layers on purpose:

- `.clawjs/intents/providers.json` for desired provider state and
  preferred auth mode
- `.clawjs/observed/providers.json` for the rebuildable snapshot of
  current runtime auth

For the OpenClaw adapter, `claw.auth.status()` treats persisted auth-store
credentials as the source of truth for completed OAuth, token, and profile
API-key auth. Transient runtime hints during an in-progress OAuth flow are
not reported as completed auth.

## What is normalized

- provider descriptors
- credential summaries
- auth state snapshots
- login preflight decisions and login result status
- masked credentials in reports and diagnostics

## What stays adapter-specific

- OAuth or token login commands
- auth store file locations
- provider alias resolution
- whether API keys, tokens, or config files are the write path

<!-- -->

```ts
const authState = await claw.providers.authState();
const summaries = await claw.auth.status();
const diagnostics = claw.auth.diagnostics("openai");
const loginPlan = await claw.auth.prepareLogin("openai");
```
For runtime drift and repair flows tied to auth state, continue with [Diagnostics & Repair](/diagnostics).
