---
title: Conversations
description: Session storage, normalized stream events, and adapter-aware transport behavior.
---

# Conversations

Conversation data lives in `.clawjs/conversations/<session-id>.jsonl`. The store keeps session headers and message events in a line-delimited format, independent of the selected runtime adapter.

## Listing sessions

The Node API exposes:

- `claw.conversations.createSession(title?)`
- `claw.conversations.appendMessage(sessionId, message)`
- `claw.conversations.listSessions()`
- `claw.conversations.searchSessions({ query, strategy?, ... })`
- `claw.conversations.getSession(sessionId)`
- `claw.conversations.updateSessionTitle(sessionId, title)`
- `claw.conversations.generateTitle({ sessionId, transport? })`

CLI equivalents:

```bash
claw \
  --runtime hermes \
  sessions list \
  --workspace /path/to/workspace

claw \
  --runtime hermes \
  sessions read \
  --workspace /path/to/workspace \
  --session-id clawjs-123

claw \
  --runtime openclaw \
  sessions search \
  --workspace /path/to/workspace \
  --query "budget review" \
  --strategy auto \
  --json
```

`sessions list` returns summaries sorted by most recently updated session. Each summary includes `sessionId`, `title`, `createdAt`, `updatedAt`, `messageCount`, and `preview`.

`searchSessions()` supports:

- `strategy: "local"` for plain transcript text search over titles, previews, and stored messages
- `strategy: "openclaw-memory"` to delegate to `openclaw memory search --json` and map session hits back to local session summaries
- `strategy: "auto"` to prefer OpenClaw memory search on the `openclaw` adapter and fall back to local transcript search when needed

## Structured streaming

`streamAssistantReplyEvents` yields a structured event stream, and `streamAssistantReply` yields the raw chunks only.

The normalized event union is:

- `transport`
- `retry`
- `chunk`
- `done`
- `title`
- `error`
- `aborted`

Example:

```ts
for await (const event of claw.conversations.streamAssistantReplyEvents({
  sessionId: "clawjs-123",
  transport: "auto",
})) {
  if (event.type === "chunk") {
    process.stdout.write(event.chunk.delta);
  }
}
```

With the CLI, `sessions stream --events` emits newline-delimited JSON events. Without `--events`, the command streams assistant text directly.

```bash
claw \
  --runtime hermes \
  sessions stream \
  --workspace /path/to/workspace \
  --session-id clawjs-123 \
  --events
```

## Transport behavior

The conversation core is adapter-driven. An adapter can expose:

- CLI prompt transport
- HTTP transport
- SSE
- WebSocket
- hybrid gateway + CLI fallback

If the preferred transport fails and the adapter supports fallback, ClawJS falls back automatically and emits a `transport` event.

That matters for consumers that want deterministic logs:

- watch `transport` to see whether gateway, SSE, WS, or CLI was used
- watch `retry` when a gateway/SSE/WS transport is retried
- watch `title` if you want the session title synchronized with the conversation

The transcript parser remains runtime-agnostic and can derive a title from the first meaningful user or assistant message when no explicit title is present.
