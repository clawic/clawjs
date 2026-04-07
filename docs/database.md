---
title: Database
description: Standalone namespace-based data service for remote agents, apps, and admin operators.
---

# Database

`database/` is a standalone Fastify service in this repository. It is
designed for a compact self-hosted deployment shape:
one HTTPS-facing service, one SQLite database, one admin console, and
scoped API access for agents or apps.

## What v1 includes

- namespaces that behave like separate logical databases
- built-in protected collections for `people`, `tasks`, `events`, and `notes`
- schema-first custom collections with field validation and index metadata
- scoped API tokens at `namespace + collection + operation` granularity
- realtime record events over WebSocket
- local file storage backed by SQLite metadata
- a built-in admin console served from the same process

## Local workflow

```bash
npm --prefix database ci
npm --prefix database run build
npm --prefix database run start
```

Default local credentials:

- email: `admin@database.local`
- password: `database-admin`

Default local URL:

- [http://127.0.0.1:4510](http://127.0.0.1:4510)

## CLI

The app ships its own CLI:

```bash
npm --prefix database run cli -- login --url http://127.0.0.1:4510 --email admin@database.local --password database-admin
```

The main `claw` CLI also exposes the same surface through a thin bridge:

```bash
claw database namespace list --url http://127.0.0.1:4510 --token <admin-token>
```
