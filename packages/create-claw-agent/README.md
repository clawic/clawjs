# create-claw-agent

Bootstrap a minimal agent-first repository wired for Claw.

This package is kept as a compatibility wrapper. The primary documented flow is now `claw new agent my-agent`.

```bash
npx create-claw-agent my-agent
```

The generated repo includes:

- a dedicated ClawJS agent workspace
- seeded runtime-facing files such as `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, and `HEARTBEAT.md`
- memory and skills placeholders
- `@clawjs/claw` helper code for agent inspection and session demos
- `claw` CLI scripts for local workspace bootstrap

After generation:

```bash
cd my-agent
npm run claw:init
npm run agent:report
npm run agent:reply -- "Say hello"
```

Switch the generated demo adapter to `openclaw` when you are ready to target a real runtime.
