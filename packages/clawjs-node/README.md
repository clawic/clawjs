# @clawjs/claw

Official SDK for Claw.

```bash
npm install @clawjs/claw
```

```ts
import { Claw } from "@clawjs/claw";
```

```ts
const claw = await Claw({
  runtime: {
    adapter: "openclaw",
    // Use this when openclaw is installed outside the current PATH.
    binaryPath: "/opt/openclaw/bin/openclaw",
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
});
```

This example uses the same value for `workspaceId` and `agentId` as a scaffold-style default. In ClawJS terminology, the workspace is the isolated context and the agent is the identity operating inside it.

See the root repository docs for setup, support tiers, and release guarantees.
