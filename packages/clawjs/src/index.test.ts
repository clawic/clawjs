import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";

import { createClaw, saveAuthStore } from "@clawjs/claw";
import { CLI_EXIT_DEGRADED, CLI_EXIT_FAILURE, CLI_EXIT_OK, CLI_EXIT_USAGE, CLI_USAGE, runCli } from "./index.ts";

function captureStream() {
  let output = "";
  return {
    stream: {
      write(chunk: string) {
        output += chunk;
        return true;
      },
    } as unknown as NodeJS.WritableStream,
    getOutput() {
      return output;
    },
  };
}

function createFakeOpenClawToolchain(): { binDir: string; openclawLog: string; npmLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-bin-"));
  const openclawLog = path.join(binDir, "openclaw.log");
  const npmLog = path.join(binDir, "npm.log");
  const openclawPath = path.join(binDir, "openclaw");
  const npmPath = path.join(binDir, "npm");

  fs.writeFileSync(openclawPath, `#!/bin/sh
echo "$@" >> "${openclawLog}"
if [ "$1" = "--version" ]; then
  echo "openclaw ${"${FAKE_OPENCLAW_VERSION:-1.2.3}"}"
  exit 0
fi
if [ "$1" = "models" ] && [ "$2" = "status" ]; then
  echo "${"${FAKE_OPENCLAW_MODELS_STATUS:-{}}"}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "list" ]; then
  echo "${"${FAKE_OPENCLAW_AGENTS_LIST:-[]}"}"
  exit 0
fi
if [ "$1" = "agents" ] && [ "$2" = "add" ]; then
  echo "{}"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "install" ]; then
  echo "ok"
  exit 0
fi
if [ "$1" = "gateway" ] && [ "$2" = "call" ]; then
  if [ "${"${FAKE_OPENCLAW_GATEWAY_CALL:-ok}"}" = "fail" ]; then
    echo "gateway unavailable" 1>&2
    exit 1
  fi
  echo "{}"
  exit 0
fi
if [ "$1" = "memory" ]; then
  if [ -n "$FAKE_OPENCLAW_MEMORY_SEARCH" ]; then
    printf "%s\n" "$FAKE_OPENCLAW_MEMORY_SEARCH"
  else
    printf "%s\n" '{"results":[]}'
  fi
  exit 0
fi
if [ "$1" = "agent" ]; then
  echo "{\\"result\\":{\\"payloads\\":[{\\"text\\":\\"${"${FAKE_OPENCLAW_AGENT_TEXT:-hello from cli}"}\\"}]}}"
  exit 0
fi
exit 0
`, { mode: 0o755 });

  fs.writeFileSync(npmPath, `#!/bin/sh
echo "$@" >> "${npmLog}"
exit 0
`, { mode: 0o755 });

  return { binDir, openclawLog, npmLog };
}

function createFakeSkillSourceToolchain(): { binDir: string; clawhubLog: string; npxLog: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-sources-bin-"));
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

function createFakeTelegramSecretsProxy(): { proxyPath: string; statePath: string } {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-telegram-proxy-"));
  const proxyPath = path.join(binDir, "secrets-proxy");
  const statePath = path.join(binDir, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({
    webhookUrl: "",
    commands: [],
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
const body = JSON.parse(readFlag("--body") || "{}");
const method = url.split("/").pop();
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
let result;
switch (method) {
  case "getMe":
    result = { id: 42, is_bot: true, username: "claw_support_bot", first_name: "Claw Support" };
    break;
  case "setWebhook":
    state.webhookUrl = body.url || "";
    result = true;
    break;
  case "getWebhookInfo":
    result = { url: state.webhookUrl || "", pending_update_count: 0 };
    break;
  case "deleteWebhook":
    state.webhookUrl = "";
    result = true;
    break;
  default:
    result = true;
}
fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
process.stdout.write(JSON.stringify({ ok: true, result }));
`, { mode: 0o755 });
  return { proxyPath, statePath };
}

function createFakeGenerationScript(): string {
  const binDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generation-bin-"));
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
fs.writeFileSync(outputPath, "cli-artifact");
`, { mode: 0o755 });
  return scriptPath;
}

function createFakeOpenClawImageSkillEnv(): { skillsDir: string; binDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-skill-"));
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
if (outDirIndex === -1 || !args[outDirIndex + 1]) {
  console.error("missing --out-dir");
  process.exit(1);
}
const outDir = args[outDirIndex + 1];
const modelIndex = args.indexOf("--model");
const model = modelIndex === -1 ? "" : args[modelIndex + 1];
const formatIndex = args.indexOf("--output-format");
const format = formatIndex === -1 ? "png" : args[formatIndex + 1];
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "001-generated." + format), "cli-openclaw:" + model);
`, { mode: 0o755 });
  return { skillsDir, binDir };
}

async function withPatchedEnv<TValue>(
  patch: NodeJS.ProcessEnv,
  fn: () => Promise<TValue>,
): Promise<TValue> {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(patch)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await fn();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve local test server address");
  }
  return address.port;
}

test("runCli prints usage for unsupported commands", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["unknown"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_USAGE);
  assert.match(stderr.getOutput(), /Usage/);
});

test("runCli prints help and exits successfully", async () => {
  const stdout = captureStream();
  const exitCode = await runCli(["--help"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.equal(stdout.getOutput().trim(), CLI_USAGE);
});

test("runCli can scaffold a workspace-first project with the new command surface", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-new-workspace-"));
  const stdout = captureStream();

  const exitCode = await runCli(["new", "workspace", "demo-workspace", "--no-install", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"type": "workspace"/);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  assert.equal(packageJson.name, "demo-workspace");
  assert.equal(packageJson.devDependencies["@clawjs/cli"], "^0.1.0");

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.type, "workspace");
  assert.equal(projectConfig.directories.skills, "claw/skills");
});

test("runCli can manage command-backed generations end to end", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generations-"));
  const scriptPath = createFakeGenerationScript();

  const registerStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "register-command",
    "--workspace", workspaceDir,
    "--id", "fake-image",
    "--label", "Fake Image",
    "--kinds", "image",
    "--command", scriptPath,
    "--args-json", "[\"--out\",\"{outputPath}\"]",
    "--ext", "png",
    "--json",
  ], {
    stdout: registerStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(registerStdout.getOutput(), /"id": "fake-image"/);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "create",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--backend", "fake-image",
    "--prompt", "sunset over water",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  const created = JSON.parse(createStdout.getOutput()) as { id: string; output?: { filePath?: string } };
  assert.match(created.id, /^gen-/);
  assert.equal(fs.existsSync(created.output?.filePath || ""), true);

  const listStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "list",
    "--workspace", workspaceDir,
    "--kind", "image",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /"kind": "image"/);

  const readStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "read",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), new RegExp(created.id));

  const deleteStdout = captureStream();
  assert.equal(await runCli([
    "generations",
    "delete",
    "--workspace", workspaceDir,
    "--id", created.id,
    "--json",
  ], {
    stdout: deleteStdout.stream,
    stderr: captureStream().stream,
    cwd: workspaceDir,
  }), CLI_EXIT_OK);
  assert.match(deleteStdout.getOutput(), /"removed": true/);
});

test("runCli can create and list images through the image alias and an auto-detected OpenClaw skill", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-openclaw-generations-"));
  const { skillsDir, binDir } = createFakeOpenClawImageSkillEnv();

  await withPatchedEnv({
    OPENCLAW_SKILLS_DIR: skillsDir,
    OPENAI_API_KEY: "test-key",
    PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
  }, async () => {
    const backendsStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "backends",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: backendsStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(backendsStdout.getOutput(), /openclaw-skill:openai-image-gen/);

    const createStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "generate",
      "--workspace", workspaceDir,
      "--prompt", "editorial lobster portrait",
      "--model", "gpt-image-1.5",
      "--output-format", "webp",
      "--json",
    ], {
      stdout: createStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);

    const created = JSON.parse(createStdout.getOutput()) as { backendId: string; output?: { filePath?: string } };
    assert.equal(created.backendId, "openclaw-skill:openai-image-gen");
    assert.equal(fs.existsSync(created.output?.filePath || ""), true);
    assert.match(fs.readFileSync(created.output?.filePath || "", "utf8"), /cli-openclaw:gpt-image-1.5/);

    const listStdout = captureStream();
    assert.equal(await runCli([
      "image",
      "list",
      "--workspace", workspaceDir,
      "--json",
    ], {
      stdout: listStdout.stream,
      stderr: captureStream().stream,
      cwd: workspaceDir,
    }), CLI_EXIT_OK);
    assert.match(listStdout.getOutput(), /"backendId": "openclaw-skill:openai-image-gen"/);
  });
});

test("runCli generate, add, and info operate on claw projects", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-generate-"));

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");

  const generateStdout = captureStream();
  assert.equal(await runCli(["generate", "skill", "search-intents", "--project", projectRoot, "--json"], {
    stdout: generateStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(generateStdout.getOutput(), /"resource": "skill"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "skills", "search-intents.ts")), true);

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "telegram", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "telegram"/);
  assert.equal(fs.existsSync(path.join(projectRoot, "claw", "channels", "telegram.json")), true);

  const infoStdout = captureStream();
  assert.equal(await runCli(["info", "--project", projectRoot, "--json"], {
    stdout: infoStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(infoStdout.getOutput(), /"projectRoot"/);
  assert.match(infoStdout.getOutput(), /"type": "workspace"/);

  const projectConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, "claw.project.json"), "utf8"));
  assert.equal(projectConfig.resources.skills[0].id, "search-intents");
  assert.equal(projectConfig.resources.channels[0].id, "telegram");
});

test("runCli add workspace and workspace command groups operate on local productivity data", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-workspace-"));

  assert.equal(await runCli(["new", "workspace", "demo-workspace", "--no-install"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);

  const projectRoot = path.join(tempRoot, "demo-workspace");
  const installCalls: string[] = [];

  const addStdout = captureStream();
  assert.equal(await runCli(["add", "workspace", "--project", projectRoot, "--json"], {
    stdout: addStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
    runCommand: async (command, args) => {
      installCalls.push(`${command} ${args.join(" ")}`);
    },
  }), CLI_EXIT_OK);
  assert.match(addStdout.getOutput(), /"integration": "workspace"/);
  assert.match(installCalls.join("\n"), /@clawjs\/workspace/);

  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
  };
  assert.ok(packageJson.dependencies?.["@clawjs/workspace"]);

  const createStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "create",
    "Ship workspace",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  const createdTask = JSON.parse(createStdout.getOutput()) as { id: string };

  const listStdout = captureStream();
  assert.equal(await runCli([
    "tasks",
    "list",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: listStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), new RegExp(createdTask.id));

  const searchStdout = captureStream();
  assert.equal(await runCli([
    "workspace-search",
    "query",
    "workspace",
    "--workspace",
    projectRoot,
    "--runtime",
    "demo",
    "--json",
  ], {
    stdout: searchStdout.stream,
    stderr: captureStream().stream,
    cwd: tempRoot,
  }), CLI_EXIT_OK);
  assert.match(searchStdout.getOutput(), /"domain": "tasks"/);
});

test("runCli exposes explicit exit codes for success, degraded, failure, and usage states", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-codes-"));

  const successExitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const degradedExitCode = await runCli(["doctor", "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-degraded-")), "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const failureExitCode = await runCli(["workspace", "attach", "--workspace", fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-exit-failure-")), "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const usageExitCode = await runCli(["unknown"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(successExitCode, CLI_EXIT_OK);
  assert.equal(degradedExitCode, CLI_EXIT_DEGRADED);
  assert.equal(failureExitCode, CLI_EXIT_FAILURE);
  assert.equal(usageExitCode, CLI_EXIT_USAGE);
});

test("runCli can initialize a workspace in json mode", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-workspace-"));

  const exitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /manifestPath/);
});

test("runCli accepts explicit non-interactive mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-non-interactive-"));
  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "init", "--workspace", workspaceRoot, "--non-interactive", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /manifestPath/);
});

test("runCli can attach to an existing workspace", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-attach-"));
  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "attach", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"workspaceId"/);
});

test("runCli can connect and inspect telegram state through the CLI", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-telegram-"));
  const { proxyPath, statePath } = createFakeTelegramSecretsProxy();

  await withPatchedEnv({
    CLAWJS_SECRETS_PROXY_PATH: proxyPath,
    FAKE_TELEGRAM_PROXY_STATE: statePath,
  }, async () => {
    const connectStdout = captureStream();
    const connectExitCode = await runCli([
      "telegram",
      "connect",
      "--workspace",
      workspaceRoot,
      "--secret-name",
      "telegram_support_bot_token",
      "--webhook-url",
      "https://example.com/telegram/webhook",
      "--json",
    ], {
      stdout: connectStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    const statusStdout = captureStream();
    const statusExitCode = await runCli([
      "telegram",
      "status",
      "--workspace",
      workspaceRoot,
      "--json",
    ], {
      stdout: statusStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(connectExitCode, CLI_EXIT_OK);
    assert.equal(statusExitCode, CLI_EXIT_OK);
    assert.match(connectStdout.getOutput(), /claw_support_bot/);
    assert.match(statusStdout.getOutput(), /"mode": "webhook"/);
  });
});

test("runCli can discover workspaces under an explicit root", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-discover-"));
  const workspaceA = path.join(tempRoot, "apps", "a");
  const workspaceB = path.join(tempRoot, "apps", "nested", "b");

  await runCli(["workspace", "init", "--workspace", workspaceA, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  await runCli(["workspace", "init", "--workspace", workspaceB, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "discover", "--root", tempRoot, "--max-depth", "6", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"workspaceId": "a"/);
  assert.match(stdout.getOutput(), /"workspaceId": "b"/);
});

test("runCli doctor reports workspace diagnostics", async () => {
  const stdout = captureStream();
  const stderr = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-doctor-"));

  const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_DEGRADED);
  assert.match(stdout.getOutput(), /"workspace"/);
});

test("runCli redacts inline secrets from streamed error payloads in json mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-error-"));
  const sessionStdout = captureStream();
  await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Error stream", "--json"], {
    stdout: sessionStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const created = JSON.parse(sessionStdout.getOutput()) as { sessionId: string };
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "clawjs-app",
      workspaceId: path.basename(workspaceRoot),
      agentId: path.basename(workspaceRoot),
      rootDir: workspaceRoot,
    },
  });
  claw.conversations.appendMessage(created.sessionId, {
    role: "user",
    content: "hello",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("Authorization: Bearer secret-token-12345678", {
    status: 401,
    statusText: "Unauthorized",
  })) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      `--session-id=${created.sessionId}`,
      "--transport=gateway",
      "--gateway-url=http://127.0.0.1:18789",
      "--gateway-token=secret-token-12345678",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_FAILURE);
    assert.equal(stdout.getOutput().includes("secret-token-12345678"), false);
    assert.match(stdout.getOutput(), /Bearer \*{4,}5678/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli compat can refresh and persist a snapshot", async () => {
  const stdout = captureStream();
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-compat-"));

  const exitCode = await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.ok(exitCode === CLI_EXIT_OK || exitCode === CLI_EXIT_DEGRADED);
  assert.match(stdout.getOutput(), /"compat"/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "compat", "runtime-snapshot.json")), true);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "compat", "capability-report.json")), true);
});

test("runCli can execute runtime install, uninstall, setup-workspace, and repair against a fake toolchain", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-runtime-real-"));
  const { binDir, openclawLog, npmLog } = createFakeOpenClawToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.equal(await runCli(["runtime", "install", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "setup-workspace", "--workspace", workspaceRoot, "--agent-id", "demo-agent", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "repair", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);

    assert.equal(await runCli(["runtime", "uninstall", "--workspace", workspaceRoot, "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    }), CLI_EXIT_OK);
  });

  assert.match(fs.readFileSync(npmLog, "utf8"), /install -g openclaw/);
  assert.match(fs.readFileSync(npmLog, "utf8"), /uninstall -g openclaw/);
  const openclawCommands = fs.readFileSync(openclawLog, "utf8");
  assert.match(openclawCommands, /agents add demo-agent --non-interactive --workspace/);
  assert.match(openclawCommands, /gateway install/);
});

test("runCli can complete a compat drift cycle against a fake runtime", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-drift-cycle-"));
  const { binDir } = createFakeOpenClawToolchain();

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "1.2.3",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.ok((await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    })) === CLI_EXIT_OK);
  });

  const driftStdout = captureStream();
  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
      stdout: driftStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_DEGRADED);
  });

  assert.match(driftStdout.getOutput(), /compatDrift/);
  assert.match(driftStdout.getOutput(), /runtime version drifted/i);

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    assert.ok((await runCli(["compat", "--workspace", workspaceRoot, "--refresh", "--json"], {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    })) === CLI_EXIT_OK);
  });

  const cleanStdout = captureStream();
  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_VERSION: "2.0.0",
    FAKE_OPENCLAW_GATEWAY_CALL: "ok",
  }, async () => {
    const exitCode = await runCli(["doctor", "--workspace", workspaceRoot, "--json"], {
      stdout: cleanStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(exitCode, CLI_EXIT_OK);
  });

  assert.match(cleanStdout.getOutput(), /"ok": true/);
});

test("runCli can create and list sessions", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-session-"));

  const createStdout = captureStream();
  const createStderr = captureStream();
  const createExitCode = await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Hello", "--json"], {
    stdout: createStdout.stream,
    stderr: createStderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(createExitCode, CLI_EXIT_OK);
  assert.match(createStdout.getOutput(), /sessionId/);

  const listStdout = captureStream();
  const listStderr = captureStream();
  const listExitCode = await runCli(["sessions", "list", "--workspace", workspaceRoot, "--json"], {
    stdout: listStdout.stream,
    stderr: listStderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(listExitCode, CLI_EXIT_OK);
  assert.match(listStdout.getOutput(), /Hello/);
});

test("runCli can read a created session and sync a file block", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-read-"));

  const createStdout = captureStream();
  await runCli(["sessions", "create", "--workspace", workspaceRoot, "--title=Read me", "--json"], {
    stdout: createStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const created = JSON.parse(createStdout.getOutput()) as { sessionId: string };

  const syncStdout = captureStream();
  const syncExitCode = await runCli([
    "files", "sync",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--block-id", "tone",
    "--key", "tone",
    "--value", "direct",
    "--json",
  ], {
    stdout: syncStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(syncExitCode, CLI_EXIT_OK);
  assert.match(syncStdout.getOutput(), /SOUL\.md/);

  const readStdout = captureStream();
  const readExitCode = await runCli(["sessions", "read", "--workspace", workspaceRoot, `--session-id=${created.sessionId}`, "--json"], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /Read me/);
});

test("runCli can apply a template pack", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-template-"));
  const templatePackPath = path.join(workspaceRoot, "template-pack.json");
  fs.writeFileSync(templatePackPath, JSON.stringify({
    schemaVersion: 1,
    id: "demo-pack",
    name: "Demo Pack",
    mutations: [
      {
        targetFile: "SOUL.md",
        mode: "seed_if_missing",
        content: "seeded\n",
      },
    ],
  }, null, 2));

  const stdout = captureStream();
  const exitCode = await runCli([
    "files",
    "apply-template-pack",
    "--workspace", workspaceRoot,
    "--template-pack", templatePackPath,
    "--json",
  ], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /SOUL\.md/);
  assert.equal(fs.readFileSync(path.join(workspaceRoot, "SOUL.md"), "utf8"), "seeded\n");
});

test("runCli can write, read and inspect workspace files", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-fileio-"));

  const writeStdout = captureStream();
  const writeExitCode = await runCli([
    "files",
    "write",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--value", "before\n\n<!-- CLAWJS:tone:START -->\nkind\n<!-- CLAWJS:tone:END -->\n",
    "--json",
  ], {
    stdout: writeStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(writeExitCode, CLI_EXIT_OK);
  assert.match(writeStdout.getOutput(), /SOUL\.md/);

  const readStdout = captureStream();
  const readExitCode = await runCli([
    "files",
    "read",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--json",
  ], {
    stdout: readStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(readExitCode, CLI_EXIT_OK);
  assert.match(readStdout.getOutput(), /CLAWJS:tone:START/);

  const inspectStdout = captureStream();
  const inspectExitCode = await runCli([
    "files",
    "inspect",
    "--workspace", workspaceRoot,
    "--file", "SOUL.md",
    "--json",
  ], {
    stdout: inspectStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(inspectExitCode, CLI_EXIT_OK);
  assert.match(inspectStdout.getOutput(), /managedBlocks/);
});

test("runCli removes auth profiles with equals-style flags", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-auth-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-agent-"));

  saveAuthStore(agentDir, {
    version: 1,
    profiles: {
      "anthropic:manual": { type: "api_key", provider: "anthropic", key: "sk-12345678" },
      "openai:manual": { type: "api_key", provider: "openai", key: "sk-87654321" },
    },
  });

  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(["auth", "remove", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--provider=anthropic", "--json"], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /"removed": 1/);

  const remaining = JSON.parse(fs.readFileSync(path.join(agentDir, "auth-profiles.json"), "utf8")) as {
    profiles: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(remaining.profiles), ["openai:manual"]);
});

test("runCli supports auth login dry-run and workspace validate", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-validate-"));

  const validateBefore = captureStream();
  const validateBeforeExitCode = await runCli(["workspace", "validate", "--workspace", workspaceRoot, "--json"], {
    stdout: validateBefore.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(validateBeforeExitCode, CLI_EXIT_DEGRADED);
  assert.match(validateBefore.getOutput(), /"missingFiles"/);

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const validateAfter = captureStream();
  const validateAfterExitCode = await runCli(["workspace", "validate", "--workspace", workspaceRoot, "--json"], {
    stdout: validateAfter.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(validateAfterExitCode, CLI_EXIT_OK);
  assert.match(validateAfter.getOutput(), /"ok": true/);

  const loginStdout = captureStream();
  const loginExitCode = await runCli(["auth", "login", "--workspace", workspaceRoot, "--provider=openai", "--dry-run", "--json"], {
    stdout: loginStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(loginExitCode, CLI_EXIT_OK);
  assert.match(loginStdout.getOutput(), /openai-codex/);
});

test("runCli can repair a workspace and migrate legacy compat", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-repair-"));
  fs.mkdirSync(path.join(workspaceRoot, ".clawjs"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, ".clawjs", "compat.json"), JSON.stringify({
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

  const stdout = captureStream();
  const exitCode = await runCli(["workspace", "repair", "--workspace", workspaceRoot, "--json"], {
    stdout: stdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(exitCode, CLI_EXIT_OK);
  assert.match(stdout.getOutput(), /compatSnapshotMigrated/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, ".clawjs", "compat", "runtime-snapshot.json")), true);
});

test("runCli supports workspace reset dry-run and execution results", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-reset-"));
  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const previewStdout = captureStream();
  const previewExitCode = await runCli([
    "workspace",
    "reset",
    "--workspace", workspaceRoot,
    "--remove-runtime-files",
    "--dry-run",
    "--json",
  ], {
    stdout: previewStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(previewExitCode, CLI_EXIT_OK);
  assert.match(previewStdout.getOutput(), /runtime_file/);

  const resetStdout = captureStream();
  const resetExitCode = await runCli([
    "workspace",
    "reset",
    "--workspace", workspaceRoot,
    "--remove-runtime-files",
    "--json",
  ], {
    stdout: resetStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  assert.equal(resetExitCode, CLI_EXIT_OK);
  assert.match(resetStdout.getOutput(), /removedPaths/);
  assert.equal(fs.existsSync(path.join(workspaceRoot, "SOUL.md")), false);
});

test("runCli supports runtime install, uninstall, and repair dry-run", async () => {
  const installStdout = captureStream();
  const uninstallStdout = captureStream();
  const repairStdout = captureStream();
  const setupStdout = captureStream();

  const installExitCode = await runCli(["runtime", "install", "--dry-run", "--json"], {
    stdout: installStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const uninstallExitCode = await runCli(["runtime", "uninstall", "--dry-run", "--json"], {
    stdout: uninstallStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const repairExitCode = await runCli(["runtime", "repair", "--dry-run", "--json"], {
    stdout: repairStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const setupExitCode = await runCli(["runtime", "setup-workspace", "--workspace", "/tmp/claw-demo", "--agent-id", "demo", "--dry-run", "--json"], {
    stdout: setupStdout.stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(installExitCode, CLI_EXIT_OK);
  assert.equal(uninstallExitCode, CLI_EXIT_OK);
  assert.equal(repairExitCode, CLI_EXIT_OK);
  assert.equal(setupExitCode, CLI_EXIT_OK);
  assert.match(installStdout.getOutput(), /openclaw/);
  assert.match(uninstallStdout.getOutput(), /uninstall|remove/);
  assert.match(repairStdout.getOutput(), /gateway/);
  assert.match(setupStdout.getOutput(), /agents/);
});

test("runCli smokes the required command surface in dry-run or headless mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-smoke-"));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-smoke-agent-"));

  await runCli(["workspace", "init", "--workspace", workspaceRoot, "--json"], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  const commands: Array<{ argv: string[]; expected: number[] }> = [
    { argv: ["runtime", "status", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_DEGRADED] },
    { argv: ["runtime", "install", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["runtime", "repair", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "attach", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "inspect", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["workspace", "reset", "--workspace", workspaceRoot, "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["files", "diff", "--workspace", workspaceRoot, "--file", "SOUL.md", "--block-id", "tone", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_FAILURE] },
    { argv: ["files", "sync", "--workspace", workspaceRoot, "--file", "SOUL.md", "--block-id", "tone", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "status", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "login", "--workspace", workspaceRoot, "--provider", "openai", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["auth", "remove", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--provider=openai", "--json"], expected: [CLI_EXIT_OK, CLI_EXIT_FAILURE] },
    { argv: ["models", "list", "--workspace", workspaceRoot, `--agent-dir=${agentDir}`, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["models", "set-default", "--workspace", workspaceRoot, "--model", "openai", "--dry-run", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "list", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "search", "--workspace", workspaceRoot, "--query", "hello", "--json"], expected: [CLI_EXIT_OK] },
    { argv: ["sessions", "create", "--workspace", workspaceRoot, "--json"], expected: [CLI_EXIT_OK] },
  ];

  for (const command of commands) {
    const exitCode = await runCli(command.argv, {
      stdout: captureStream().stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });
    assert.equal(command.expected.includes(exitCode), true, command.argv.join(" "));
  }
});

test("runCli can search sessions through OpenClaw memory search", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-session-search-"));
  const { binDir } = createFakeOpenClawToolchain();
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-session-search",
      agentId: "demo-session-search",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.conversations.createSession("Budget review");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "Need to review the quarterly budget with finance",
  });

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_OPENCLAW_MEMORY_SEARCH: JSON.stringify({
      results: [{
        text: "Need to review the quarterly budget with finance",
        path: `/tmp/agents/demo-session-search/sessions/${session.sessionId}.jsonl`,
        score: 0.88,
      }],
    }),
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "search",
      "--workspace", workspaceRoot,
      "--workspace-id", "demo-session-search",
      "--agent-id", "demo-session-search",
      "--query", "budget finance",
      "--strategy", "openclaw-memory",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), new RegExp(session.sessionId));
    assert.match(stdout.getOutput(), /"strategy": "openclaw-memory"/);
  });
});

test("runCli lists external skill sources", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-sources-"));
  const { binDir } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "skills",
      "sources",
      "--workspace", workspaceRoot,
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"id": "clawhub"/);
    assert.match(stdout.getOutput(), /"id": "skills\.sh"/);
  });
});

test("runCli searches skill catalogs and reports omitted sources", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-search-"));
  const { binDir } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    FAKE_CLAWHUB_SEARCH_JSON: JSON.stringify([
      {
        slug: "support-triage",
        label: "Support Triage",
        summary: "Prioritize incoming support work.",
      },
    ]),
  }, async () => {
    const stdout = captureStream();
    const exitCode = await runCli([
      "skills",
      "search",
      "--workspace", workspaceRoot,
      "--query", "support",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"source": "clawhub"/);
    assert.match(stdout.getOutput(), /"omittedSources"/);
    assert.match(stdout.getOutput(), /"skills\.sh"/);
  });
});

test("runCli can resolve exact skills.sh refs and install clawhub skills", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-skill-install-"));
  const { binDir, clawhubLog } = createFakeSkillSourceToolchain();

  await withPatchedEnv({
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
  }, async () => {
    const searchStdout = captureStream();
    const searchExitCode = await runCli([
      "skills",
      "search",
      "--workspace", workspaceRoot,
      "--query", "vercel-labs/agent-skills",
      "--source", "skills.sh",
      "--json",
    ], {
      stdout: searchStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(searchExitCode, CLI_EXIT_OK);
    assert.match(searchStdout.getOutput(), /"source": "skills\.sh"/);

    const installStdout = captureStream();
    const installExitCode = await runCli([
      "skills",
      "install",
      "support-triage",
      "--workspace", workspaceRoot,
      "--source", "clawhub",
      "--json",
    ], {
      stdout: installStdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(installExitCode, CLI_EXIT_OK);
    assert.match(installStdout.getOutput(), /"runtimeVisibility": "runtime"/);
    assert.match(installStdout.getOutput(), /"support-triage"/);
    assert.equal(fs.existsSync(path.join(workspaceRoot, "skills", "support-triage", "SKILL.md")), true);
    assert.match(fs.readFileSync(clawhubLog, "utf8"), /install support-triage/);
  });
});

test("runCli can stream a session reply through gateway config", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-"));
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
      rootDir: workspaceRoot,
    },
  });
  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
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
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--gateway-url", "http://127.0.0.1:18789",
      "--system-prompt", "Be concise.",
      "--context", "Mode::Friendly.",
      "--transport", "gateway",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /hello world/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli can emit structured stream events in json mode", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-events-"));
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
      rootDir: workspaceRoot,
    },
  });
  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    if (attempts === 1) {
      return new Response("boom", { status: 500 });
    }
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"hello"}}]}\n'));
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    }), { status: 200 });
  }) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--gateway-url", "http://127.0.0.1:18789",
      "--transport", "gateway",
      "--gateway-retries", "1",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /"type": "retry"/);
    assert.match(stdout.getOutput(), /"type": "transport"/);
    assert.match(stdout.getOutput(), /"type": "done"/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli can use a real local gateway server with retry events", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-real-gateway-"));
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  let attempts = 0;
  const server = http.createServer((request, response) => {
    if (request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    attempts += 1;
    if (attempts === 1) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("boom");
      return;
    }
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write('data: {"choices":[{"delta":{"content":"hello"}}]}\n');
    response.write("data: [DONE]\n\n");
    response.end();
  });
  const port = await listen(server);

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "stream",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--transport", "gateway",
      "--gateway-url", `http://127.0.0.1:${port}`,
      "--gateway-retries", "1",
      "--events",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.equal(attempts, 2);
    assert.match(stdout.getOutput(), /"type": "retry"/);
    assert.match(stdout.getOutput(), /"type": "done"/);
  } finally {
    server.close();
  }
});

test("runCli falls back from a real local gateway server to the fake CLI runtime", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-stream-fallback-"));
  const { binDir, openclawLog } = createFakeOpenClawToolchain();
  const claw = await createClaw({
    runtime: { adapter: "openclaw" },
    workspace: {
      appId: "demo",
      workspaceId: "demo-main",
      agentId: "demo-main",
      rootDir: workspaceRoot,
    },
  });
  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "say hi",
  });

  const server = http.createServer((_request, response) => {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("gateway down");
  });
  const port = await listen(server);

  try {
    await withPatchedEnv({
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      FAKE_OPENCLAW_AGENT_TEXT: "hello from cli",
    }, async () => {
      const stdout = captureStream();
      const exitCode = await runCli([
        "sessions",
        "stream",
        "--workspace", workspaceRoot,
        "--session-id", session.sessionId,
        "--transport", "auto",
        "--gateway-url", `http://127.0.0.1:${port}`,
        "--events",
        "--json",
      ], {
        stdout: stdout.stream,
        stderr: captureStream().stream,
        cwd: process.cwd(),
      });

      assert.equal(exitCode, CLI_EXIT_OK);
      assert.match(stdout.getOutput(), /"transport": "gateway"/);
      assert.match(stdout.getOutput(), /"transport": "cli"/);
      assert.match(stdout.getOutput(), /hello from cli/);
    });
  } finally {
    server.close();
  }

  assert.match(fs.readFileSync(openclawLog, "utf8"), new RegExp(`agent --agent ${path.basename(workspaceRoot)} --session-id`));
});

test("runCli can generate a session title through gateway config", async () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-title-"));
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
      rootDir: workspaceRoot,
    },
  });
  const session = claw.conversations.createSession("Hello");
  claw.conversations.appendMessage(session.sessionId, {
    role: "user",
    content: "I want to talk about anxiety at work",
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({
    choices: [{ message: { content: "Work anxiety" } }],
  }), { status: 200 })) as typeof fetch;

  try {
    const stdout = captureStream();
    const exitCode = await runCli([
      "sessions",
      "generate-title",
      "--workspace", workspaceRoot,
      "--session-id", session.sessionId,
      "--gateway-url", "http://127.0.0.1:18789",
      "--transport", "gateway",
      "--json",
    ], {
      stdout: stdout.stream,
      stderr: captureStream().stream,
      cwd: process.cwd(),
    });

    assert.equal(exitCode, CLI_EXIT_OK);
    assert.match(stdout.getOutput(), /Work anxiety/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("runCli honors --runtime for alternate workspace layouts", async () => {
  const zeroWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-zeroclaw-"));
  const picoWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-cli-picoclaw-"));

  const zeroExitCode = await runCli([
    "--runtime", "zeroclaw",
    "workspace", "init",
    "--workspace", zeroWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });
  const picoExitCode = await runCli([
    "--runtime", "picoclaw",
    "workspace", "init",
    "--workspace", picoWorkspace,
    "--json",
  ], {
    stdout: captureStream().stream,
    stderr: captureStream().stream,
    cwd: process.cwd(),
  });

  assert.equal(zeroExitCode, CLI_EXIT_OK);
  assert.equal(picoExitCode, CLI_EXIT_OK);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(zeroWorkspace, "TOOLS.md")), false);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "memory", "MEMORY.md")), true);
  assert.equal(fs.existsSync(path.join(picoWorkspace, "TOOLS.md")), false);
});
