# @clawjs/workspace

Local-first workspace productivity companion for ClawJS.

```bash
npm install @clawjs/workspace
```

```ts
import { createWorkspaceClaw } from "@clawjs/workspace";

const claw = await createWorkspaceClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "ops-main",
    agentId: "ops-main",
    rootDir: "./workspace",
  },
});

await claw.tasks.create({ title: "Triage docs drift" });
await claw.notes.create({ title: "Release notes", content: "Draft" });
const results = await claw.search.query({ query: "release" });
```

It extends a Claw instance with:

- `tasks`
- `notes`
- `people`
- `inbox`
- `events`
- `search`
- `context`
- `ui`

It stores data in the local workspace under `.clawjs/data` and can add hybrid search with optional semantic embeddings.

See the root docs workspace guide for the stable `.clawjs/` layout and
the CLI productivity commands.
