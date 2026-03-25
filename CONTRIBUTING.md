# Contributing to ClawJS

## Ground rules

- Treat the published package surface, docs, examples, and website as product surface.
- Do not merge changes that leave `npm test`, `npm run test:types`, `npm run test:ts`, `npm run build`, `npm run test:docs`, `npm run test:pack`, or `npm run test:e2e:ci` failing.
- Prefer additive, well-scoped changes. If a change alters public behavior, update docs and tests in the same patch.
- Follow the repository branch policy in [docs/git-workflow.md](docs/git-workflow.md).

## Local setup

```bash
npm ci
npm --prefix demo ci
npm --prefix website ci
npx playwright install --with-deps chromium
npm run ci
```

## Public API policy

- `@clawjs/claw` is the official SDK package.
- `@clawjs/node` exists only as a compatibility wrapper.
- `@clawjs/cli` is the official CLI package.
- New adapters must declare stability metadata and must not be documented as production-ready until their support level is explicitly raised.
- Capability maps must obey the invariant enforced in code: `supported=false` implies `status="unsupported"`, and `status="unsupported"` implies `supported=false`.

## Pull requests

- Include tests for behavior changes.
- Update docs/examples if the change touches onboarding, installation, imports, CLI usage, or support tiers.
- Keep commit messages in `type(scope): description` form.
- Target `main` for releasable work, `next` for queued integration work, and `release/*` only for stabilization or hotfixes.
- Keep branch names short and scoped, such as `feat/runtime-status` or `docs/release-policy`.
- Expect `CI` and `Release Gate` to stay green before merge.
