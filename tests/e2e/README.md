# E2E And Smoke Tests

This directory is the canonical end-to-end test suite for the repository.

The blocking standard is:

- Browser-level coverage runs through Playwright.
- The demo runs in a hermetic mode against `next start`, never `next dev`.
- The suite must not touch production services, paid APIs, or live user data.

## Entry points

Use the root scripts in [package.json](../../package.json):

```bash
npx playwright install --with-deps chromium
npm run test:e2e
npm run test:e2e:ci
npm run test:e2e:smoke-real
```

Meaning:

- `test:e2e`: local blocking suite. Builds packages, cleans stale Next dev output, builds the demo into `.next-e2e`, then runs the segmented Playwright runner.
- `test:e2e:ci`: same contract, intended for CI.
- `test:e2e:smoke-real`: reserved for manual opt-in tests that use real integrations. This suite is non-blocking and must never run automatically without explicit confirmation.

The Playwright invocation goes through [scripts/run-e2e.mjs](../../scripts/run-e2e.mjs). That runner:

- executes one spec file per Playwright process
- clears port `4317` before each spec file
- avoids the long-lived `webServer` degradation seen in a monolithic `playwright test`

## Current suite

The current Playwright specs are:

- [demo-api-coverage.spec.ts](./demo-api-coverage.spec.ts)
  Exhaustively validates seeded list/read/mutation contracts across demo collections, chat sessions, integrations, admin endpoints, and config redaction behavior.

- [demo-api.spec.ts](./demo-api.spec.ts)
  Validates hermetic API contracts for reset/status, notes, tasks, personas, plugins, routines, usage, activity, health, workspace files, TTS, chat title generation, and auth/integration endpoints.

- [demo-calendar.spec.ts](./demo-calendar.spec.ts)
  Covers calendar event creation, inspection, and deletion in hermetic mode.

- [demo-chat.spec.ts](./demo-chat.spec.ts)
  Covers the main chat journey: open app, send a message, stream the assistant reply, and verify persisted sessions.

- [demo-contacts.spec.ts](./demo-contacts.spec.ts)
  Covers contacts/people browser CRUD plus hermetic contacts and people API contracts.

- [demo-onboarding.spec.ts](./demo-onboarding.spec.ts)
  Covers fresh-workspace boot into onboarding.

- [demo-settings-deep.spec.ts](./demo-settings-deep.spec.ts)
  Covers locale/profile persistence, workspace file editing, and the hermetic integration flows for WhatsApp, Telegram, Slack, email, calendar, and contacts.

- [demo-settings.spec.ts](./demo-settings.spec.ts)
  Covers destructive reset from settings and verifies the app returns to first-run onboarding.

- [demo-system.spec.ts](./demo-system.spec.ts)
  Covers usage budget persistence, deterministic activity filtering, health repair flows, and sidebar/session navigation persistence.

- [demo-tools.spec.ts](./demo-tools.spec.ts)
  Covers browser journeys for images, skills, personas, plugins, and routines.

- [demo-workspace.spec.ts](./demo-workspace.spec.ts)
  Covers browser journeys for notes, tasks/goals, memory, and inbox with persistence and destructive flows.

- [generator-smoke.spec.ts](./generator-smoke.spec.ts)
  Scaffolds a `create-claw-app` project into a temp directory, installs dependencies, builds it, boots it, and performs a smoke request.

- [sdk-openclaw-binary-path.spec.ts](./sdk-openclaw-binary-path.spec.ts)
  Verifies the published SDK can target an explicit OpenClaw binary path even when the binary is not available on `PATH`, and captures a final validation screenshot.

- [repository-package-surface.spec.ts](./repository-package-surface.spec.ts)
  Verifies unpublished package names are absent from the public repo surface and captures a final browser screenshot of the cleaned docs state.

- [repository-release-readiness.spec.ts](./repository-release-readiness.spec.ts)
  Verifies the repository keeps the expected OSS release baseline.

## How hermetic mode works

The Playwright runner is configured in [playwright.config.ts](../../playwright.config.ts).

It starts the demo with:

- `CLAWJS_E2E=1`
- `CLAWJS_E2E_FIXTURE_MODE=hermetic`
- `CLAWJS_E2E_DISABLE_EXTERNAL_CALLS=1`
- a dedicated E2E port: `4317`
- isolated workspace/config/state/session/data directories
- `NEXT_DIST_DIR=.next-e2e`
- `cd demo && npm run start -- --port 4317` so `next start` always resolves the hermetic build from the demo package cwd

The demo fixture layer lives in [demo/src/lib/e2e.ts](../../demo/src/lib/e2e.ts).

That module is responsible for:

- seeding deterministic state
- resetting local fixture data
- serving hermetic chat/integration/image/skill/auth responses
- exposing test-only reset/seed/status endpoints

The test-only API endpoints are:

- [demo/src/app/api/e2e/reset/route.ts](../../demo/src/app/api/e2e/reset/route.ts)
- [demo/src/app/api/e2e/seed/route.ts](../../demo/src/app/api/e2e/seed/route.ts)
- [demo/src/app/api/e2e/status/route.ts](../../demo/src/app/api/e2e/status/route.ts)

They only exist to support `CLAWJS_E2E=1`.

## Failure policy

Shared browser assertions live in [fixtures.ts](./fixtures.ts).

By default, the suite fails on:

- console errors
- uncaught page errors
- failed network requests
- unexpected `4xx` or `5xx` responses

Only a very small allowlist is ignored there. If a new expected failure appears, update the allowlist deliberately and document why.

## Visual artifacts

Key specs save explicit screenshots to:

- [artifacts/e2e](../../artifacts/e2e)

Playwright failure artifacts go to:

- [playwright-report](../../playwright-report)
- [test-results](../../test-results)

The current suite intentionally captures final settled states, not loaders.

## How to add a new E2E test

1. Add or reuse stable selectors on the affected UI.
2. If the feature depends on runtime, external APIs, or local machine state, add a hermetic branch in [demo/src/lib/e2e.ts](../../demo/src/lib/e2e.ts) and the relevant API route.
3. Add a new spec in [tests/e2e](.).
4. Reuse [fixtures.ts](./fixtures.ts) so console/network failures stay gated.
5. If the scenario changes visible UI, save at least one final-state screenshot under [artifacts/e2e](../../artifacts/e2e).
6. Run `npm run test:e2e`.

Prefer whole user journeys over isolated clicks.

Good additions are:

- onboarding branches
- CRUD flows with persistence across reloads
- destructive confirm/cancel branches
- route transitions and sidebar/session behavior
- API mutations plus resulting UI state

## Real smoke rules

`test:e2e:smoke-real` is intentionally separate.

Rules:

- Do not point it at production by default.
- Do not store plaintext credentials in repo-local env files.
- Use `Secrets Vault` plus the `secrets-proxy` binary exposed through `CLAWJS_SECRETS_PROXY_PATH` for any real secret access.
- Require explicit user confirmation before running anything with real side effects or paid calls.

If a real smoke test cannot be safely isolated, it must remain manual and advisory.

## Current limits

The current blocking suite covers the main mutable demo surfaces and the generator smoke:

- onboarding/bootstrap
- chat
- settings reset
- notes
- tasks and goals
- memory
- inbox
- images
- skills
- personas
- plugins
- routines
- usage
- activity
- health
- sidebar navigation and session switching
- hermetic API contracts
- one generator smoke
- one SDK binary-path smoke

What still remains outside the blocking browser suite is primarily depth, not breadth:

- additional edge branches inside large screens
- advisory multi-browser coverage
- real integration smoke, which must stay manual and opt-in

When adding new product work, expand this suite instead of creating parallel ad hoc browser tests.
