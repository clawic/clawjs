# @clawjs/relay-ui

React + Vite + TypeScript + Tailwind v4 frontend for the clawjs relay.

The Fastify backend in `relay/src/` serves this app's production build from
`relay/ui/dist/` as static assets via `@fastify/static`. In development,
`vite dev` runs on port `5180` and proxies `/v1/*` requests to the Fastify
server on `127.0.0.1:8787`.

## Stack

- React 19 + React Router 7
- TanStack Query 5 (data fetching / cache)
- Tailwind CSS v4 via `@tailwindcss/vite`, with manual light/dark toggle
- Lucide icons

## Install & run

From this directory:

```bash
npm install
npm run dev          # http://localhost:5180 — proxies /v1 to backend
npm run build        # emits relay/ui/dist (consumed by Fastify)
npm run typecheck
```

Point the dev server at a different backend:

```bash
RELAY_BACKEND=http://127.0.0.1:9000 npm run dev
```

In another terminal, start the relay backend:

```bash
# from the repo root
npm --prefix relay run dev
```

`npm --prefix relay run build` also triggers `build:ui` so the monorepo
`npm run build:relay` produces both the server and the UI in one shot.

## Project layout

```
src/
  main.tsx             # providers (QueryClient, Router, AuthProvider)
  App.tsx              # routes
  index.css            # Tailwind v4 tokens + light/dark theme
  lib/
    api.ts             # fetch wrapper + bearer token + SSE streamSSE()
    auth.tsx           # AuthProvider + useAuth()
    theme.ts           # useTheme() hook (localStorage-backed)
    format.ts          # relativeTime / truncate / copyToClipboard
  components/
    AppShell.tsx       # rail + main layout
    Rail.tsx           # left icon nav (agents / workspaces / logs / settings)
    ProtectedRoute.tsx # redirects to /login when unauthenticated
    PageHeader.tsx     # shared page header + body
    Table.tsx          # table primitives
    Card.tsx
    Badge.tsx
    Button.tsx
    Drawer.tsx         # right-slide drawer portaled to body
    Empty.tsx          # Empty / ErrorMsg / Loading
  routes/
    Login.tsx
    Agents.tsx
    Workspaces.tsx
    Workspace.tsx      # tabbed detail: activity / usage / sessions / resources / status
    Logs.tsx
    Settings.tsx
    workspace/
      ActivityTab.tsx
      UsageTab.tsx
      SessionsTab.tsx  # SSE-streamed chat
      ResourcesTab.tsx
      StatusTab.tsx
```

## Routing

| Path | View |
| --- | --- |
| `/login` | Email + password + tenant sign-in |
| `/agents` | Tenant agents list, click to pick a workspace |
| `/workspaces` | Flat list of all workspaces across agents |
| `/workspace/:tenantId/:agentId/:workspaceId/:tab` | Workspace detail. `:tab` is one of `activity`, `usage`, `sessions`, `resources`, `status` |
| `/logs` | Aggregated activity across all workspaces |
| `/settings` | Admin-only: enrollment tokens, workspace creation, runtime management, data deletion |
