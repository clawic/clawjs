# @clawjs/node

Compatibility wrapper for Claw.

New code should prefer [`@clawjs/claw`](https://www.npmjs.com/package/@clawjs/claw).

```bash
npm install @clawjs/node
```

Or migrate older imports to the primary package:

```bash
npm install @clawjs/claw
```

```ts
import { Claw } from "@clawjs/claw";
```

`@clawjs/node` is a direct re-export of `@clawjs/claw` for older imports.
It does not add a separate runtime model, API layer, or release policy.
