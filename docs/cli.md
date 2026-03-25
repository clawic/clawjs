---
title: CLI
description: Command reference for the claw CLI across scaffolding, workspace management, and adapter operations.
---

# CLI

The `claw` binary is shipped by `@clawjs/cli`. It is the primary project
entrypoint for ClawJS, while `clawjs` remains as a compatibility alias.

```bash
npm install -g @clawjs/cli
claw --help
```
## Primary Workflow

```bash
npm install -g @clawjs/cli
claw new app my-app
cd my-app
npm run claw:init

claw generate skill support-triage
claw add telegram
claw info --json
```
The official flow is now `claw new` for project creation,
`claw generate` for internal resources, and `claw add` for integrations.

## Global Flags

| Flag | Description |
|----|----|
| `--runtime` | Selects the runtime adapter. Defaults to `openclaw`. |
| `--workspace` | Selects the workspace root. Defaults to the current working directory. |
| `--app-id`, `--workspace-id`, `--agent-id` | Override workspace identity used to construct the SDK instance. |
| `--json` | Returns machine-readable output. |
| `--dry-run` | Prints command or plan output instead of mutating state when supported. |
| `--agent-dir`, `--home-dir`, `--config-path`, `--runtime-workspace`, `--auth-store` | Adapter path overrides. |
| `--gateway-url`, `--gateway-token`, `--gateway-port`, `--gateway-config` | Gateway overrides passed through to the runtime adapter. |
| `--template-pack` | Template-pack path used by `workspace init` or `files apply-template-pack`. |

## Project Commands

```bash
claw new app my-app
claw new agent support-agent
claw new server api-server
claw new workspace ops-workspace
claw new skill summarize-ticket
claw new plugin jira-integration

claw generate provider openai
claw generate channel support
claw add scheduler nightly-sync
claw add memory support-memory
```
Generated repositories include a root `claw.project.json` file. That is
how `generate`, `add`, and `info` know where to write and register
resources.

## Advanced Runtime Commands

```bash
claw --runtime openclaw runtime status
claw --runtime openclaw runtime install
claw --runtime openclaw runtime uninstall
claw --runtime openclaw runtime repair
claw --runtime openclaw runtime setup-workspace
```
Use `--dry-run` with `install`, `uninstall`, `repair`, and
`setup-workspace` to print the planned command and progress plan without
executing it.

## Compatibility Wrappers

The `create-claw-app`, `create-claw-agent`, `create-claw-server`, and
`create-claw-plugin` packages still exist, but they are compatibility
wrappers around the same scaffolding engine used by `claw new`.

## Compat and Diagnostics

```bash
claw --runtime openclaw compat
claw --runtime openclaw compat --refresh
claw --runtime openclaw doctor
```
`compat --refresh` updates the persisted runtime snapshot and state
files. `doctor` returns a combined runtime/workspace/managed-block
report.

## Workspace Commands

```bash
claw workspace init
claw workspace attach
claw workspace inspect
claw workspace discover
claw workspace validate
claw workspace reset
claw workspace repair
```
| Command | Key flags |
|----|----|
| `workspace init` | `--workspace`, `--app-id`, `--workspace-id`, `--agent-id`, optional `--template-pack` |
| `workspace discover` | `--root`, `--max-depth` |
| `workspace reset` | `--remove-manifest`, `--remove-compat`, `--remove-bindings`, `--remove-state`, `--remove-conversations`, `--remove-audit`, `--remove-backups`, `--remove-locks`, `--remove-runtime-files` |

## Files Commands

```bash
claw files read --file SOUL.md
claw files write --file SOUL.md --value "new content"
claw files inspect --file SOUL.md
claw files diff --file SOUL.md --block-id tone --key tone --value direct
claw files sync --file SOUL.md --block-id tone --key tone --value direct
claw files apply-template-pack --template-pack ./pack.json
```
`files diff` and `files sync` are binding-oriented helpers. They
construct a `managed_block` binding from `--file`, `--block-id`,
`--key`, and `--value`.

## Auth and Models

```bash
claw auth status
claw auth login --provider openai
claw auth remove --provider openai

claw models list
claw models default
claw models set-default --model openai/gpt-4.1
```
`auth login` supports `--set-default=false`. `models set-default`
supports `--dry-run` and prints the adapter-specific command that would
be executed.

## Scheduler, Memory, Skills, and Channels

```bash
claw scheduler list
claw scheduler run --id morning-sync
claw scheduler enable --id morning-sync
claw scheduler disable --id morning-sync

claw memory list
claw memory status
claw memory inspect
claw memory search --query incident

claw skills list
claw skills inspect
claw skills sync

claw channels list
claw channels status
```
## Telegram

```bash
claw telegram connect --secret-name my_bot_token
claw telegram status
claw telegram webhook set --url https://example.com/telegram
claw telegram webhook clear
claw telegram polling start
claw telegram polling stop
claw telegram commands set --commands '[{"command":"help","description":"Show help"}]'
claw telegram commands get
claw telegram chats list
claw telegram chats inspect --chat-id 123
claw telegram send --chat-id 123 --text "hello"
```
| Command | Key flags |
|----|----|
| `telegram connect` | `--secret-name`, optional `--api-base-url`, `--webhook-url`, `--webhook-secret-token`, `--allowed-updates`, `--drop-pending-updates` |
| `telegram webhook set` | `--url` or `--webhook-url`, optional `--webhook-secret-token`, `--allowed-updates`, `--drop-pending-updates`, `--max-connections`, `--ip-address` |
| `telegram polling start` | optional `--limit`, `--timeout`, `--allowed-updates`, `--drop-pending-updates` |
| `telegram commands set` | `--commands` JSON array of `{ command, description }` |
| `telegram chats inspect` | `--chat-id` |
| `telegram send` | `--chat-id` and either `--text` or `--media`. Optional `--type`, `--caption`, `--parse-mode`, `--reply-to-message-id`, `--message-thread-id` |

## Sessions

```bash
claw sessions create --title "Repo tour"
claw sessions list
claw sessions read --session-id clawjs-123
claw sessions generate-title --session-id clawjs-123
claw sessions stream --session-id clawjs-123
claw sessions stream --session-id clawjs-123 --events
```
`sessions stream` supports `--transport`, `--system-prompt`,
`--context`, `--chunk-size`, and `--gateway-retries`. With `--events`,
the command emits the structured event stream used by the SDK.

## Exit Codes

| Code | Meaning                                |
|------|----------------------------------------|
| `0`  | Command completed successfully.        |
| `1`  | Command failed.                        |
| `2`  | Command completed in a degraded state. |
| `64` | Invalid usage.                         |
