# Releasing Claw

## Release policy

- Follow semver, but treat all `0.x` releases as potentially fast-moving.
- Update [CHANGELOG.md](CHANGELOG.md) in the same change that prepares a release.
- Do not publish if `npm run ci` fails.
- Treat `main` as the normal tag source. Use `release/0.x` only when patching the current public line without merging all queued work from `next`.
- Keep the Git workflow in sync with [docs/git-workflow.md](docs/git-workflow.md).

## Release checklist

1. Run `npm ci`, `npm --prefix demo ci`, and `npm --prefix website ci`.
2. Run `npx playwright install --with-deps chromium`.
3. Run `npm run ci`.
4. Run `npm run publish:dry-run`.
5. Verify adapter support/stability metadata and docs support matrix are current.
6. Publish packages in this order:
   - `@clawjs/core`
   - `@clawjs/claw`
   - `@clawjs/workspace`
   - `@clawjs/node`
   - `@clawjs/cli`
   - `@clawjs/openclaw-plugin`
   - `@clawjs/openclaw-context-engine`
   - `create-claw-app`
   - `create-claw-agent`
   - `create-claw-server`
   - `create-claw-plugin`
   - `eslint-config-claw`
7. Tag the release as `v<semver>` from `main` unless this is an intentional patch from `release/0.x`.
8. Copy the changelog entry into the GitHub release notes.

## Package map

- `@clawjs/claw`: scoped public SDK package and primary entrypoint
- `@clawjs/workspace`: scoped local-first workspace layer
- `@clawjs/node`: scoped compatibility wrapper that reexports the SDK
- `@clawjs/cli`: scoped CLI package that exposes the `clawjs` binary
- `@clawjs/openclaw-plugin`: scoped plugin package for the OpenClaw runtime
- `@clawjs/openclaw-context-engine`: scoped context engine package for the OpenClaw runtime
- `create-claw-app`: unscoped scaffolder for app bootstrapping
- `create-claw-agent`: unscoped scaffolder for agent-first repository bootstrapping
- `create-claw-server`: unscoped scaffolder for headless server bootstrapping
- `create-claw-plugin`: unscoped scaffolder for broader plugin package bootstrapping
- `eslint-config-claw`: public shared ESLint preset
- `@clawjs/core`: scoped public low-level contracts package

The release order matters because `@clawjs/claw` depends on `@clawjs/core`, `@clawjs/workspace` depends on the SDK, the compatibility wrapper depends on `@clawjs/claw`, the CLI depends on `@clawjs/claw`, and the scaffolder templates depend on the published runtime packages.

## Publish commands

Dry run the full release from the workspace root:

```bash
npm run publish:dry-run
```

Publish for real from the workspace root after authentication:

```bash
npm run publish:packages
```
