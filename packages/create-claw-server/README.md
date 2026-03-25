# create-claw-server

Bootstrap a minimal headless Node.js server wired for Claw.

This package is kept as a compatibility wrapper. The primary documented flow is now `claw new server my-claw-server`.

```bash
npx create-claw-server my-claw-server
```

The generated server includes:

- a TypeScript Node.js HTTP server
- `@clawjs/claw` runtime wiring on the server side
- `claw` CLI scripts for local workspace bootstrap
- JSON routes for runtime status and sessions
- an SSE route for assistant reply event streaming

After generation:

```bash
cd my-claw-server
npm run claw:init
npm run dev
```

Switch the generated demo adapter to `openclaw` when you are ready to target a real runtime.
