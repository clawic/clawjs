# __APP_TITLE__

`__APP_TITLE__` is a reusable Claw skill scaffold.

It gives you one narrow capability with a stable contract, a small implementation surface, and a local verification harness.

## Files

- `skill.json`: package-level metadata
- `src/contract.ts`: typed input/output contract plus output validation
- `src/index.ts`: the skill implementation entrypoint
- `src/harness.ts`: local runner that validates metadata and example output
- `src/verify.ts`: local verification script used by `npm test`
- `examples/input.json`: example payload for quick checks

## Scripts

```bash
npm test
npm run skill:example
npm run skill:check
npm run build
```

Use this starter when a single reusable capability is the product. If you need multiple coordinated capabilities or runtime hooks, use a broader starter such as `create-claw-plugin`.
