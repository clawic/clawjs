---
title: Relay
description: Public HTTPS relay and reverse connector for remote ClawJS and OpenClaw agents.
---

# Relay

`relay/` is a standalone Node.js service that gives remote clients a public HTTPS `/v1` API while the real ClawJS or OpenClaw runtime stays behind a reverse WebSocket connector.

Use it when you need:

- browser or mobile clients that cannot talk to a local runtime directly
- agents running behind NAT or inside a private network
- a narrow public API in front of remote workspaces
- centralized auth, tenant routing, and connector lifecycle control

The current v1 design is intentionally small:

- JWT access tokens plus revocable refresh tokens for API clients
- one active reverse connector session per `tenantId + agentId`
- explicit routing by `tenantId`, `agentId`, and `workspaceId`
- first-class `project + agent + assignment` routing on top of materialized workspaces
- fail-fast `503` responses when a connector is offline
- admin-only runtime, config, workspace-file, and enrollment APIs
- a small connector protocol with `hello`, `heartbeat`, `invoke`, `stream`, `result`, `error`, `event`, and `ack`

## Architecture

The relay separates public control-plane concerns from remote workspace execution:

1. A client authenticates against the relay over HTTPS.
2. An admin creates a one-time enrollment token for an agent.
3. The remote connector exchanges that enrollment token for a connector credential.
4. The connector opens `/v1/connector/connect` over WebSocket and sends `hello`.
5. The relay records the agent, advertised workspaces, and connection state.
6. Client API requests are routed to that active connector and answered synchronously.

The relay does not queue work for offline agents. If no active connector exists for the requested `tenantId + agentId`, the request fails immediately.

## Data Ownership

The relay persists control-plane metadata only:

- tenants
- users and memberships
- refresh tokens
- connector enrollments and connector credentials
- logical agents, projects, and project-agent assignments
- registered workspaces discovered from connector `hello` or created as assignments
- connector connection state
- relay-side activity and usage telemetry

The relay does not persist workspace source-of-truth data such as:

- conversation transcripts
- tasks, notes, people, inbox, or events
- runtime settings files
- remote agent workspace files

That state remains on the connector side under the selected workspace root.

## Product Model

The relay now distinguishes three layers:

- `project`: shared product or business context
- `agent`: reusable role definition and connector identity
- `assignment`: the concrete `projectId + agentId` runtime instance

The public product routes are project-scoped. The low-level workspace routes remain available for compatibility.

- `agent` in product terms is not the same thing as the OpenClaw runtime id used on disk or on the CLI
- each assignment derives its own `workspaceId` and `runtimeAgentId`
- the connector materializes that assignment into an isolated workspace under the connector workspace root

Current materialized layout:

```text
projects/<projectId>/base/
agents/<agentId>/template/
materialized/<projectId>/<agentId>/
```

The materialized workspace remains the execution target. A project is not a workspace alias.

## Quick Start

The relay is a separate app under `relay/`. It is not part of the root npm workspace bootstrap.

Install and build it:

```bash
npm --prefix relay ci
npm run build:relay
```

Start the server:

```bash
RELAY_JWT_SECRET=replace-me \
npm --prefix relay run start
```

Default server settings:

- host: `127.0.0.1`
- port: `4410`
- database: `relay/relay.sqlite`

For local development, the SQLite seed includes two demo accounts:

- admin: `admin@relay.local` / `relay-admin`
- user: `user@relay.local` / `relay-user`

Those seeded credentials are only for local development. The default JWT secret and seeded users are not production-safe.

## Connector Lifecycle

### 1. Login as admin

```bash
curl -s http://127.0.0.1:4410/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{
    "email": "admin@relay.local",
    "password": "relay-admin",
    "tenantId": "demo-tenant"
  }'
```

The response includes:

- `accessToken`
- `refreshToken`
- `expiresInSec`
- `tenantId`
- `role`
- `scopes`

### 2. Create a connector enrollment

```bash
curl -s http://127.0.0.1:4410/v1/admin/connectors/enrollments \
  -H "authorization: Bearer <admin-access-token>" \
  -H 'content-type: application/json' \
  -d '{
    "tenantId": "demo-tenant",
    "agentId": "demo-agent",
    "description": "first relay connector"
  }'
```

This returns a one-time `enrollmentToken`.

### 3. Start the remote connector

```bash
RELAY_ENROLLMENT_TOKEN=<enrollment-token> \
npm --prefix relay run connector -- \
  --relay-url http://127.0.0.1:4410 \
  --agent-id demo-agent \
  --workspace-root ./relay-workspaces \
  --runtime-adapter openclaw
```

On startup the connector:

1. POSTs `/v1/connector/enroll`
2. receives a connector credential
3. opens `/v1/connector/connect`
4. sends a `hello` frame with capabilities and workspaces
5. keeps the socket alive with heartbeats every 10 seconds
6. reconnects in a loop after disconnection

### 4. Call a workspace route

```bash
curl -s http://127.0.0.1:4410/v1/tenants/demo-tenant/agents/demo-agent/workspaces/main/status \
  -H "authorization: Bearer <user-access-token>"
```

If the connector is online, the relay forwards `workspace.status` to it and returns the connector result. If it is offline, the relay returns `503`.

## Auth Model

Client auth is relay-local and independent from the remote runtime.

### Access tokens

- signed JWTs using `HS256`
- default TTL: `900` seconds
- include `tenantId`, `role`, `scopes`, and optional `agentId` and `workspaceId`

### Refresh tokens

- opaque relay-issued tokens stored hashed in SQLite
- revocable
- one-time on refresh: consuming a refresh token revokes it and returns a new pair
- default TTL: `30` days

### Connector credentials

- created only by consuming an enrollment token
- stored hashed in SQLite
- used only for `/v1/connector/connect`
- scoped to a single `tenantId + agentId`

### Scopes

The seeded non-admin user currently gets:

- `tenant:read`
- `agent:read`
- `workspace:read`
- `chat:read`
- `chat:write`
- `chat:stream`
- `workspace:data`

Admin-only routes require `admin:*`.

## API Surface

The public surface is grouped by concern.

### Health and auth

- `GET /v1/health`
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

### Connector setup

- `POST /v1/connector/enroll`
- `GET /v1/connector/connect` as WebSocket
- `POST /v1/admin/connectors/enrollments`

### Tenant and workspace discovery

- `GET /v1/tenants/:tenantId/agents`
- `GET /v1/tenants/:tenantId/projects`
- `POST /v1/tenants/:tenantId/projects`
- `GET /v1/tenants/:tenantId/projects/:projectId`
- `PATCH /v1/tenants/:tenantId/projects/:projectId`
- `GET /v1/tenants/:tenantId/projects/:projectId/agents`
- `GET /v1/tenants/:tenantId/agents/:agentId/projects`
- `POST /v1/tenants/:tenantId/projects/:projectId/agents/:agentId`
- `DELETE /v1/tenants/:tenantId/projects/:projectId/agents/:agentId`
- `GET /v1/tenants/:tenantId/agents/:agentId/workspaces`
- `GET /v1/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/status`

Project-scoped runtime routes mirror the workspace routes under:

```text
/v1/tenants/:tenantId/projects/:projectId/agents/:agentId/...
```

That includes:

- `GET /status`
- conversations and streaming routes under `/sessions`
- resource CRUD for `tasks`, `notes`, `memory`, `inbox`, `people`, `events`, `personas`, `plugins`, `routines`, and `images`
- `GET /integrations/status`
- `GET /skills/list`
- `GET /skills/search`
- `GET /skills/sources`
- `GET /activity`
- `GET /usage`

### Conversations

- `GET /sessions`
- `POST /sessions`
- `GET /sessions:search`
- `GET /sessions/:sessionId`
- `PATCH /sessions/:sessionId`
- `POST /sessions/:sessionId/messages`
- `POST /sessions/:sessionId/reply`
- `GET /sessions/:sessionId/stream`
- `POST /sessions/:sessionId/generate-title`
- `POST /chat/feedback`

Note the exact search route: `sessions:search`. The current server does not expose `/sessions/search`.

### Workspace data resources

For each of these resources, the relay exposes list/create/update/delete over the workspace prefix:

- `tasks`
- `notes`
- `memory`
- `inbox`
- `people`
- `events`
- `personas`
- `plugins`
- `routines`
- `images`

There are also specialized routes for:

- `GET /images/:imageId`
- `DELETE /images/:imageId`
- `GET /skills/list`
- `GET /skills/search`
- `GET /skills/sources`
- `GET /integrations/status`
- `GET /activity`
- `GET /usage`

### Admin-only workspace and runtime routes

- `POST /v1/admin/tenants/:tenantId/agents/:agentId/workspaces`
- `DELETE /v1/admin/tenants/:tenantId/agents/:agentId`
- `DELETE /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId`
- `POST /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/sessions/clear`
- `GET|PUT /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/config`
- `GET|PUT /v1/admin/tenants/:tenantId/agents/:agentId/workspaces/:workspaceId/workspace-files/:fileName`
- `POST /v1/admin/tenants/:tenantId/agents/:agentId/runtime/:action`

Supported runtime actions today:

- `setup`
- `install`
- `uninstall`
- `status`

The relay also exposes admin cleanup for relay-side telemetry:

- `DELETE /v1/admin/tenants/:tenantId/activity`
- `DELETE /v1/admin/tenants/:tenantId/usage`

## Streaming Semantics

`GET /sessions/:sessionId/stream` is an SSE endpoint.

The relay forwards stream frames emitted by the connector and writes them as SSE events:

- `transport`
- `retry`
- `chunk`
- `done`
- `title`
- `error`

After the connector call completes, the relay emits one final `complete` event with `{ ok: true }`.

The request currently accepts these query parameters:

- `message`
- `systemPrompt`
- `transport`

Relay-side usage telemetry for replies and streams is estimated from text length with a simple `ceil(chars / 4)` heuristic. It is operational telemetry, not billing-grade accounting.

## Connector Protocol

The relay connector protocol is JSON over WebSocket.

### Connector to relay frames

- `hello`: identifies `tenantId`, `agentId`, version, capabilities, and workspaces
- `heartbeat`: updates connector liveness
- `stream`: pushes streamed events for an in-flight invocation
- `result`: completes a request successfully
- `error`: completes a request with a connector-side failure
- `event`: emits informational activity entries into relay telemetry
- `ack`: acknowledges control-plane frames

### Relay to connector frames

- `invoke`: asks the connector to execute one operation
- `ack`: acknowledges connector `hello`

Each `invoke` carries:

- `requestId`
- `tenantId`
- `agentId`
- optional `workspaceId`
- `operation`
- optional `payload`

The relay keeps only one active connection entry per `tenantId + agentId`. New successful `hello` frames replace the previous active route.

## Connector Runtime Behavior

The bundled connector uses `@clawjs/claw` plus `@clawjs/workspace` under the requested workspace root.

Current connector defaults:

- relay URL: `http://127.0.0.1:4410`
- agent id: `demo-agent`
- workspace root: `./relay-workspaces`
- runtime adapter: `openclaw`

For legacy routes, the connector still supports simple lazy workspace creation under the workspace root. For project assignments, it materializes:

- project base files
- agent template files
- one isolated runtime workspace per assignment

The materialized workspace writes `projectId`, `logicalAgentId`, `runtimeAgentId`, and `materializationVersion` into the ClawJS manifest and workspace state snapshots so OpenClaw setup and CLI conversations target the derived runtime agent id instead of the reusable logical agent id.

For some resources it also keeps compatibility data under:

```text
.clawjs/relay-compat/
```

That compatibility layer is currently used for relay-managed collections such as personas, plugins, routines, and hidden people state when the underlying runtime does not provide a native equivalent.

## Configuration

Server environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `RELAY_HOST` | `127.0.0.1` | bind host |
| `PORT` | `4410` | HTTP port |
| `RELAY_DB_PATH` | `relay.sqlite` in `relay/` | SQLite file |
| `RELAY_JWT_SECRET` | `relay-dev-secret-change-me` | JWT signing key |
| `RELAY_ACCESS_TTL_SEC` | `900` | access-token TTL |
| `RELAY_REFRESH_TTL_SEC` | `2592000` | refresh-token TTL |
| `RELAY_CORS_ORIGINS` | empty | comma-separated allowed origins |
| `RELAY_REQUEST_TIMEOUT_MS` | `30000` | connector invoke timeout |
| `RELAY_HEARTBEAT_INTERVAL_MS` | `10000` | reserved config value for heartbeat cadence |

Connector flags or env vars:

| Flag | Env var | Default |
| --- | --- | --- |
| `--relay-url` | `RELAY_URL` | `http://127.0.0.1:4410` |
| `--enrollment-token` | `RELAY_ENROLLMENT_TOKEN` | required |
| `--agent-id` | `RELAY_AGENT_ID` | `demo-agent` |
| `--workspace-root` | `RELAY_WORKSPACE_ROOT` | `./relay-workspaces` |
| `--runtime-adapter` | `RELAY_RUNTIME_ADAPTER` | `openclaw` |

When the runtime adapter is `openclaw`, the connector also passes through these optional host-local paths:

- `OPENCLAW_STATE_DIR`
- `OPENCLAW_CONFIG_PATH`
- `OPENCLAW_AGENT_DIR`

## Operational Limits

The current relay implementation is useful, but deliberately narrow:

- no queued execution while a connector is offline
- no horizontal connector fan-out for the same agent
- no per-request load balancing
- no production-ready user management beyond the local seeded demo accounts
- no production-safe secret bootstrap by default
- no persisted copy of remote workspace data inside the relay database
- no formal billing or metering model beyond estimated usage telemetry

Treat the current relay as a thin remote access layer for ClawJS and OpenClaw, not as a full multi-region runtime platform.
