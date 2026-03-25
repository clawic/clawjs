# __APP_TITLE__

Minimal agent-first repository wired for ClawJS.

## Commands

```bash
npm install
npm run claw:init
npm run agent:report
npm run agent:reply -- "Say hello"
```

## What is included

- Agent-first runtime files such as `SOUL.md`, `AGENTS.md`, `TOOLS.md`, `IDENTITY.md`, and `HEARTBEAT.md`
- A base memory convention in `MEMORY.md`
- Skill placeholders under `skills/`
- `@clawjs/claw` helper code in `src/claw.ts`
- Example agent scripts in `src/agent.ts`
- `@clawjs/cli`-powered scripts for local workspace bootstrap

## Switch from demo to a real runtime

The starter uses the `demo` adapter so it works immediately. When you want a real runtime:

1. Change `demo` to `openclaw` in `package.json` scripts.
2. Change `demo` to `openclaw` in `src/claw.ts`.
3. Run `npm run claw:init` again if you want the workspace files regenerated for that adapter.
