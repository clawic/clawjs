---
title: Watchers & Events
description: File watchers, polling watchers, and the internal Claw event bus.
---

# Watchers & Events

The watcher surface has two layers:

- Instance-bound watchers on `claw.watch`.
- Standalone helpers such as `watchPolledValue` and `ClawEventBus`.

## claw.watch Methods

| Method | Description |
|----|----|
| `file(fileName, callback, options?)` | Watches one workspace-relative file. |
| `transcript(sessionId, callback, options?)` | Watches `.clawjs/conversations/<session-id>.jsonl` for changes. |
| `runtimeStatus(callback, options?)` | Polls `claw.runtime.status()` and emits changed values. |
| `providerStatus(callback, options?)` | Polls provider auth summaries and emits changed values. |
| `events(type, listener)` | Subscribes to the internal event bus for one event type or `*`. |
| `eventsIterator(type?)` | Returns an async iterator over the internal event bus. |

## File and Transcript Watchers

Both `file()` and `transcript()` use the same callback shape:

```ts
type WatchCallback = (event: {
  eventType: string;
  filePath: string;
}) => void;

interface WatchOptions {
  debounceMs?: number;
}

const stopFile = claw.watch.file("SOUL.md", (event) => {
  console.log(event.eventType, event.filePath);
});

const stopTranscript = claw.watch.transcript("clawjs-123", async () => {
  const session = claw.conversations.getSession("clawjs-123");
  console.log(session?.messageCount);
});

stopFile();
stopTranscript();
```
`transcript()` does not parse messages for you. It is just a watcher
over the transcript file; call `claw.conversations.getSession()` or read
the JSONL file yourself inside the callback if you need structured
transcript data.

## Polling Watchers

```ts
type PollWatchOptions = {
  intervalMs?: number;
  emitInitial?: boolean;
};

const stopRuntime = claw.watch.runtimeStatus((status) => {
  console.log(status.adapter, status.capabilityMap);
}, { intervalMs: 5_000, emitInitial: true });

const stopProviders = claw.watch.providerStatus((providers) => {
  console.log(Object.keys(providers));
}, { intervalMs: 10_000, emitInitial: true });

stopRuntime();
stopProviders();
```
The standalone helper `watchPolledValue(read, callback, options?)`
exposes the same polling model for arbitrary async values:

```ts
import { watchPolledValue } from "@clawjs/claw";

const stop = watchPolledValue(
  async () => (await claw.models.list()).map((model) => model.id),
  (ids) => console.log(ids),
  { intervalMs: 30_000, emitInitial: true },
);

stop();
```
## Internal Event Bus

`claw.watch.events()` and `claw.watch.eventsIterator()` are backed by an
internal `ClawEventBus`. Supported event names are open-ended strings.
Use `*` to subscribe to all of them.

```ts
const stop = claw.watch.events("workspace.initialized", (event) => {
  console.log(event.type, event.timestamp, event.payload);
});

const stopAll = claw.watch.events("*", (event) => {
  console.log(event.type);
});

for await (const event of claw.watch.eventsIterator("*")) {
  console.log(event.type, event.payload);
  break;
}

stop();
stopAll();
```
## Built-In Event Names

ClawJS emits the following event names from the current instance
implementation:

```ts
workspace.initialized
workspace.repaired
workspace.reset

runtime.progress
runtime.installed
runtime.uninstalled
runtime.repaired
runtime.workspace_setup

auth.progress
auth.login_started
auth.api_key_saved
auth.provider_removed

files.template_pack_applied
files.binding_synced
files.settings_updated
files.workspace_written

compat.refreshed
models.default_set

scheduler.run
scheduler.enabled
scheduler.disabled
skills.synced

telegram.connected
telegram.webhook_configured
telegram.webhook_disabled
telegram.polling_started
telegram.polling_stopped
telegram.commands_set
telegram.updates_synced
telegram.update_ingested

conversations.session_created
conversations.message_appended
conversations.title_updated
conversations.title_generated
conversations.title_suggested
conversations.assistant_stream_persisted
```
The payload shape depends on the event. Subscribe once with `*` and
inspect the observed payloads if you need to build a typed wrapper for
your application.

## ClawEventBus

If you need your own application-level event bus, use the exported
`ClawEventBus` directly. This is also the correct surface for custom
event emission. The instance-level `claw.watch` object does not expose
`emit()`.

```ts
import { ClawEventBus } from "@clawjs/claw";

const bus = new ClawEventBus();
const stop = bus.on("deploy.started", (event) => {
  console.log(event.payload);
});

bus.emit("deploy.started", { environment: "staging" });

for await (const event of bus.iterate("*")) {
  console.log(event.type);
  break;
}

stop();
```
## Cleanup

Every watcher returns a cleanup function. Always call it when the
watcher is no longer needed.

```ts
const cleanups: Array<() => void> = [];

cleanups.push(claw.watch.file("SOUL.md", () => {}));
cleanups.push(claw.watch.events("*", () => {}));
cleanups.push(claw.watch.runtimeStatus(() => {}));

for (const cleanup of cleanups) cleanup();
```
