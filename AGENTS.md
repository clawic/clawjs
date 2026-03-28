# AGENTS.md

Instructions for humans and coding agents working in this repository.

## Purpose

- Treat this file as the operational entrypoint for the repo.
- Treat `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `RELEASING.md`, `docs/git-workflow.md`, and `tests/e2e/README.md` as source-of-truth references for deeper detail.
- For agent-specific operational knowledge, review `agents/wiki/README.md` and the relevant pages under `agents/wiki/` before changing behavior or debugging repeated issues.
- For host-dependent OpenClaw work, read `agents/wiki/openclaw.md` before changing runtime detection, installation, auth, or onboarding flows.
- If a change affects public behavior, docs, examples, templates, or package surface, update the relevant docs and tests in the same patch.

## Repository Shape

This is a Node.js monorepo for ClawJS, an SDK plus CLI, runtime adapters, workspace tooling, scaffolding packages, a demo app, and a docs website.

Important top-level areas:

- `packages/`: published packages and scaffolding tools.
- `demo/`: Next.js demo app used by the browser E2E suite.
- `website/`: docs-site runtime wrapper for local preview and production builds.
- `docs/`: the single Markdown source for product, reference, and workflow documentation.
- `tests/e2e/`: canonical Playwright end-to-end suite.
- `scripts/`: repo automation such as docs and packaging checks.
- `mock/`: local mock helpers for demo workflows.

Key published packages:

- `@clawjs/claw`: official SDK.
- `@clawjs/cli`: official CLI.
- `@clawjs/core`: shared contracts and schemas.
- `@clawjs/workspace`: local-first workspace layer.
- `@clawjs/node`: compatibility wrapper.
- `@clawjs/openclaw-plugin` and `@clawjs/openclaw-context-engine`: OpenClaw runtime packages.
- `create-claw-app`, `create-claw-agent`, `create-claw-server`, `create-claw-plugin`: scaffolding packages.
- `eslint-config-claw`: shared ESLint preset.

## Environment And Setup

- Use Node.js `20` or `22`. The root `package.json` requires Node `>=20`, and CI runs on Node `20` and `22`.
- Use the root workspace as the command entrypoint unless a task clearly belongs inside `demo/` or `website/`.
- The repo is CI-driven with `npm`. Use the documented `npm` commands as the default workflow.

Bootstrap the full repository:

```bash
npm ci
npm --prefix demo ci
npm --prefix website ci
npx playwright install --with-deps chromium
```

Useful root commands:

```bash
npm test
npm run test:types
npm run test:ts
npm run build
npm run test:docs
npm run test:pack
npm run test:e2e
npm run test:e2e:ci
npm run ci
```

Useful focused commands:

```bash
npm run demo
npm run demo:mock
npm --prefix demo run test
npm --prefix website run build
```

## Testing And Quality Gates

- Do not merge changes that leave `npm test`, `npm run test:types`, `npm run test:ts`, `npm run build`, `npm run test:docs`, `npm run test:pack`, or `npm run test:e2e:ci` failing.
- `npm run ci` is the release gate. If you are preparing a release or changing packaging, run it.
- Treat docs, templates, examples, and website output as product surface. Regressions there count as real regressions.
- Prefer additive, well-scoped patches. Expand existing tests instead of creating parallel ad hoc validation paths.

For E2E work:

- The canonical browser suite lives in `tests/e2e/` and uses Playwright.
- The blocking suite is hermetic and runs the demo against `next start`, not `next dev`.
- If a change touches visible UI in the demo, add or update Playwright coverage and follow the artifact guidance in `tests/e2e/README.md`.
- Reuse `tests/e2e/fixtures.ts` so console errors, page errors, failed requests, and unexpected `4xx` or `5xx` responses stay gated.
- If a scenario depends on runtime or external services, add or extend hermetic fixture logic in `demo/src/lib/e2e.ts` and the relevant test-only API routes.

Validation fidelity rules:

- Hermetic Playwright coverage is required, but it is not sufficient for host-dependent bugs.
- Host-dependent bugs include installation or uninstall flows, OAuth and login flows, PATH or binary resolution, filesystem state under the user home, local process management, SDK or CLI detection, and polling or UI state driven by the local runtime.
- If the user reports a bug on a specific localhost mode such as `localhost:4300`, the fix must also be validated in that same mode before closing the task.
- Do not claim a host-dependent bug is fixed if only the hermetic E2E passed. Treat that as partial validation until the real localhost or host-equivalent validation also passes.
- If fixtures, interceptors, or `CLAWJS_E2E` short-circuit the real runtime behavior, that only validates the UI flow. It does not prove the real bug is fixed.
- Final screenshots for host-dependent fixes must come from the same mode that was actually validated, not only from the hermetic test server.

Never run real smoke coverage automatically:

- `npm run test:e2e:smoke-real` is manual and opt-in only.
- Do not point smoke tests at production by default.
- Do not touch paid APIs, real user data, or production services without explicit user approval in the current thread.

## Branches, Commits, And Pull Requests

Long-lived branches:

- `main`: always releasable. Normal source for releases.
- `next`: integration branch for work ready for broader validation.
- `release/0.x`: stabilization or hotfix branch for the supported `0.x` line.

Create short-lived branches from the branch you intend to merge into:

- `feat/<scope>`
- `fix/<scope>`
- `docs/<scope>`
- `chore/<scope>`
- `refactor/<scope>`

Commit message format is mandatory:

```text
type(scope): description
```

Examples:

- `feat(cli): add workspace inspect output`
- `fix(e2e): stabilize demo settings reset flow`
- `docs(repo): document release branch policy`

Pull request rules:

- Keep PRs scoped and reviewable.
- Target `main` for releasable work, `next` for queued integration work, and `release/*` only for stabilization or hotfixes.
- Prefer squash merges.
- Treat `main`, `next`, and `release/*` as protected branches.
- Keep `CI` and `Release Gate` green before merge.
- If a PR changes onboarding, installation, imports, CLI usage, support tiers, docs, or templates, update the related documentation in the same PR.
- Keep release-prep changes explicit: changelog, docs, versioning, packaging, and validation should land together.

## Release Notes

- Do not publish if `npm run ci` fails.
- Before release, run `npm run publish:dry-run`.
- Create release tags as `v<semver>`.
- Tag normal releases from `main`.
- Tag patch-only emergency releases from `release/0.x` when you must avoid pulling in all queued `next` work.

## Security And Secret Handling

- Never commit plaintext credentials, API keys, or `.env` files with real secrets.
- Prefer provider login flows, environment injection, or external secret stores over hardcoded credentials.
- For any real secret access, use secure secret storage and avoid reading or printing raw secret values.
- Do not log or print raw credentials. ClawJS masks some common secret fields, but callers still must avoid exposing secrets.
- Do not open public issues for vulnerabilities that could expose credentials, workspace contents, or remote execution paths. Report them privately to maintainers first.
- Workspace audit logs live under `.clawjs/audit/`; if you change audit or logging behavior, review redaction and retention expectations.

## Product And API Expectations

- `@clawjs/claw` is the official SDK package.
- `@clawjs/node` is a compatibility wrapper, not the primary surface.
- `@clawjs/cli` is the official CLI package.
- Adapter support level is part of the public contract. Do not document experimental adapters as production-ready unless support metadata and docs are updated together.
- Capability maps must preserve the invariant: `supported=false` implies `status="unsupported"`, and `status="unsupported"` implies `supported=false`.

## Agent Working Rules

- Read before changing: inspect the affected package, tests, and docs before editing.
- Prefer small, surgical patches over broad refactors unless the task explicitly asks for structural change.
- Do not overwrite unrelated user changes in a dirty worktree.
- For every change, review the relevant docs, README files, examples, templates, and website content to confirm they still match the current behavior, APIs, and workflows; update them in the same patch whenever they are stale.
- When you touch a package, verify whether corresponding docs, templates, smoke coverage, and repository surface checks also need updates.
- When you add or rename public packages, commands, or scaffolding behavior, update docs and package-surface coverage.
- If unsure about release or merge target, check `docs/git-workflow.md` and document any assumption you make.

## First Files To Read For Common Tasks

- New contributor or new agent: `README.md`
- Local workflow and merge expectations: `CONTRIBUTING.md`
- Branch policy: `docs/git-workflow.md`
- Release work: `RELEASING.md`
- Security-sensitive work: `SECURITY.md`
- E2E or demo changes: `tests/e2e/README.md`
- Runtime and workspace behavior: `docs/setup.md`, `docs/support-matrix.md`, `docs/runtime-migration-notes.md`
- Agent operational wiki: `agents/wiki/README.md`
- OpenClaw host-dependent debugging: `agents/wiki/openclaw.md`
