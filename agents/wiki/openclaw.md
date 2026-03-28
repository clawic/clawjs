# OpenClaw Learnings

Operational notes for ClawJS maintainers and coding agents. This is not public product documentation. Use it to avoid repeating the same incorrect assumptions during host-dependent debugging.

## Canonical Paths

- Treat `~/.openclaw` as the only supported OpenClaw state root.
- Treat `~/.openclaw/openclaw.json` as the canonical runtime config file.
- Treat `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` as the persisted provider auth store.
- Treat `~/.openclaw/workspaces/<agentId>` as the canonical workspace root for the agent.
- `~/.clawdbot` is legacy. Only touch it during cleanup, never as a supported runtime path.

## Runtime Truth Sources

- For provider auth and default-model state, trust `openclaw models --agent <agentId> status --json` plus the auth store.
- Do not assume the in-memory app status and the runtime status match unless both were read fresh after the same action.
- If OAuth completed but the UI still says auth is missing, inspect the runtime default model first. A stale unauthenticated default model can make the app look disconnected even when OAuth is present.

## CLI Output Gotchas

- `openclaw agent --json` is not guaranteed to emit clean JSON on `stdout`.
- When the gateway falls back to the embedded runtime, OpenClaw can print banner lines and the JSON payload to `stderr`.
- Any SDK parser that consumes `openclaw agent --json` or title-generation output must consider combined `stdout + stderr` and must tolerate a non-JSON preamble before the final JSON object.

## Auth And Model Reconciliation

- OAuth success alone is not enough if the runtime default model still points to an unauthenticated provider.
- After connecting a provider, verify the default model is authenticated for the provider summaries returned by `models status --json`.
- If the current default model is unauthenticated and another authenticated provider exists, reconcile the default model before deciding that auth is missing.
- OpenClaw can inherit provider auth from `~/.openclaw/agents/main/agent/auth-profiles.json` when the current agent store is empty.
- OpenClaw also syncs `openai-codex` credentials from external Codex CLI sources while loading auth state. In practice that means macOS Keychain and `~/.codex/auth.json` can repopulate ChatGPT auth even after deleting the current agent store.
- Deleting `~/.openclaw/agents/<agentId>/agent/auth-profiles.json` is therefore not a reliable way to model “ChatGPT disconnected”.
- For `openai-codex`, treat the UI toggle as “enabled for this agent” rather than “global logout”. If the external Codex auth exists, enabling should reuse it; disabling should stop this agent from using it.

## Validation Rules

- For installation, OAuth, PATH, filesystem, process, or polling bugs, hermetic E2E is necessary but not sufficient.
- Reproduce and validate on the same host mode the user is using, usually `http://localhost:4300`.
- Do not close a host-dependent bug from the hermetic server alone.

## Cleanup Checklist For Manual Repro

- Stop any app servers using `4300` and `4317`.
- Remove `~/.openclaw`.
- Remove `~/.clawdbot` if it exists.
- Verify `command -v openclaw` returns nothing when testing a clean-install path.
- If `openclaw` is still detected after uninstall, inspect common stray locations:
  - the active global npm prefix
  - `/Users/trabajo/node_modules/openclaw`
  - `/Users/trabajo/node_modules/.bin/openclaw`
  - any nvm-managed global install
- For a truly clean ChatGPT subscription repro, clearing `~/.openclaw` is not enough. Also inspect:
  - `~/.codex/auth.json`
  - the macOS Keychain entry used by Codex CLI
  - `~/.openclaw/agents/main/agent/auth-profiles.json`
- After cleanup, verify `/api/integrations/status` reports `installed=false` and `/api/integrations/auth` reports `cliAvailable=false` before starting the onboarding test.

## Manual Smoke Order

1. Validate the app starts with OpenClaw fully absent.
2. Install OpenClaw from onboarding or settings.
3. Wait for the OpenClaw status to settle and show the ready state.
4. Connect ChatGPT OAuth.
5. Wait for the auth state to settle and confirm the default model is authenticated.
6. Open chat and send a real message.
7. Confirm the chat stream succeeds and title generation does not fail in the background.
