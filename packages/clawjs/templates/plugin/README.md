# __APP_TITLE__

`__APP_TITLE__` is a distributable Claw plugin scaffold.

It combines configuration, lifecycle hooks, compatibility metadata, and one bundled skill so the package is clearly broader than a single capability module.

## Files

- `plugin.json`: plugin manifest with compatibility and packaged surfaces
- `src/config.ts`: config schema plus validation
- `src/hooks.ts`: lifecycle-style hook handlers
- `src/skills/triage.ts`: bundled skill logic shipped with the plugin
- `src/index.ts`: plugin entrypoint and activation flow
- `src/harness.ts`: local runner that checks config, hooks, and bundled skill output
- `src/verify.ts`: local verification script used by `npm test`
- `examples/config.json`: example plugin configuration

## Scripts

```bash
npm test
npm run plugin:example
npm run plugin:check
npm run build
```

Use this starter when one skill is too small and you need a shareable extension package with config and lifecycle behavior.
