import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { Claw, createClaw } from "./create-claw.ts";

function createFakeSecretsProxy(): { proxyPath: string; statePath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-telegram-proxy-bin-"));
  const proxyPath = path.join(binDir, "secrets-proxy");
  const statePath = path.join(binDir, "telegram-proxy-state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    webhookUrl: "",
    webhookSecretToken: null,
    commands: [],
    updates: [{
      update_id: 11,
      message: {
        message_id: 21,
        text: "hello telegram",
        chat: {
          id: 1001,
          type: "private",
          username: "alice",
          first_name: "Alice",
        },
      },
    }],
  }, null, 2));
  fs.writeFileSync(proxyPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}
const statePath = process.env.FAKE_TELEGRAM_PROXY_STATE;
const url = readFlag("--url") || "";
const body = readFlag("--body") || "{}";
const method = url.split("/").pop();
const payload = JSON.parse(body);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
let result;
switch (method) {
  case "getMe":
    result = {
      id: 42,
      is_bot: true,
      username: "claw_support_bot",
      first_name: "Claw Support",
      can_join_groups: true,
      can_read_all_group_messages: false,
    };
    break;
  case "setWebhook":
    state.webhookUrl = payload.url || "";
    state.webhookSecretToken = payload.secret_token || null;
    result = true;
    break;
  case "getWebhookInfo":
    result = {
      url: state.webhookUrl || "",
      pending_update_count: Array.isArray(state.updates) ? state.updates.length : 0,
      max_connections: 40,
    };
    break;
  case "deleteWebhook":
    state.webhookUrl = "";
    state.webhookSecretToken = null;
    if (payload.drop_pending_updates) {
      state.updates = [];
    }
    result = true;
    break;
  case "setMyCommands":
    state.commands = Array.isArray(payload.commands) ? payload.commands : [];
    result = true;
    break;
  case "getMyCommands":
    result = state.commands || [];
    break;
  case "sendMessage":
    result = {
      message_id: 99,
      chat: { id: payload.chat_id, type: "private" },
      text: payload.text,
    };
    break;
  case "sendPhoto":
    result = {
      message_id: 100,
      chat: { id: payload.chat_id, type: "private" },
      photo: [{ file_id: payload.photo }],
    };
    break;
  case "getUpdates": {
    const offset = typeof payload.offset === "number" ? payload.offset : 0;
    const updates = (state.updates || []).filter((entry) => entry.update_id >= offset);
    const limited = typeof payload.limit === "number" ? updates.slice(0, payload.limit) : updates;
    state.updates = (state.updates || []).filter((entry) => !limited.some((selected) => selected.update_id === entry.update_id));
    result = limited;
    break;
  }
  case "getChat":
    result = {
      id: payload.chat_id,
      type: "private",
      username: "alice",
      first_name: "Alice",
    };
    break;
  case "getChatAdministrators":
    result = [{
      status: "administrator",
      can_be_edited: true,
      can_manage_chat: true,
      user: {
        id: 7,
        is_bot: false,
        username: "admin",
        first_name: "Admin",
      },
    }];
    break;
  case "getChatMember":
    result = {
      status: "member",
      user: {
        id: payload.user_id,
        is_bot: false,
        username: "member",
        first_name: "Member",
      },
    };
    break;
  case "setChatPermissions":
  case "banChatMember":
  case "unbanChatMember":
  case "restrictChatMember":
    result = true;
    break;
  case "createChatInviteLink":
    result = {
      invite_link: "https://t.me/+invite",
      creates_join_request: !!payload.creates_join_request,
    };
    break;
  case "revokeChatInviteLink":
    result = {
      invite_link: payload.invite_link,
      is_revoked: true,
    };
    break;
  default:
    process.stdout.write(JSON.stringify({ ok: false, description: "unsupported method: " + method }));
    process.exit(0);
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

function createFakeOpenClawMemoryToolchain(): { binDir: string; openclawLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-memory-bin-"));
  const openclawLog = path.join(binDir, "openclaw.log");
  const openclawPath = path.join(binDir, "openclaw");

  fs.writeFileSync(openclawPath, `#!/bin/sh
echo "$@" >> "${openclawLog}"
if [ "$1" = "memory" ]; then
  if [ -n "$FAKE_OPENCLAW_MEMORY_SEARCH" ]; then
    printf "%s\n" "$FAKE_OPENCLAW_MEMORY_SEARCH"
  else
    printf "%s\n" '{"results":[]}'
  fi
  exit 0
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  return { binDir, openclawLog };
}

function createFakeOpenClawChannelsToolchain(): { binDir: string; configPath: string } {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-channels-"));
  const binDir = path.join(rootDir, "bin");
  const stateDir = path.join(rootDir, "state");
  const configPath = path.join(stateDir, "openclaw.json");
  const openclawPath = path.join(binDir, "openclaw");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18789,
      auth: { token: "test-token" },
    },
    plugins: {
      entries: {
        whatsapp: { enabled: true },
      },
    },
  }, null, 2));
  fs.writeFileSync(openclawPath, `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "openclaw 1.2.3"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "[]"
  exit 0
fi
if [ "$1" = "plugins" ] && [ "$2" = "list" ]; then
  echo '{"plugins":[],"diagnostics":[]}'
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  printf "%s\\n" "$FAKE_OPENCLAW_CHANNELS_STATUS"
  exit 0
fi
echo "{}"
exit 0
`, { mode: 0o755 });

  return { binDir, configPath };
}

function createFakeOpenClawPluginToolchain(): {
  binDir: string;
  configPath: string;
  statePath: string;
  openclawLog: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-plugin-bin-"));
  const binDir = path.join(root, "bin");
  const statePath = path.join(root, "openclaw-state.json");
  const configPath = path.join(root, "openclaw.json");
  const openclawLog = path.join(root, "openclaw.log");
  const openclawPath = path.join(binDir, "openclaw");

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({
    plugins: {},
    gatewayRestarts: 0,
    gatewayCalls: [],
  }, null, 2));
  fs.writeFileSync(configPath, JSON.stringify({
    gateway: {
      port: 18789,
      auth: {
        token: "plugin-test-token",
      },
    },
    plugins: {
      slots: {
        contextEngine: "legacy",
      },
    },
  }, null, 2));

  fs.writeFileSync(openclawPath, `#!/usr/bin/env node
const fs = require("fs");
const args = process.argv.slice(2);
const statePath = ${JSON.stringify(statePath)};
const configPath = ${JSON.stringify(configPath)};
const logPath = ${JSON.stringify(openclawLog)};

function readState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
}

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function json(payload) {
  process.stdout.write(JSON.stringify(payload) + "\\n");
}

function readFlag(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function pluginIdFromSpec(spec) {
  return spec.includes("context") ? "clawjs-context" : "clawjs";
}

fs.appendFileSync(logPath, args.join(" ") + "\\n");
const state = readState();

if (args[0] === "--version") {
  process.stdout.write("openclaw 2026.3.13\\n");
  process.exit(0);
}

if (args[0] === "models" && args[1] === "status") {
  json({});
  process.exit(0);
}

if (args[0] === "agents" && args[1] === "list") {
  json([]);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "list" && args[2] === "--json") {
  json({
    workspaceDir: "/tmp/demo",
    plugins: Object.values(state.plugins),
    diagnostics: [],
  });
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "doctor") {
  process.stdout.write("Plugin doctor: ok\\n");
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "install") {
  const spec = args[2] || "";
  const id = pluginIdFromSpec(spec);
  state.plugins[id] = {
    id,
    name: id,
    version: "0.1.0",
    source: "npm",
    origin: spec,
    enabled: false,
    status: "installed",
    gatewayMethods: id === "clawjs" ? [
      "clawjs.status",
      "clawjs.events.list",
      "clawjs.sessions.inspect",
      "clawjs.subagent.run",
      "clawjs.subagent.wait",
      "clawjs.subagent.messages",
      "clawjs.hooks.status",
      "clawjs.context.status",
      "clawjs.doctor",
    ] : [],
  };
  writeState(state);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "enable") {
  const id = args[2] || "";
  if (state.plugins[id]) {
    state.plugins[id].enabled = true;
    state.plugins[id].status = "loaded";
  }
  writeState(state);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "disable") {
  const id = args[2] || "";
  if (state.plugins[id]) {
    state.plugins[id].enabled = false;
    state.plugins[id].status = "installed";
  }
  writeState(state);
  process.exit(0);
}

if (args[0] === "plugins" && args[1] === "update") {
  const id = args[2] || "";
  if (state.plugins[id]) {
    state.plugins[id].version = "0.1.0";
  }
  writeState(state);
  process.exit(0);
}

if (args[0] === "hooks" && args[1] === "list" && args[2] === "--json") {
  json({
    workspaceDir: "/tmp/demo",
    managedHooksDir: "/tmp/demo/.openclaw/hooks",
    hooks: [{
      name: "session_start",
      managedByPlugin: true,
      source: "clawjs",
      events: ["session_start"],
    }],
  });
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "restart") {
  state.gatewayRestarts += 1;
  writeState(state);
  process.stdout.write("ok\\n");
  process.exit(0);
}

if (args[0] === "gateway" && (args[1] === "start" || args[1] === "stop" || args[1] === "install")) {
  process.stdout.write("ok\\n");
  process.exit(0);
}

if (args[0] === "gateway" && args[1] === "call") {
  const method = args[args.length - 1];
  const params = JSON.parse(readFlag("--params") || "{}");
  state.gatewayCalls.push({ method, params });
  writeState(state);
  const config = readConfig();

  switch (method) {
    case "channels.status":
      json({ ok: true, provider: "test" });
      break;
    case "clawjs.status":
      json({
        pluginId: "clawjs",
        version: "0.1.0",
        health: {
          eventCount: state.gatewayCalls.length,
        },
        features: {
          observability: true,
        },
      });
      break;
    case "clawjs.events.list":
      json({
        items: [{
          kind: params.kind || "session",
          name: "session_start",
          sessionKey: params.sessionKey || null,
        }],
        limit: params.limit || 50,
      });
      break;
    case "clawjs.sessions.inspect":
      json({
        found: true,
        session: {
          sessionKey: params.sessionKey,
          metrics: {
            eventCount: state.gatewayCalls.length,
          },
        },
      });
      break;
    case "clawjs.subagent.run":
      json({ runId: "run:" + params.sessionKey, accepted: true });
      break;
    case "clawjs.subagent.wait":
      json({ runId: params.runId, status: "completed" });
      break;
    case "clawjs.subagent.messages":
      json({ messages: [{ role: "assistant", content: "bridge:" + params.sessionKey }] });
      break;
    case "clawjs.hooks.status":
      json({ allowPromptInjection: false, hooks: ["session_start"] });
      break;
    case "clawjs.context.status":
      json({
        installed: !!state.plugins["clawjs-context"],
        selected: config.plugins && config.plugins.slots && config.plugins.slots.contextEngine === "clawjs-context",
      });
      break;
    case "clawjs.doctor":
      json({ ok: true, issues: [] });
      break;
    default:
      json({ method, params });
      break;
  }
  process.exit(0);
}

process.stdout.write("{}\\n");
process.exit(0);
`, { mode: 0o755 });

  return { binDir, configPath, statePath, openclawLog };
}

function createFakeSkillSourceToolchain(): { binDir: string; clawhubLog: string; npxLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-skill-sources-bin-"));
  const clawhubLog = path.join(binDir, "clawhub.log");
  const npxLog = path.join(binDir, "npx.log");
  const clawhubPath = path.join(binDir, "clawhub");
  const npxPath = path.join(binDir, "npx");

  fs.writeFileSync(clawhubPath, `#!/bin/sh
echo "$@" >> "${clawhubLog}"
if [ "$1" = "--help" ]; then
  echo "clawhub"
  exit 0
fi
if [ "$1" = "search" ]; then
  if [ -n "$FAKE_CLAWHUB_SEARCH_JSON" ]; then
    printf "%s\\n" "$FAKE_CLAWHUB_SEARCH_JSON"
  else
    printf "%s\\n" "[]"
  fi
  exit 0
fi
if [ "$1" = "install" ]; then
  slug="$2"
  mkdir -p "$PWD/skills/$slug"
  printf "# %s\\n" "$slug" > "$PWD/skills/$slug/SKILL.md"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  fs.writeFileSync(npxPath, `#!/bin/sh
echo "$@" >> "${npxLog}"
if [ "$1" = "--help" ]; then
  echo "npx"
  exit 0
fi
if [ "$1" = "--yes" ] && [ "$2" = "clawhub" ]; then
  shift 2
  echo "$@" >> "${clawhubLog}"
  if [ "$1" = "search" ]; then
    if [ -n "$FAKE_CLAWHUB_SEARCH_JSON" ]; then
      printf "%s\\n" "$FAKE_CLAWHUB_SEARCH_JSON"
    else
      printf "%s\\n" "[]"
    fi
    exit 0
  fi
  if [ "$1" = "install" ]; then
    slug="$2"
    mkdir -p "$PWD/skills/$slug"
    printf "# %s\\n" "$slug" > "$PWD/skills/$slug/SKILL.md"
    exit 0
  fi
  exit 0
fi
if [ "$1" = "--yes" ] && [ "$2" = "skills" ] && [ "$3" = "add" ]; then
  ref="$4"
  if [ "${"${FAKE_SKILLS_ADD_CREATE:-0}"}" = "1" ]; then
    slug=$(basename "$ref")
    slug=${"${slug%.git}"}
    mkdir -p "$PWD/skills/$slug"
    printf "# %s\\n" "$slug" > "$PWD/skills/$slug/SKILL.md"
  fi
  echo "ok"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  return { binDir, clawhubLog, npxLog };
}

function createFakeGenerationCommand(): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-generation-command-bin-"));
  const scriptPath = path.join(binDir, "fake-generate");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
if (outIndex === -1 || !args[outIndex + 1]) {
  console.error("missing --out");
  process.exit(1);
}
const outputPath = args[outIndex + 1];
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, "generated");
`, { mode: 0o755 });
  return scriptPath;
}

function withPatchedEnv<TValue>(patch: NodeJS.ProcessEnv, fn: () => Promise<TValue>): Promise<TValue> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  return fn().finally(() => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

function createFakeOpenClawImageSkillEnv(): { skillsDir: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-image-skill-"));
  const skillsDir = path.join(root, "skills");
  const skillDir = path.join(skillsDir, "openai-image-gen");
  const scriptDir = path.join(skillDir, "scripts");
  const binDir = path.join(root, "bin");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: openai-image-gen\ndescription: test skill\n---\n");
  fs.writeFileSync(path.join(scriptDir, "gen.py"), "print('stub')\n");
  fs.writeFileSync(path.join(binDir, "python3"), `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const outDirIndex = args.indexOf("--out-dir");
const outDir = outDirIndex === -1 ? "" : args[outDirIndex + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "001-generated.png"), "generated-from-openclaw-skill");
`, { mode: 0o755 });
  return { skillsDir, binDir };
}

test("Claw is an alias for the primary async factory", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "claw-instance-alias-"));
  const direct = await Claw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });
  const viaCreate = await Claw.create({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.equal(typeof direct.workspace.init, "function");
  assert.equal(viaCreate.runtime.context()?.agentId, "demo-main");
  assert.equal(Claw.create, createClaw);
});

test("createClaw initializes and inspects a workspace", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const inspected = await claw.workspace.inspect();
  assert.equal(!!inspected.manifest, true);
  assert.equal(fs.existsSync(inspected.manifestPath), true);
  assert.equal(fs.existsSync(inspected.workspaceStatePath), true);
});

test("createClaw exposes runtime context and workspace data helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-context-"));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-state-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        configPath: path.join(stateDir, "openclaw.json"),
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const context = claw.runtime.context();
  claw.data.document("settings").write({ locale: "es" });

  assert.equal(context?.agentId, "demo-main");
  assert.equal(context?.workspaceDir, workspaceDir);
  assert.deepEqual(claw.data.document("settings").read(), { locale: "es" });
});

test("createClaw exposes TTS playback helpers through the SDK facade", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-tts-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.equal(claw.tts.stripMarkdown("## Hello\n\n**world**"), "Hello. world");
  assert.deepEqual(
    claw.tts.segmentText("Sentence one. Sentence two is a bit longer.", { maxSegmentLength: 16 }),
    ["Sentence one.", "Sentence two is", "a bit longer."],
  );
  assert.deepEqual(
    claw.tts.createPlaybackPlan({
      text: "Alpha.\n\nBeta with `code`.",
    }).segments.map((segment) => segment.text),
    ["Alpha.", "Beta with code."],
  );
});

test("createClaw persists normalized speech intent through the TTS facade", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-tts-intent-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-tts",
      agentId: "demo-tts",
      rootDir: workspaceDir,
    },
  });

  const configured = claw.tts.setConfig({
    provider: "openai",
    enabled: true,
    autoRead: true,
    voice: "nova",
    model: "tts-1",
    speed: 1.25,
  });
  const stored = claw.tts.config();
  const diffBeforeApply = await claw.intent.diff({ domains: ["speech"] });
  await claw.intent.apply({ domains: ["speech"] });
  const diffAfterApply = await claw.intent.diff({ domains: ["speech"] });

  assert.equal(configured.provider, "openai");
  assert.equal(stored.voice, "nova");
  assert.equal(stored.autoRead, true);
  assert.equal(diffBeforeApply.drifted, false);
  assert.equal(diffAfterApply.drifted, false);
  assert.deepEqual((claw.intent.get("speech") as { tts?: { provider?: string } }).tts?.provider, "openai");
});

test("createClaw exposes a workspace-backed generations subsystem", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-generations-"));
  const commandPath = createFakeGenerationCommand();
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const backend = claw.generations.registerCommandBackend({
    id: "fake-image",
    label: "Fake Image",
    supportedKinds: ["image"],
    command: commandPath,
    args: ["--out", "{outputPath}"],
    outputExtension: "png",
    mimeType: "image/png",
  });
  const record = await claw.generations.create({
    kind: "image",
    prompt: "orange horizon",
    backendId: backend.id,
  });

  assert.equal(record.output?.exists, true);
  assert.equal(claw.generations.list({ kind: "image" }).length, 1);
  assert.equal(claw.generations.get(record.id)?.backendId, "fake-image");
  assert.equal(claw.image.list().length, 1);
  assert.equal(claw.image.get(record.id)?.backendId, "fake-image");
});

test("createClaw generations can auto-select an OpenClaw bundled image skill", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-image-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: { adapter: "openclaw" },
      workspace: {
        appId: "demo",
        workspaceId: "demo-main",
        agentId: "demo-main",
        rootDir: workspaceDir,
      },
    });

    const record = await claw.generations.create({
      kind: "image",
      prompt: "studio portrait of a lobster",
    });

    assert.equal(record.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(record.output?.exists, true);
    assert.equal((await claw.image.generate({
      prompt: "second lobster portrait",
    })).backendId, "openclaw-skill:openai-image-gen");
  });
});

test("createClaw exposes app discovery, managed block preservation, and secret reference helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-platform-"));
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-platform-state-"));
  const configPath = path.join(stateDir, "openclaw.json");
  const { proxyPath, statePath } = createFakeSecretsProxy();

  fs.writeFileSync(configPath, JSON.stringify({
    agents: {
      list: [{
        id: "demo-main",
        workspace: workspaceDir,
      }],
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { configPath },
      env: {
        ...process.env,
        CLAWJS_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const discovered = claw.runtime.discoverContext({
    agentIds: ["legacy-demo", "demo-main"],
  });
  const ensureResult = await claw.telegram.provisionSecretReference({
    secretName: "telegram_support_bot_token",
  });

  claw.files.writeWorkspaceFile("USER.md", [
    "# Profile",
    "",
    "<!-- CLAWJS:profile:START -->",
    "managed-profile",
    "<!-- CLAWJS:profile:END -->",
    "",
    "Visible text",
    "",
  ].join("\n"));

  claw.files.writeWorkspaceFilePreservingManagedBlocks("USER.md", [
    "# Profile",
    "",
    "<!-- CLAWJS:profile:START -->",
    "user-overwrite-attempt",
    "<!-- CLAWJS:profile:END -->",
    "",
    "Edited text",
    "",
  ].join("\n"));

  const preserved = claw.files.readWorkspaceFile("USER.md");
  const detached = await claw.runtime.detachWorkspace();

  assert.equal(discovered?.matchedAgentId, "demo-main");
  assert.equal(ensureResult.status, "missing");
  assert.match(ensureResult.instructions.summary, /does not exist/i);
  assert.match(preserved ?? "", /managed-profile/);
  assert.doesNotMatch(preserved ?? "", /user-overwrite-attempt/);
  assert.deepEqual(detached?.removedAgentIds, ["demo-main"]);
});

test("createClaw can connect a Telegram bot and reflect it through telegram state and channels", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-telegram-"));
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAWJS_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "telegram-main",
      agentId: "telegram-main",
      rootDir: workspaceDir,
    },
  });

  const connected = await claw.telegram.connectBot({
    secretName: "telegram_support_bot_token",
    webhookUrl: "https://example.com/telegram/webhook",
    webhookSecretToken: "telegram_secret_token",
  });
  const channels = await claw.channels.list();
  const inspected = await claw.workspace.inspect();
  const channelsIntent = claw.intent.get("channels") as {
    channels?: Record<string, {
      secretRef?: string;
      enabled?: boolean;
    }>;
  };

  assert.equal(connected.botProfile?.username, "claw_support_bot");
  assert.equal(connected.transport.mode, "webhook");
  assert.equal(channels.some((channel) => channel.id === "telegram" && channel.status === "connected"), true);
  assert.equal(channelsIntent.channels?.telegram?.enabled, true);
  assert.equal(channelsIntent.channels?.telegram?.secretRef, "telegram_support_bot_token");
  assert.equal(inspected.telegramState?.secretName, "telegram_support_bot_token");
  assert.match(fs.readFileSync(inspected.telegramStatePath, "utf8"), /telegram_support_bot_token/);
  assert.doesNotMatch(fs.readFileSync(inspected.telegramStatePath, "utf8"), /123456:ABC/);
});

test("createClaw telegram API supports commands, chat inspection, sending, and update sync", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-telegram-ops-"));
  const { proxyPath, statePath } = createFakeSecretsProxy();
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: {
        ...process.env,
        CLAWJS_SECRETS_PROXY_PATH: proxyPath,
        FAKE_TELEGRAM_PROXY_STATE: statePath,
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "telegram-ops",
      agentId: "telegram-ops",
      rootDir: workspaceDir,
    },
  });

  await claw.telegram.connectBot({
    secretName: "telegram_support_bot_token",
  });
  const commands = await claw.telegram.setCommands([{
    command: "start",
    description: "Start the bot",
  }]);
  const fetchedCommands = await claw.telegram.getCommands();
  const sentMessage = await claw.telegram.sendMessage({
    chatId: "1001",
    text: "hello",
  });
  const sentMedia = await claw.telegram.sendMedia({
    type: "photo",
    chatId: "1001",
    media: "file_123",
  });
  const chat = await claw.telegram.getChat("1001");
  const admins = await claw.telegram.getChatAdministrators("1001");
  const member = await claw.telegram.getChatMember("1001", "7");
  const invite = await claw.telegram.createInviteLink("1001");
  const updates = await claw.telegram.startPolling({ limit: 10 }).then(() => claw.telegram.syncUpdates());
  const sessions = claw.conversations.listSessions();

  assert.deepEqual(commands, fetchedCommands);
  assert.equal((sentMessage.chat as { id: string }).id, "1001");
  assert.equal(Array.isArray((sentMedia.photo as unknown[])), true);
  assert.equal(chat.username, "alice");
  assert.equal(admins[0]?.status, "administrator");
  assert.equal(member.userId, "7");
  assert.equal((invite.invite_link as string).includes("https://t.me/+invite"), true);
  assert.equal(updates.length, 0);
  assert.equal(sessions.length >= 1, true);
  assert.equal(await claw.telegram.listChats("alice").then((entries) => entries.length > 0), true);
});

test("createClaw can diff and sync binding output", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-binding-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const binding = {
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block" as const,
    blockId: "tone",
    settingsPath: "tone",
  };

  const diff = claw.files.diffBinding(binding, { tone: "direct" }, (settings) => `tone=${settings.tone}`);
  assert.equal(diff.changed, true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "SOUL.md")), false);

  const synced = claw.files.syncBinding(binding, { tone: "direct" }, (settings) => `tone=${settings.tone}`);
  assert.equal(synced.changed, true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "SOUL.md")), true);
});

test("createClaw exposes a workspace-backed conversation store", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-conversations-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "first",
  });

  assert.equal(claw.conversations.listSessions().length, 1);
  assert.equal(claw.conversations.getSession(session.sessionId)?.messageCount, 1);
});

test("createClaw can search sessions locally", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-search-local-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-search-local",
      agentId: "demo-search-local",
      rootDir: workspaceDir,
    },
  });

  const session = claw.conversations.createSession("Budget review");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
  });

  const results = await claw.conversations.searchSessions({
    query: "quarterly budget",
    strategy: "local",
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.sessionId, session.sessionId);
  assert.equal(results[0]?.strategy, "local");
  assert.equal(results[0]?.matchedFields.includes("message"), true);
});

test("createClaw can search sessions through OpenClaw memory search", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-search-memory-"));
  const { binDir, openclawLog } = createFakeOpenClawMemoryToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-search-memory",
      agentId: "demo-search-memory",
      rootDir: workspaceDir,
    },
  });

  const session = claw.conversations.createSession("Budget review");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
  });

  try {
    runtimeEnv.FAKE_OPENCLAW_MEMORY_SEARCH = JSON.stringify({
      results: [{
        text: "Need to review the quarterly budget with finance",
        path: `/tmp/agents/demo-search-memory/sessions/${session.sessionId}.jsonl`,
        startLine: 12,
        endLine: 16,
        score: 0.91,
      }],
    });
    const results = await claw.conversations.searchSessions({
      query: "budget finance",
      strategy: "openclaw-memory",
      fallbackToLocal: false,
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.sessionId, session.sessionId);
    assert.equal(results[0]?.strategy, "openclaw-memory");
    assert.equal(results[0]?.sourcePath?.includes(`/sessions/${session.sessionId}.jsonl`), true);
    assert.match(fs.readFileSync(openclawLog, "utf8"), /memory --agent demo-search-memory search --query budget finance --json/);
  } finally {
    delete runtimeEnv.FAKE_OPENCLAW_MEMORY_SEARCH;
  }
});

test("createClaw auto search falls back to local sessions when OpenClaw memory search is empty", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-search-auto-"));
  const { binDir } = createFakeOpenClawMemoryToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({ results: [] }),
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-search-auto",
      agentId: "demo-search-auto",
      rootDir: workspaceDir,
    },
  });

  const session = claw.conversations.createSession("Hiring");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "Prepare the interview loop for backend candidates",
  });

  try {
    const results = await claw.conversations.searchSessions({
      query: "interview loop",
      strategy: "auto",
    });

    assert.equal(results.length, 1);
    assert.equal(results[0]?.sessionId, session.sessionId);
    assert.equal(results[0]?.strategy, "local");
  } finally {
    delete runtimeEnv.FAKE_OPENCLAW_MEMORY_SEARCH;
  }
});

test("createClaw exposes OpenClaw channels through the public channels API", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-openclaw-channels-"));
  const { binDir, configPath } = createFakeOpenClawChannelsToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
    FAKE_OPENCLAW_CHANNELS_STATUS: JSON.stringify({
      channels: {
        whatsapp: {
          configured: true,
          connected: true,
          running: true,
        },
      },
      channelAccounts: {
        whatsapp: [{
          linked: true,
          connected: true,
        }],
      },
    }),
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      configPath,
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-openclaw-channels",
      agentId: "demo-openclaw-channels",
      rootDir: workspaceDir,
    },
  });

  const status = await claw.runtime.status();
  const channels = await claw.channels.list();
  const inspected = await claw.workspace.inspect();

  assert.equal(status.capabilityMap.channels.supported, true);
  assert.equal(status.capabilityMap.channels.status, "ready");
  assert.deepEqual(channels.find((channel) => channel.id === "whatsapp"), {
    id: "whatsapp",
    label: "WhatsApp",
    kind: "chat",
    status: "connected",
    provider: "whatsapp",
    lastError: null,
    metadata: {
      pluginEnabled: true,
      linked: true,
      connected: true,
      configured: true,
      running: true,
      accountCount: 1,
    },
  });
  assert.equal(inspected.channelsState?.channels.some((channel) => channel.id === "whatsapp" && channel.status === "connected"), true);
});

test("createClaw exposes external skill sources and search results", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-sources-"));
  const { binDir } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_CLAWHUB_SEARCH_JSON: JSON.stringify([
      {
        slug: "support-triage",
        label: "Support Triage",
        summary: "Prioritize incoming support work.",
      },
    ]),
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-sources",
      agentId: "demo-skill-sources",
      rootDir: workspaceDir,
    },
  });

  const sources = await claw.skills.sources();
  const result = await claw.skills.search("support", { limit: 3 });

  assert.equal(sources.some((entry) => entry.id === "workspace" && entry.status === "ready"), true);
  assert.equal(sources.some((entry) => entry.id === "clawhub" && entry.status === "ready"), true);
  assert.equal(sources.some((entry) => entry.id === "skills.sh" && entry.status === "ready"), true);
  assert.ok(result.entries.length >= 1, "should have at least one search result");
  assert.equal(result.entries.some((entry) => entry.source === "clawhub"), true);
  assert.equal(result.entries.some((entry) => entry.source === "workspace"), true);
  assert.equal(result.omittedSources?.some((entry) => entry.source === "skills.sh"), true);
});

test("createClaw can resolve exact skills.sh refs when the source is explicit", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-search-exact-"));
  const { binDir } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-search-exact",
      agentId: "demo-skill-search-exact",
      rootDir: workspaceDir,
    },
  });

  const result = await claw.skills.search("vercel-labs/agent-skills", { source: "skills.sh" });

  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0]?.source, "skills.sh");
  assert.equal(result.entries[0]?.installRef, "vercel-labs/agent-skills");
});

test("createClaw installs clawhub skills and refreshes runtime inventory", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-install-runtime-"));
  const { binDir, clawhubLog } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-install-runtime",
      agentId: "demo-skill-install-runtime",
      rootDir: workspaceDir,
    },
  });

  const result = await claw.skills.install("support-triage", { source: "clawhub" });
  const skills = await claw.skills.list();

  assert.equal(result.runtimeVisibility, "runtime");
  assert.equal(result.syncedSkills?.some((entry) => entry.id === "support-triage"), true);
  assert.equal(skills.some((entry) => entry.id === "support-triage"), true);
  assert.equal(fs.existsSync(path.join(workspaceDir, "skills", "support-triage", "SKILL.md")), true);
  assert.match(fs.readFileSync(clawhubLog, "utf8"), /install support-triage/);
});

test("createClaw installs skills.sh skills as external when runtime inventory does not change", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-skill-install-external-"));
  const { binDir, npxLog } = createFakeSkillSourceToolchain();
  const runtimeEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  };
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      env: runtimeEnv,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-skill-install-external",
      agentId: "demo-skill-install-external",
      rootDir: workspaceDir,
    },
  });

  const result = await claw.skills.install("vercel-labs/agent-skills", { source: "skills.sh" });

  assert.equal(result.runtimeVisibility, "external");
  assert.equal(result.syncedSkills, undefined);
  assert.match(fs.readFileSync(npxLog, "utf8"), /--yes skills add vercel-labs\/agent-skills/);
});

test("createClaw instances keep separate workspaces and conversations isolated", async () => {
  const workspaceA = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-a-"));
  const workspaceB = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-b-"));

  const clawA = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-a",
      agentId: "demo-a",
      rootDir: workspaceA,
    },
  });
  const clawB = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-b",
      agentId: "demo-b",
      rootDir: workspaceB,
    },
  });

  await Promise.all([clawA.workspace.init(), clawB.workspace.init()]);

  const sessionA = clawA.conversations.createSession("Alpha");
  clawA.conversations.appendMessage(sessionA.sessionId, { role: "user", content: "only-a" });
  const sessionB = clawB.conversations.createSession("Beta");
  clawB.conversations.appendMessage(sessionB.sessionId, { role: "user", content: "only-b" });

  clawA.files.writeWorkspaceFile("notes.md", "workspace-a\n");
  clawB.files.writeWorkspaceFile("notes.md", "workspace-b\n");

  assert.equal(clawA.conversations.listSessions().length, 1);
  assert.equal(clawB.conversations.listSessions().length, 1);
  assert.equal(clawA.conversations.getSession(sessionB.sessionId), null);
  assert.equal(clawB.conversations.getSession(sessionA.sessionId), null);
  assert.equal(clawA.files.readWorkspaceFile("notes.md"), "workspace-a\n");
  assert.equal(clawB.files.readWorkspaceFile("notes.md"), "workspace-b\n");
  assert.equal(fs.existsSync(path.join(workspaceA, ".clawjs", "conversations", `${sessionB.sessionId}.jsonl`)), false);
  assert.equal(fs.existsSync(path.join(workspaceB, ".clawjs", "conversations", `${sessionA.sessionId}.jsonl`)), false);
});

test("createClaw instances can share a workspace and initialize it in parallel", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-shared-"));

  const clawA = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-shared",
      agentId: "demo-shared",
      rootDir: workspaceDir,
    },
  });
  const clawB = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-shared",
      agentId: "demo-shared",
      rootDir: workspaceDir,
    },
  });

  await Promise.all([clawA.workspace.init(), clawB.workspace.init()]);

  const [sessionA, sessionB] = await Promise.all([
    Promise.resolve().then(() => clawA.conversations.createSession("Alpha")),
    Promise.resolve().then(() => clawB.conversations.createSession("Beta")),
  ]);

  await Promise.all([
    Promise.resolve().then(() => clawA.conversations.appendMessage(sessionA.sessionId, { role: "user", content: "only-a" })),
    Promise.resolve().then(() => clawB.conversations.appendMessage(sessionB.sessionId, { role: "user", content: "only-b" })),
    Promise.resolve().then(() => clawA.files.writeWorkspaceFile("notes-a.md", "workspace-a\n")),
    Promise.resolve().then(() => clawB.files.writeWorkspaceFile("notes-b.md", "workspace-b\n")),
  ]);

  assert.equal(clawA.conversations.listSessions().length, 2);
  assert.equal(clawB.conversations.listSessions().length, 2);
  assert.equal(clawA.conversations.getSession(sessionB.sessionId)?.messageCount, 1);
  assert.equal(clawB.conversations.getSession(sessionA.sessionId)?.messageCount, 1);
  assert.equal(clawA.files.readWorkspaceFile("notes-a.md"), "workspace-a\n");
  assert.equal(clawA.files.readWorkspaceFile("notes-b.md"), "workspace-b\n");
  assert.equal(clawB.files.readWorkspaceFile("notes-a.md"), "workspace-a\n");
  assert.equal(clawB.files.readWorkspaceFile("notes-b.md"), "workspace-b\n");
  assert.equal(fs.existsSync(path.join(workspaceDir, ".clawjs", "conversations", `${sessionA.sessionId}.jsonl`)), true);
  assert.equal(fs.existsSync(path.join(workspaceDir, ".clawjs", "conversations", `${sessionB.sessionId}.jsonl`)), true);
});

test("createClaw exposes workspace validation and binding persistence", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-workspace-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const validation = await claw.workspace.validate();
  assert.equal(validation.ok, true);

  claw.files.writeBindingStore([{
    id: "tone",
    targetFile: "SOUL.md",
    mode: "managed_block",
    blockId: "tone",
    settingsPath: "tone",
  }]);
  claw.files.writeSettingsSchema({
    tone: { type: "string" },
  });

  assert.equal(claw.files.readBindingStore().bindings.length, 1);
  assert.equal((claw.files.readSettingsSchema().settingsSchema.tone as { type: string }).type, "string");
});

test("createClaw exposes intent, observed, and feature APIs for declarative model sync", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-intent-api-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-intent",
      agentId: "demo-intent",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const features = claw.features.describe();
  const initialIntent = claw.intent.get("models") as { defaultModel?: string | null };

  assert.equal(features.some((feature) => feature.featureId === "models" && feature.ownership === "sdk-owned"), true);
  assert.equal(initialIntent.defaultModel ?? null, null);

  const modelId = await claw.models.setDefault("openai/gpt-5.4");
  const modelsIntent = claw.intent.get("models") as { defaultModel?: string | null };
  const observedModels = claw.observed.read("models") as {
    defaultModel?: {
      modelId?: string | null;
    } | null;
  } | null;
  const diff = await claw.intent.diff({ domains: ["models"] });
  const inspected = await claw.workspace.inspect();

  assert.equal(modelId, "openai/gpt-5.4");
  assert.equal(modelsIntent.defaultModel, "openai/gpt-5.4");
  assert.equal(observedModels?.defaultModel?.modelId, "openai/gpt-5.4");
  assert.equal(diff.drifted, false);
  assert.equal(fs.existsSync(inspected.intentPaths.models), true);
  assert.equal(fs.existsSync(inspected.observedPaths.models), true);
});

test("createClaw can repair workspace layout and migrate legacy compat", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-repair-"));
  fs.mkdirSync(path.join(workspaceDir, ".clawjs"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, ".clawjs", "compat.json"), JSON.stringify({
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: false,
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const repaired = await claw.workspace.repair();
  assert.equal(repaired.compatSnapshotMigrated, true);
  assert.equal((await claw.workspace.validate()).ok, true);
});

test("createClaw exposes workspace reset preview and result", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-reset-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  claw.files.writeWorkspaceFile("notes.md", "keep\n");
  const preview = await claw.workspace.previewReset({ removeRuntimeFiles: true });
  assert.equal(preview.targets.some((target) => target.path.endsWith("SOUL.md") && target.exists), true);

  const result = await claw.workspace.reset({ removeRuntimeFiles: true });
  assert.equal(result.removedPaths.some((entry) => entry.endsWith("SOUL.md")), true);
  assert.equal(claw.files.readWorkspaceFile("notes.md"), "keep\n");
});

test("createClaw emits domain events and supports auth key storage", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-events-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-agent-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw", agentDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const seen: string[] = [];
  const stop = claw.watch.events("*", (event) => {
    seen.push(event.type);
  });

  await claw.workspace.init();
  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "first",
  });
  const authSummary = claw.auth.setApiKey("anthropic", "sk-ant-secret-12345678");
  const diagnostics = claw.auth.diagnostics("anthropic");
  stop();

  assert.equal(authSummary.profileId, "anthropic:manual");
  assert.ok(diagnostics.profiles);
  assert.equal(diagnostics.profiles[0]?.maskedCredential, "******************5678");
  assert.deepEqual(seen, [
    "workspace.initialized",
    "conversations.session_created",
    "conversations.message_appended",
    "auth.progress",
    "auth.api_key_saved",
    "auth.progress",
  ]);

  const auditLog = fs.readFileSync(path.join(workspaceDir, ".clawjs", "audit", "audit.jsonl"), "utf8");
  assert.equal(auditLog.includes("sk-ant-secret-12345678"), false);
});

test("createClaw provider intents reconcile auth state and disabled providers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-provider-intent-"));
  const claw = await createClaw({
    runtime: { adapter: "demo" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-provider-intent",
      agentId: "demo-provider-intent",
      rootDir: workspaceDir,
    },
  });

  claw.auth.setApiKey("openai", "sk-demo-12345678");
  await claw.auth.status();
  const providersIntentAfterSave = claw.intent.get("providers") as {
    providers?: Record<string, {
      enabled?: boolean;
      preferredAuthMode?: string | null;
      profileId?: string | null;
    }>;
  };
  const diffAfterSave = await claw.intent.diff({ domains: ["providers"] });

  assert.equal(providersIntentAfterSave.providers?.openai?.enabled, true);
  assert.equal(providersIntentAfterSave.providers?.openai?.preferredAuthMode, "api_key");
  assert.equal(diffAfterSave.drifted, false);

  claw.intent.patch("providers", {
    providers: {
      ...(providersIntentAfterSave.providers ?? {}),
      openai: {
        ...(providersIntentAfterSave.providers?.openai ?? {}),
        enabled: false,
      },
    },
  });
  await claw.intent.apply({ domains: ["providers"] });

  const authState = await claw.auth.status();
  const diffAfterDisable = await claw.intent.diff({ domains: ["providers"] });

  assert.equal(authState.openai?.hasAuth, false);
  assert.equal(diffAfterDisable.drifted, false);
});

test("createClaw doctor report includes workspace diagnostics", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const report = await claw.doctor.run();
  assert.ok("workspace" in report);
  assert.equal(Array.isArray(report.suggestedRepairs), true);
  assert.equal(report.workspace.ok, false);
});

test("createClaw doctor report surfaces compat snapshot drift", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-drift-"));
  fs.mkdirSync(path.join(workspaceDir, ".clawjs", "compat"), { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, ".clawjs", "compat", "runtime-snapshot.json"), JSON.stringify({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "0.9.0",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: true,
    },
    diagnostics: {
      versionFamily: "0.9",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }, null, 2));

  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const report = await claw.doctor.run();
  assert.equal(report.compatSnapshot?.runtimeVersion, "0.9.0");
  assert.equal(report.compatDrift.drifted, true);
  assert.match(report.suggestedRepairs.join(" "), /Refresh the compat snapshot/);
});

test("createClaw doctor report surfaces malformed managed blocks", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-doctor-blocks-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  claw.files.writeWorkspaceFile("SOUL.md", [
    "<!-- CLAWJS:tone:START -->",
    "kind",
    "<!-- CLAWJS:tone:START -->",
  ].join("\n"));

  const report = await claw.doctor.run();
  assert.equal(report.managedBlockProblems?.length ? report.managedBlockProblems.length > 0 : false, true);
  assert.match(report.issues.map((issue) => issue.message).join(" "), /Managed block tone/);
});

test("createClaw exposes runtime command builders", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-runtime-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  assert.deepEqual(claw.runtime.installCommand("pnpm"), {
    command: "pnpm",
    args: ["add", "-g", "openclaw"],
  });
  assert.deepEqual(claw.runtime.uninstallCommand("pnpm"), {
    command: "pnpm",
    args: ["remove", "-g", "openclaw"],
  });
  assert.deepEqual(claw.runtime.setupWorkspaceCommand(), {
    command: "openclaw",
    args: ["agents", "add", "demo-main", "--non-interactive", "--workspace", workspaceDir, "--json"],
  });
  assert.deepEqual(claw.runtime.repairCommand(), {
    command: "openclaw",
    args: ["gateway", "install"],
  });
  assert.deepEqual(
    claw.runtime.installPlan("pnpm").steps.map((step) => step.phase),
    ["runtime.install.prepare", "runtime.install.execute", "runtime.install.finalize"],
  );
  assert.deepEqual(
    claw.runtime.uninstallPlan("pnpm").steps.map((step) => step.phase),
    ["runtime.uninstall.prepare", "runtime.uninstall.execute", "runtime.uninstall.finalize"],
  );
});

test("createClaw exposes richer workspace file helpers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-files-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  const preview = claw.files.previewWorkspaceFile("SOUL.md", "hello\n");
  assert.equal(preview.exists, true);
  assert.equal(preview.changed, true);

  claw.files.writeWorkspaceFile("SOUL.md", "before\n\n<!-- CLAWJS:tone:START -->\nkind\n<!-- CLAWJS:tone:END -->\n");
  assert.equal(claw.files.readWorkspaceFile("SOUL.md"), "before\n\n<!-- CLAWJS:tone:START -->\nkind\n<!-- CLAWJS:tone:END -->\n");
  assert.equal(claw.files.inspectWorkspaceFile("SOUL.md").managedBlocks.length, 1);
  assert.equal(claw.files.inspectManagedBlock("SOUL.md", "tone").innerContent, "kind");
});

test("createClaw compat refresh persists capability and provider state artifacts", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-compat-state-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-compat-agent-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw", agentDir },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  await claw.workspace.init();
  await claw.compat.refresh();
  await claw.auth.status();
  const inspected = await claw.workspace.inspect();

  assert.equal(fs.existsSync(inspected.capabilityReportPath), true);
  assert.equal(fs.existsSync(inspected.workspaceStatePath), true);
  assert.equal(fs.existsSync(inspected.providerStatePath), true);
  assert.equal(inspected.capabilityReport?.schemaVersion, 1);
  assert.equal(inspected.workspaceState?.workspaceId, "demo-main");
  assert.ok(inspected.providerState?.providers);
});

test("createClaw can stream and persist an assistant reply through gateway config", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-stream-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" world"}}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const session = claw.conversations.createSession("Hello");
    claw.conversations.appendMessage(session.sessionId, {
      role: "user",
      content: "say hi",
    });

    const seen: string[] = [];
    for await (const chunk of claw.conversations.streamAssistantReply({
      sessionId: session.sessionId,
      systemPrompt: "Be concise.",
      contextBlocks: [{ title: "Mode", content: "Friendly." }],
      transport: "gateway",
    })) {
      if (!chunk.done) seen.push(chunk.delta);
    }

    assert.deepEqual(seen, ["hello", " world"]);
    assert.equal(
      claw.conversations.getSession(session.sessionId)?.messages.at(-1)?.content,
      "hello world",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw can generate and persist a session title", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-title-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: {
        url: "http://127.0.0.1:18789",
      },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: "Work anxiety" } }],
  }), { status: 200 })) as typeof fetch;

  try {
    const session = claw.conversations.createSession("Hello");
    claw.conversations.appendMessage(session.sessionId, {
      role: "user",
      content: "I want to talk about anxiety at work",
    });

    const title = await claw.conversations.generateTitle({
      sessionId: session.sessionId,
      transport: "gateway",
    });

    assert.equal(title, "Work anxiety");
    assert.equal(claw.conversations.getSession(session.sessionId)?.title, "Work anxiety");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw surfaces runtime progress and conversation events", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-progress-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceDir,
    },
  });

  const runtimeEvents: string[] = [];
  await claw.runtime.repair((event) => {
    runtimeEvents.push(`${event.phase}:${event.status}`);
  }).catch(() => {});
  assert.ok(runtimeEvents.length >= 2);

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Plan"}}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" a launch checklist"}}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  }), { status: 200 })) as typeof fetch;

  try {
    const streamingClaw = await createClaw({
      runtime: {
        adapter: "openclaw",
        gateway: { url: "http://127.0.0.1:18789" },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-events",
        agentId: "demo-events",
        rootDir: fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-events-stream-")),
      },
    });
    const session = streamingClaw.conversations.createSession("Hello");
    streamingClaw.conversations.appendMessage(session.sessionId, {
      role: "user",
      content: "Plan a launch checklist",
    });

    const events: string[] = [];
    for await (const event of streamingClaw.conversations.streamAssistantReplyEvents({
      sessionId: session.sessionId,
      transport: "gateway",
    })) {
      events.push(event.type === "transport" ? `${event.type}:${event.transport}` : event.type);
    }

    assert.deepEqual(events, ["transport:gateway", "chunk", "chunk", "done", "title"]);
    assert.equal(streamingClaw.conversations.getSession(session.sessionId)?.title, "Plan a launch checklist");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("createClaw does not persist partial assistant text when stream aborts", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-abort-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      gateway: { url: "http://127.0.0.1:18789" },
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-abort",
      agentId: "demo-abort",
      rootDir: workspaceDir,
    },
  });

  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "Plan a launch checklist",
  });

  const abortController = new AbortController();
  abortController.abort("user_cancelled");

  const events: string[] = [];
  for await (const event of claw.conversations.streamAssistantReplyEvents({
    sessionId: session.sessionId,
    transport: "gateway",
    signal: abortController.signal,
  })) {
    events.push(event.type);
  }

  assert.deepEqual(events, ["aborted"]);
  assert.equal(claw.conversations.getSession(session.sessionId)?.messageCount, 1);
});

test("createClaw exposes runtime/provider watchers and async event iteration", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-watchers-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-watchers-agent-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-watchers",
      agentId: "demo-watchers",
      rootDir: workspaceDir,
    },
  });

  const runtimeSnapshots: boolean[] = [];
  const stopRuntime = claw.watch.runtimeStatus((status) => {
    runtimeSnapshots.push(status.cliAvailable);
  }, { intervalMs: 20 });

  const providerSnapshots: boolean[] = [];
  const stopProviders = claw.watch.providerStatus((providers) => {
    providerSnapshots.push(Object.values(providers).some((provider) => provider.hasAuth));
  }, { intervalMs: 20 });

  const iterator = claw.watch.eventsIterator("auth.api_key_saved")[Symbol.asyncIterator]();
  claw.auth.setApiKey("anthropic", "sk-12345678");
  const nextEvent = await iterator.next();
  await iterator.return?.();

  await new Promise((resolve) => setTimeout(resolve, 80));
  stopRuntime();
  stopProviders();

  assert.equal(nextEvent.done, false);
  assert.equal(nextEvent.value?.type, "auth.api_key_saved");
  assert.equal(runtimeSnapshots.every((value) => typeof value === "boolean"), true);
  assert.equal(providerSnapshots.every((value) => typeof value === "boolean"), true);
});

test("createClaw saveApiKey supports runtime command mode and auth progress events", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-auth-runtime-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-auth-runtime-agent-"));
  const claw = await createClaw({
    runtime: {
      adapter: "openclaw",
      agentDir,
    },
    workspace: {
      appId: "demo",
      workspaceId: "demo-auth-runtime",
      agentId: "demo-auth-runtime",
      rootDir: workspaceDir,
    },
  });

  const progress: string[] = [];
  const stop = claw.watch.events("auth.progress", (event) => {
    const payload = event.payload as { phase: string; status: string };
    progress.push(`${payload.phase}:${payload.status}`);
  });

  const persisted = await claw.auth.saveApiKey("openai", "sk-live-12345678", {
    runtimeCommand: {
      command: "/bin/sh",
      args: ["-lc", "exit 0"],
    },
  });
  stop();

  assert.equal(persisted.mode, "runtime");
  assert.equal(persisted.summary.maskedCredential, "************5678");
  assert.deepEqual(progress, [
    "auth.api_key.save:start",
    "auth.api_key.save:complete",
  ]);
  const authFile = fs.readFileSync(path.join(agentDir, "auth-profiles.json"), "utf8");
  assert.equal(authFile.includes("sk-live-12345678"), false);
});

test("createClaw initializes runtime-specific workspace layouts for zeroclaw and picoclaw", async () => {
  const scenarios = [
    {
      adapter: "zeroclaw" as const,
      expectedFile: "MEMORY.md",
      unexpectedFile: "TOOLS.md",
    },
    {
      adapter: "picoclaw" as const,
      expectedFile: path.join("memory", "MEMORY.md"),
      unexpectedFile: "TOOLS.md",
    },
  ];

  for (const scenario of scenarios) {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), `clawjs-instance-${scenario.adapter}-`));
    const claw = await createClaw({
      runtime: { adapter: scenario.adapter },
      workspace: {
        appId: "demo",
        workspaceId: `${scenario.adapter}-main`,
        agentId: `${scenario.adapter}-main`,
        rootDir: workspaceDir,
      },
    });

    await claw.workspace.init();
    const validation = await claw.workspace.validate();
    const canonicalPaths = claw.workspace.canonicalPaths();

    assert.equal(validation.ok, true);
    assert.equal(fs.existsSync(path.join(workspaceDir, scenario.expectedFile)), true);
    assert.equal(fs.existsSync(path.join(workspaceDir, scenario.unexpectedFile)), false);
    assert.equal(Object.values(canonicalPaths).some((entry) => entry.endsWith(scenario.expectedFile)), true);
  }
});

test("createClaw reports detect-only OpenClaw plugin bridge state without mutating runtime", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-plugin-detect-"));
  const { binDir, configPath, statePath, openclawLog } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
        pluginBridge: {
          mode: "detect-only",
        },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-plugin-detect",
        agentId: "demo-plugin-detect",
        rootDir: workspaceDir,
      },
    });

    const bridge = await claw.runtime.plugins.status() as unknown as {
      supported: boolean;
      mode: string;
      basePlugin: { installed: boolean };
    };
    const list = await claw.runtime.plugins.list();
    const runtimeStatus = await claw.runtime.status();
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      plugins: Record<string, unknown>;
    };
    const log = fs.readFileSync(openclawLog, "utf8");

    assert.equal(bridge.supported, true);
    assert.equal(bridge.mode, "detect-only");
    assert.equal(bridge.basePlugin.installed, false);
    assert.equal(list.plugins.length, 0);
    assert.equal(runtimeStatus.capabilityMap.plugins.status, "degraded");
    assert.equal((runtimeStatus.capabilityMap.plugins.diagnostics as { mode?: string }).mode, "detect-only");
    assert.deepEqual(Object.keys(state.plugins), []);
    assert.equal(log.includes("plugins install @clawjs/openclaw-plugin"), false);
  });
});

test("createClaw managed OpenClaw plugin bridge auto-installs and exposes ClawJS RPC wrappers", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-instance-plugin-managed-"));
  const { binDir, configPath, statePath, openclawLog } = createFakeOpenClawPluginToolchain();

  await withPatchedEnv({
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const claw = await createClaw({
      runtime: {
        adapter: "openclaw",
        configPath,
        pluginBridge: {
          mode: "managed",
          enableContextEngine: true,
        },
      },
      workspace: {
        appId: "demo",
        workspaceId: "demo-plugin-managed",
        agentId: "demo-plugin-managed",
        rootDir: workspaceDir,
      },
    });

    const bridgeStatus = await claw.runtime.plugins.status() as unknown as {
      basePlugin: { installed: boolean; enabled: boolean; loaded: boolean };
      contextPlugin: { installed: boolean; enabled: boolean; selected: boolean; selectedEngineId: string | null };
    };
    const status = await claw.runtime.plugins.clawjs.status() as {
      pluginId: string;
      features: { observability: boolean };
    };
    const events = await claw.runtime.plugins.clawjs.events.list({ kind: "tool", limit: 3 }) as {
      items: Array<{ kind: string }>;
    };
    const inspect = await claw.runtime.plugins.clawjs.sessions.inspect({ sessionKey: "alpha" }) as {
      found: boolean;
      session: { sessionKey: string };
    };
    const run = await claw.runtime.plugins.clawjs.subagent.run({ sessionKey: "alpha", message: "hello" }) as {
      runId: string;
    };
    const wait = await claw.runtime.plugins.clawjs.subagent.wait({ runId: run.runId, timeoutMs: 500 }) as {
      status: string;
    };
    const messages = await claw.runtime.plugins.clawjs.subagent.messages({ sessionKey: "alpha", limit: 5 }) as {
      messages: Array<{ role: string; content: string }>;
    };
    const hooks = await claw.runtime.plugins.clawjs.hooks.list() as {
      hooks: Array<{ name: string }>;
    };
    const hookStatus = await claw.runtime.plugins.clawjs.hooks.status() as {
      allowPromptInjection: boolean;
    };
    const context = await claw.runtime.plugins.clawjs.context.status() as {
      installed: boolean;
      selected: boolean;
    };
    const doctor = await claw.runtime.plugins.clawjs.doctor() as {
      ok: boolean;
    };
    const runtimeStatus = await claw.runtime.status();
    const runtimeDoctor = await claw.runtime.plugins.doctor();
    const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      plugins?: { slots?: { contextEngine?: string } };
    };
    const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
      plugins: Record<string, { enabled?: boolean; status?: string }>;
      gatewayRestarts: number;
    };
    const log = fs.readFileSync(openclawLog, "utf8");

    assert.equal(bridgeStatus.basePlugin.installed, false);
    assert.equal(status.pluginId, "clawjs");
    assert.equal(status.features.observability, true);
    assert.equal(events.items[0]?.kind, "tool");
    assert.equal(inspect.found, true);
    assert.equal(inspect.session.sessionKey, "alpha");
    assert.equal(run.runId, "run:alpha");
    assert.equal(wait.status, "completed");
    assert.deepEqual(messages.messages, [{ role: "assistant", content: "bridge:alpha" }]);
    assert.equal(hooks.hooks[0]?.name, "session_start");
    assert.equal(hookStatus.allowPromptInjection, false);
    assert.equal(context.installed, true);
    assert.equal(context.selected, true);
    assert.equal(doctor.ok, true);
    assert.equal(runtimeDoctor.ok, true);
    assert.equal(runtimeStatus.capabilityMap.plugins.status, "ready");
    assert.equal(config.plugins?.slots?.contextEngine, "clawjs-context");
    assert.equal(state.plugins.clawjs?.enabled, true);
    assert.equal(state.plugins["clawjs-context"]?.enabled, true);
    assert.equal(state.gatewayRestarts >= 1, true);
    assert.match(log, /plugins install @clawjs\/openclaw-plugin/);
    assert.match(log, /plugins enable clawjs/);
    assert.match(log, /plugins install @clawjs\/openclaw-context-engine/);
    assert.match(log, /plugins enable clawjs-context/);
    assert.match(log, /gateway restart/);
    assert.match(log, /gateway call --json --timeout 10000 --params \{\} --token plugin-test-token --url ws:\/\/127\.0\.0\.1:18789 clawjs\.status/);

    const ensuredBridge = await claw.runtime.plugins.status() as unknown as {
      basePlugin: { enabled: boolean; loaded: boolean };
      contextPlugin: { selected: boolean; selectedEngineId: string | null };
    };
    assert.equal(ensuredBridge.basePlugin.enabled, true);
    assert.equal(ensuredBridge.basePlugin.loaded, true);
    assert.equal(ensuredBridge.contextPlugin.selected, true);
    assert.equal(ensuredBridge.contextPlugin.selectedEngineId, "clawjs-context");
  });
});
