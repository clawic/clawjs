---
title: Introduction
description: Overview of the ClawJS docs, runtime adapter model, and primary package surfaces.
---

<div class="intro-hero">
  <p class="intro-hero__eyebrow">Introduction</p>
  <h1>Build AI agent apps with any runtime.</h1>
  <p class="intro-hero__lead">ClawJS is the open-source Node.js SDK and CLI for building AI agent applications across multiple runtime adapters.</p>
  <div class="intro-hero__actions">
    <a href="/getting-started" class="VPButton medium brand">Getting Started</a>
    <a href="/api" class="VPButton medium alt">API Reference</a>
  </div>
</div>

ClawJS gives you one place to solve the hard parts that show up across runtimes without dropping the docs navigation context.

## Why ClawJS

ClawJS gives you one place to solve the hard parts that show up across runtimes:

- Runtime detection, install, repair, and compat tracking.
- Workspace initialization with adapter-specific file layouts.
- Auth, provider catalogs, and model catalogs.
- Normalized streaming and transport fallback.
- Intent, observed-state, and feature planning for adapter-owned settings.
- State snapshots for scheduler, memory, skills, channels, and speech config.
- A local-first productivity layer for tasks, notes, people, inbox, events, and search.
- File-backed media generation and asset storage for image, audio, and video workflows.

<div class="callout">
  <p><strong>Support note:</strong> Adapter maturity differs. Check the support matrix before picking a runtime for production use.</p>
</div>

## Architecture

| Package | Description |
| --- | --- |
| `@clawjs/core` | Shared types, schemas, capability maps, manifests, and snapshot shapes. |
| `@clawjs/claw` | Runtime adapters, workspace management, conversations, auth, compat, doctor, media generation, secrets, watchers, and state persistence. |
| `@clawjs/workspace` | Productivity extension for tasks, notes, people, inbox, events, search, context, and UI descriptors on top of the base SDK. |
| `@clawjs/node` | Compatibility wrapper that reexports the primary SDK surface for existing integrations that still import `@clawjs/node`. |
| `@clawjs/cli` | Official CLI with `claw` and `clawjs` binaries for scaffolding, runtime management, workspace ops, productivity commands, sessions, media, and package-aware project generation. |
| `@clawjs/openclaw-plugin` | OpenClaw bridge plugin for gateway RPC methods, observability hooks, and managed tooling. |
| `@clawjs/openclaw-context-engine` | Experimental OpenClaw context engine package for runtime-side context selection. |
| `create-claw-*` packages | Compatibility wrappers around the same scaffolding engine used by `claw new`. |
| `eslint-config-claw` | Shared flat-config ESLint preset for ClawJS repositories. |

## Core Concepts

See [Terminology](/terminology) for the canonical naming used across ClawJS docs, code, and starter PRDs.

### Runtime adapters

A runtime adapter is the boundary between ClawJS and a concrete runtime. It owns probing, locations, workspace contracts, auth, models, conversations, doctor or compat, and optional subsystems.

### Workspaces and agents

A workspace is the isolated operational context. An agent is the identity operating inside that workspace. Some scaffolds use the same value for `workspaceId` and `agentId` as a convenience default, but those concepts stay separate.

### Capability maps

Every runtime status includes a typed `capabilityMap`. Capabilities are not implicit. They are marked as supported, degraded, or unsupported with a concrete strategy such as `cli`, `gateway`, `config`, `native`, or `bridge`.

### Stable `.clawjs/` layer

ClawJS keeps a stable internal layer under `.clawjs/` even when runtimes disagree on file names or directory structure. Adapter-specific files are managed alongside that stable layer, not mixed into it.

## Start Here

- [Getting Started](/getting-started) for the official scaffold and workspace flow.
- [CLI](/cli) for the current command surface, including productivity and media commands.
- [Database service](/database) for the standalone namespace-based data service and admin console.
- [Terminology](/terminology) for the canonical product vocabulary.
- [Runtime](/runtime) for the adapter contract and capability model.
- [Workspace](/workspace) for the stable `.clawjs` layout and the `@clawjs/workspace` productivity layer.
- [Relay](/relay) for the public HTTPS relay, reverse connector flow, and remote workspace routing model.
- [Files & Templates](/files) for template packs, bindings, and managed blocks.
- [Conversations](/conversations) for session storage and stream events.
- [Diagnostics & Repair](/diagnostics) for compat refresh and doctor flows.
- [API Reference](/api) for the instance namespaces and runtime-facing methods.
- [Public Surface](/surface) for the exhaustive package export inventory.
