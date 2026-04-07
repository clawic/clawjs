---
title: API Reference
description: Runtime-facing instance namespaces, options, and public methods in @clawjs/claw.
---

# API Reference

This page documents the runtime-facing `@clawjs/claw` surface you use in
application code. The exhaustive export inventory for `@clawjs/claw` and
`@clawjs/core` lives in [Public Surface](/surface).

## Factories

```ts
import { Claw, createClaw } from "@clawjs/claw";

const claw = await Claw({
  runtime: {
    adapter: "openclaw",
  },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
});

const same = await createClaw({
  runtime: { adapter: "openclaw" },
  workspace: {
    appId: "demo",
    workspaceId: "demo-main",
    agentId: "demo-main",
    rootDir: "./workspace",
  },
});
```
## CreateClawOptions

| Path | Description |
|----|----|
| `runtime.adapter` | Required runtime adapter id such as `openclaw`, `demo`, `hermes`, or `ironclaw`. |
| `runtime.agentDir` | Optional runtime agent directory override. |
| `runtime.homeDir`, `configPath`, `workspacePath`, `authStorePath` | Optional adapter-specific path overrides. |
| `runtime.gateway` | Optional gateway `url`, `token`, `port`, and `configPath` overrides. |
| `runtime.env` | Optional environment override passed to adapter commands. |
| `workspace.appId` | Stable application id persisted in the manifest. |
| `workspace.workspaceId` | Stable workspace id. |
| `workspace.agentId` | Stable agent id for runtime-specific state. |
| `workspace.rootDir` | Workspace root on disk. |
| `templates.pack` | Optional template-pack path applied during workspace initialization. |

## Instance Namespaces

| Namespace | Methods |
|----|----|
| `claw.runtime` | `context`, `status`, `gateway.*`, install/uninstall/repair/setup methods, command builders, plan builders, OpenClaw context helpers |
| `claw.workspace` | `init`, `attach`, `validate`, `repair`, `previewReset`, `reset`, `listManagedFiles`, `canonicalPaths`, `inspect` |
| `claw.intent` | `get`, `set`, `patch`, `plan`, `apply`, `diff` |
| `claw.observed` | `read`, `refresh` |
| `claw.features` | `describe` |
| `claw.files` | template packs, binding sync, settings schema/value storage, workspace file read/write/preview/inspect, managed block helpers |
| `claw.compat` | `refresh`, `read` |
| `claw.doctor` | `run` |
| `claw.models` | `list`, `catalog`, `getDefault`, `setDefault` |
| `claw.providers` | `list`, `catalog`, `authState` |
| `claw.auth` | `status`, `diagnostics`, `prepareLogin`, `login`, `setApiKey`, `saveApiKey`, `setProviderEnabled`, `removeProvider` |
| `claw.scheduler` | `list`, `run`, `enable`, `disable` |
| `claw.memory` | `list`, `search` |
| `claw.skills` | `list`, `sync`, `sources`, `search`, `install` |
| `claw.generations` | backend registry plus generic generation create/list/read/delete |
| `claw.image`, `claw.audio`, `claw.video` | typed generation facades over the generic store |
| `claw.tts` | synthesize, config helpers, provider catalog, text segmentation, playback planning |
| `claw.channels` | `list` |
| `claw.telegram` | secret provisioning, bot connection, webhook and polling control, commands, chat inspection, moderation, invite links, update sync |
| `claw.slack` | bot connection, status, channel lookup, message send |
| `claw.whatsapp` | connection lifecycle, status, send, disconnect |
| `claw.inference` | `generateText` |
| `claw.secrets` | `list`, `describe`, `doctorKeychain`, `ensureHttpReference`, `ensureTelegramBotReference` |
| `claw.conversations` | session CRUD, title generation, structured reply streaming, chunk streaming |
| `claw.documents` | list, get, search, upload, register, chunked upload, download, ref resolution |
| `claw.data` | `document`, `collection`, `asset`, `rootDir` |
| `claw.orchestration` | `snapshot` |
| `claw.watch` | `file`, `transcript`, `runtimeStatus`, `providerStatus`, `events`, `eventsIterator` |

## Runtime

```ts
const status = await claw.runtime.status();
const context = claw.runtime.context();

await claw.runtime.install("npm");
await claw.runtime.setupWorkspace();

const gateway = await claw.runtime.gateway.status();
await claw.runtime.gateway.start();
await claw.runtime.gateway.waitUntilReady({ timeoutMs: 15_000 });
```
`claw.runtime` also exposes command builders and plan builders for
install, uninstall, repair, and workspace setup:

```text
claw.runtime.installCommand();
claw.runtime.uninstallCommand();
claw.runtime.repairCommand();
claw.runtime.setupWorkspaceCommand();

claw.runtime.installPlan();
claw.runtime.uninstallPlan();
claw.runtime.repairPlan();
claw.runtime.setupWorkspacePlan();
```
For OpenClaw-specific app-state management, the same namespace exposes
`discoverContext` and `detachWorkspace`.

When the adapter is `openclaw`, `claw.runtime.plugins` also exposes the
managed bridge workflow for the ClawJS plugin packages:

```ts
const pluginStatus = await claw.runtime.plugins.status();
await claw.runtime.plugins.ensure();
await claw.runtime.plugins.install("all");
await claw.runtime.plugins.enable("all");
const clawjsStatus = await claw.runtime.plugins.clawjs.status();
```

Use this namespace when you want to manage the OpenClaw bridge from app
code without shelling out yourself.

## Workspace

```ts
await claw.workspace.init();
const manifest = await claw.workspace.attach();
const validation = await claw.workspace.validate();
const repaired = await claw.workspace.repair();
const resetPlan = await claw.workspace.previewReset({ removeConversations: true });
const resetResult = await claw.workspace.reset({ removeConversations: true });
const inspection = await claw.workspace.inspect();
```
`inspect()` returns both resolved workspace file paths and the parsed
manifest, compat snapshot, observed snapshots, and the current
intent/observed stores currently persisted in the workspace.

## Intent, Observed, and Features

```ts
const allIntents = claw.intent.get();
const modelsIntent = claw.intent.get("models");
await claw.intent.patch("models", { defaultModel: "openai/gpt-5.4" });
await claw.intent.plan({ domains: ["models", "providers"] });
await claw.intent.apply({ domains: ["models", "providers"] });
const drift = await claw.intent.diff({ domains: ["models", "providers"] });

const observed = claw.observed.read();
await claw.observed.refresh({ domains: ["models", "providers", "channels"] });

const features = claw.features.describe();
```

The ownership model is the important bit:

- `intent` stores desired SDK-owned state under `.clawjs/intents/`
- `observed` stores rebuildable runtime-derived state under `.clawjs/observed/`
- `features.describe()` tells you which domains are adapter-owned, SDK-owned, or mixed before you call `apply()`

That keeps UI and automation code from guessing which side owns a given
setting.
## Files

The file surface is documented in depth in [Files & Templates](/files). The runtime-facing methods are:

```ts
await claw.files.applyTemplatePack("/path/to/pack.json");

claw.files.diffBinding(binding, settings, render);
claw.files.syncBinding(binding, settings, render);

claw.files.readBindingStore();
claw.files.writeBindingStore(bindings);
claw.files.readSettingsSchema();
claw.files.writeSettingsSchema(schema);
claw.files.readSettingsValues();
claw.files.writeSettingsValues(values);
claw.files.validateSettings(values);
claw.files.renderTemplate(template, values);
claw.files.updateSettings(values, { autoSync: true, renderers });

claw.files.readWorkspaceFile("SOUL.md");
claw.files.writeWorkspaceFile("SOUL.md", nextContent);
claw.files.writeWorkspaceFilePreservingManagedBlocks("SOUL.md", nextContent);
claw.files.previewWorkspaceFile("SOUL.md", nextContent);
claw.files.inspectWorkspaceFile("SOUL.md");
claw.files.inspectManagedBlock("SOUL.md", "tone");
claw.files.mergeManagedBlocks(original, edited);
```
## Models, Providers, and Auth

```ts
const providers = await claw.providers.list();
const providerCatalog = await claw.providers.catalog();
const authState = await claw.providers.authState();

const models = await claw.models.list();
const modelCatalog = await claw.models.catalog();
const defaultModel = await claw.models.getDefault();
await claw.models.setDefault("openai/gpt-4.1");

const summaries = await claw.auth.status();
const authDiagnostics = claw.auth.diagnostics("openai");
const loginPlan = await claw.auth.prepareLogin("openai");
const loginResult = await claw.auth.login("openai", { setDefault: true });
claw.auth.setApiKey("openai", "sk-...", "default");
await claw.auth.saveApiKey("openai", "sk-...");
await claw.auth.setProviderEnabled("openai-codex", true, { preferredAuthMode: "oauth" });
claw.auth.removeProvider("openai");
```
These auth operations also update the canonical provider intent under
`.clawjs/intents/providers.json`, while observed auth summaries stay
rebuildable under `.clawjs/observed/providers.json`.

`prepareLogin()` tells you whether ClawJS can reuse existing auth for the
requested provider or whether an interactive flow still needs to be
launched. `login()` returns the same distinction plus the launch mode when
an interactive flow starts.

For real secrets, prefer the `claw.secrets` helpers plus your
provider-specific wrapper rather than hardcoding credentials in source.

## Speech / TTS

```ts
const ttsConfig = claw.tts.config();

claw.tts.setConfig({
  provider: "openai",
  enabled: true,
  autoRead: true,
  voice: "nova",
  model: "tts-1",
});

await claw.intent.apply({ domains: ["speech"] });
```
## Optional Runtime Subsystems

```ts
await claw.scheduler.list();
await claw.scheduler.run("daily-summary");
await claw.scheduler.enable("daily-summary");
await claw.scheduler.disable("daily-summary");

await claw.memory.list();
await claw.memory.search("incident");

await claw.skills.list();
await claw.skills.sync();

await claw.channels.list();
```
Always check `status.capabilityMap` before assuming these subsystems are
supported by the current adapter.

## Generations And Typed Media Facades

The generic generation store is useful when you want one API for image,
audio, video, or document jobs, while the typed facades remove the need
to pass `kind` repeatedly.

```ts
const backends = claw.generations.backends();
await claw.generations.registerCommandBackend({
  id: "local-imagen",
  label: "Local Imagen",
  supportedKinds: ["image"],
  command: "node",
  args: ["scripts/generate-image.mjs"],
});

const generic = await claw.generations.create({
  kind: "image",
  prompt: "Minimal line-art cat",
});

const image = await claw.image.generate({
  prompt: "Minimal line-art cat",
});

const audio = await claw.audio.generate({
  prompt: "Read the summary aloud",
});
```

Records and generated files are stored under the workspace data layer,
so the same app can browse prior outputs later with `list()`, `get()`,
and `remove()`.

## Telegram and Secrets

```ts
await claw.telegram.provisionSecretReference({
  secretName: "my_bot_token",
  apiBaseUrl: "https://api.telegram.org",
});

await claw.telegram.connectBot({ secretName: "my_bot_token" });
await claw.telegram.status();
await claw.telegram.configureWebhook({ url: "https://example.com/telegram" });
await claw.telegram.disableWebhook();
await claw.telegram.startPolling({ timeoutSeconds: 30 });
await claw.telegram.stopPolling();
await claw.telegram.setCommands([{ command: "help", description: "Show help" }]);
await claw.telegram.getCommands();
await claw.telegram.listChats();
await claw.telegram.getChat(123);
await claw.telegram.getChatAdministrators(123);
await claw.telegram.getChatMember(123, 456);
await claw.telegram.setChatPermissions(123, { can_send_messages: false });
await claw.telegram.banOrRestrictMember({ action: "ban", chatId: 123, userId: 456 });
await claw.telegram.createInviteLink(123, { name: "Support" });
await claw.telegram.revokeInviteLink(123, "https://t.me/+...");
await claw.telegram.sendMessage({ chatId: 123, text: "hello" });
await claw.telegram.sendMedia({ type: "photo", chatId: 123, media: "https://..." });
await claw.telegram.syncUpdates();
await claw.telegram.ingestUpdate(updatePayload);

await claw.secrets.list("telegram");
await claw.secrets.describe("my_bot_token");
await claw.secrets.doctorKeychain();
await claw.secrets.ensureHttpReference({
  name: "service_token",
  allowedHosts: ["api.example.com"],
  allowedHeaderNames: ["Authorization"],
});
await claw.secrets.ensureTelegramBotReference({
  name: "my_bot_token",
  apiBaseUrl: "https://api.telegram.org",
});
```

Slack and WhatsApp currently live on the same instance when the adapter
supports them:

```ts
await claw.slack.connectBot({ secretName: "slack_bot" });
await claw.slack.listChannels();

await claw.whatsapp.connect({
  mode: "business-api",
  secretName: "wa_token",
  phoneNumberId: "1234567890",
});
await claw.whatsapp.status();
```

The CLI does not expose these namespaces yet. Use the SDK when you need
them.
## Inference and Conversations

```ts
const result = await claw.inference.generateText({
  messages: [{ role: "user", content: "Summarize the repo." }],
  transport: "auto",
});

const session = claw.conversations.createSession("Repo tour");
claw.conversations.appendMessage(session.sessionId, {
  role: "user",
  content: "Explain the runtime layout.",
});

const loaded = claw.conversations.getSession(session.sessionId);
const sessions = claw.conversations.listSessions();
claw.conversations.updateSessionTitle(session.sessionId, "Runtime layout");
await claw.conversations.generateTitle({ sessionId: session.sessionId });

const document = await claw.documents.upload({
  name: "brief.txt",
  mimeType: "text/plain",
  data: Buffer.from("alpha notes").toString("base64"),
  sessionId: session.sessionId,
});

claw.conversations.appendMessage(session.sessionId, {
  role: "user",
  content: "Use the attached brief.",
  documents: [{
    documentId: document.documentId,
    name: document.name,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
  }],
});

const hits = await claw.documents.search({ query: "alpha", sessionId: session.sessionId });

for await (const event of claw.conversations.streamAssistantReplyEvents({
  sessionId: session.sessionId,
  transport: "auto",
})) {
  if (event.type === "chunk") process.stdout.write(event.chunk.delta);
}

for await (const chunk of claw.conversations.streamAssistantReply({
  sessionId: session.sessionId,
})) {
  if (!chunk.done) process.stdout.write(chunk.delta);
}
```

Conversation messages now normalize persisted file references into `message.documents`.
Legacy `attachments` are still accepted as input, but persisted transcripts and relay
responses expose document refs instead of embedding file payloads in the transcript.
## Data Store and Orchestration

```ts
const preferences = claw.data.document("preferences");
preferences.write({ locale: "en" });
const saved = preferences.read();

const tasks = claw.data.collection("tasks");
tasks.put("build", { state: "queued" });
const allTasks = tasks.entries();

const asset = claw.data.asset("artifacts/report.txt");
asset.writeText("ready");

const orchestration = await claw.orchestration.snapshot();
```
The workspace data store is a simple file-backed storage layer for JSON
documents, keyed collections, and raw assets rooted under the current
workspace.

## Watchers

The watcher surface is documented in depth in [Watchers & Events](/watchers). The instance-level methods are:

```ts
const stopFile = claw.watch.file("SOUL.md", (event) => {});
const stopTranscript = claw.watch.transcript("session-id", (event) => {});
const stopRuntime = claw.watch.runtimeStatus((status) => {});
const stopProviders = claw.watch.providerStatus((providers) => {});
const stopEvents = claw.watch.events("workspace.initialized", (event) => {});

for await (const event of claw.watch.eventsIterator("*")) {
  console.log(event.type, event.payload);
  break;
}
```
## Contracts

The main runtime contracts come from `@clawjs/core`. The most important
ones are `RuntimeInfo`, `RuntimeCapabilityMap`, `ProviderDescriptor`,
`ModelDescriptor`, `AuthState`, `SchedulerDescriptor`,
`MemoryDescriptor`, `SkillDescriptor`, `ChannelDescriptor`, `Message`,
`SessionRecord`, `TemplatePack`, and `BindingDefinition`.
