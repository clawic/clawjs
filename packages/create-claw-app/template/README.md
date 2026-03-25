# __APP_TITLE__

Minimal Next.js starter wired for ClawJS.

## Commands

```bash
npm install
npm run claw:init
npm run dev
```

## What is included

- App Router based Next.js app
- `@clawjs/claw` server helper in `src/lib/claw.ts`
- `/api/claw/status` route handler for runtime and workspace inspection
- `@clawjs/cli`-powered `claw` scripts for local workspace bootstrap

## Switch from demo to a real runtime

The starter uses the `demo` adapter so it works immediately. When you want a real runtime:

1. Change `demo` to `openclaw` in `package.json` scripts.
2. Change `demo` to `openclaw` in `src/lib/claw.ts`.
3. Run `npm run claw:init` again if you want the workspace files regenerated for that adapter.
