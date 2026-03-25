# create-claw-app

Bootstrap a minimal Next.js app wired for Claw.

This package is kept as a compatibility wrapper. The primary documented flow is now `claw new app my-claw-app`.

```bash
npx create-claw-app my-claw-app
```

The generated app includes:

- Next.js App Router setup
- `@clawjs/claw` on the server side
- `claw` CLI scripts for local workspace bootstrap
- a `/api/claw/status` route that shows how to call Claw from Next.js

After generation:

```bash
cd my-claw-app
npm run claw:init
npm run dev
```

Switch the generated demo adapter to `openclaw` when you are ready to target a real runtime.
