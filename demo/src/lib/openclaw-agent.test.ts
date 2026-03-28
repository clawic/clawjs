import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getClawJSOpenClawStatus,
  pickPreferredAuthenticatedOpenClawModel,
} from "./openclaw-agent.ts";
import { getClaw } from "./claw.ts";

function writeFakeOpenClawCli(binDir: string): void {
  const scriptPath = path.join(binDir, "openclaw");
  const script = `#!/bin/sh
set -eu

agent_id="\${OPENCLAW_FAKE_AGENT_ID:-clawjs-demo}"
state_dir="\${OPENCLAW_STATE_DIR:?missing OPENCLAW_STATE_DIR}"

if [ "$1" = "agents" ] && [ "$2" = "add" ]; then
  mkdir -p "$state_dir"
  cat > "$state_dir/openclaw.json" <<JSON
{"agents":{"list":[{"id":"$agent_id","workspace":"$state_dir/workspaces/$agent_id","agentDir":"$state_dir/agents/$agent_id/agent"}]}}
JSON
  printf '{"id":"%s"}\\n' "$agent_id"
  exit 0
fi

if [ "$1" = "--version" ]; then
  echo "openclaw 0.0.0-fake"
  exit 0
fi

case "$*" in
  *models*status*)
    if [ -n "\${OPENCLAW_FAKE_MODEL_STATUS:-}" ]; then
      printf '%s\\n' "$OPENCLAW_FAKE_MODEL_STATUS"
    else
      echo '{}'
    fi
    exit 0
    ;;
esac

echo "unsupported fake openclaw command: $*" >&2
exit 1
`;

  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
}

async function withFakeOpenClaw<T>(
  modelStatus: string,
  run: (paths: { stateDir: string; agentDir: string; workspaceDir: string }) => Promise<T>,
): Promise<T> {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-openclaw-status-"));
  const binDir = path.join(tempRoot, "bin");
  const stateDir = path.join(tempRoot, "openclaw-state");
  const homeDir = path.join(tempRoot, "home");

  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
  writeFakeOpenClawCli(binDir);

  // Pre-create the config so readOpenClawConfig() finds the agent.
  // getClawJSOpenClawStatus is read-only and does not call ensureClawJSOpenClawAgent().
  const agentId = "clawjs-demo";
  const configPayload = {
    agents: {
      list: [
        {
          id: agentId,
          workspace: path.join(stateDir, "workspaces", agentId),
          agentDir: path.join(stateDir, "agents", agentId, "agent"),
        },
      ],
    },
  };
  fs.writeFileSync(path.join(stateDir, "openclaw.json"), JSON.stringify(configPayload));
  const workspaceDir = path.join(stateDir, "workspaces", agentId);
  const agentDir = path.join(stateDir, "agents", agentId, "agent");
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(agentDir, { recursive: true });

  const previousPath = process.env.PATH;
  const previousHome = process.env.HOME;
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  const previousModelStatus = process.env.OPENCLAW_FAKE_MODEL_STATUS;
  const previousAgentId = process.env.OPENCLAW_FAKE_AGENT_ID;

  process.env.PATH = `${binDir}:${path.dirname(process.execPath)}:/usr/bin:/bin`;
  process.env.HOME = homeDir;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  process.env.OPENCLAW_FAKE_MODEL_STATUS = modelStatus;
  process.env.OPENCLAW_FAKE_AGENT_ID = "clawjs-demo";

  try {
    return await run({ stateDir, agentDir, workspaceDir });
  } finally {
    if (previousPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = previousPath;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    if (previousModelStatus === undefined) {
      delete process.env.OPENCLAW_FAKE_MODEL_STATUS;
    } else {
      process.env.OPENCLAW_FAKE_MODEL_STATUS = previousModelStatus;
    }
    if (previousAgentId === undefined) {
      delete process.env.OPENCLAW_FAKE_AGENT_ID;
    } else {
      process.env.OPENCLAW_FAKE_AGENT_ID = previousAgentId;
    }

    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test("getClawJSOpenClawStatus reports needs setup when the agent has no model", { concurrency: false }, async () => {
  await withFakeOpenClaw("", async () => {
    const status = await getClawJSOpenClawStatus();

    assert.equal(status.installed, true);
    assert.equal(status.agentConfigured, true);
    assert.equal(status.modelConfigured, false);
    assert.equal(status.authConfigured, false);
    assert.equal(status.ready, false);
    assert.equal(status.needsSetup, false);
    assert.equal(status.needsAuth, true);
    assert.equal(status.lastError, null);
  });
});

test("getClawJSOpenClawStatus reports model selection while auth is still pending", { concurrency: false }, async () => {
  await withFakeOpenClaw('{"defaultModel":"openai/gpt-5.4","auth":{"missingProvidersInUse":[],"providers":[{"provider":"openai","effective":{"kind":"apiKey"},"profiles":{"apiKey":1}}]}}', async () => {
    const status = await getClawJSOpenClawStatus();

    assert.equal(status.installed, true);
    assert.equal(status.agentConfigured, true);
    assert.equal(status.modelConfigured, true);
    assert.equal(status.authConfigured, true);
    assert.equal(status.defaultModel, "openai/gpt-5.4");
    assert.equal(status.ready, true);
    assert.equal(status.needsSetup, false);
    assert.equal(status.needsAuth, false);
    assert.equal(status.lastError, null);
  });
});

test("getClawJSOpenClawStatus reports auth configured from the OpenClaw auth store", { concurrency: false }, async () => {
  await withFakeOpenClaw('{"defaultModel":"openai-codex/gpt-5.4","auth":{"missingProvidersInUse":[],"providers":[{"provider":"openai-codex","effective":{"kind":"oauth"},"profiles":{"oauth":1}}]}}', async ({ agentDir }) => {
    fs.writeFileSync(path.join(agentDir, "auth-profiles.json"), JSON.stringify({
      version: 1,
      profiles: {
        "openai-codex:default": {
          type: "oauth",
          provider: "openai-codex",
          token: "oauth-token",
        },
      },
    }));
    const claw = await getClaw();
    claw.intent.patch("providers", {
      providers: {
        "openai-codex": {
          enabled: true,
          preferredAuthMode: "oauth",
        },
      },
    });

    const status = await getClawJSOpenClawStatus();

    assert.equal(status.installed, true);
    assert.equal(status.agentConfigured, true);
    assert.equal(status.modelConfigured, true);
    assert.equal(status.authConfigured, true);
    assert.equal(status.defaultModel, "openai-codex/gpt-5.4");
    assert.equal(status.ready, true);
    assert.equal(status.needsSetup, false);
    assert.equal(status.needsAuth, false);
  });
});

test("pickPreferredAuthenticatedOpenClawModel prioritizes ChatGPT subscription auth", () => {
  const model = pickPreferredAuthenticatedOpenClawModel({
    openai: {
      provider: "openai",
      hasAuth: true,
      hasSubscription: false,
      hasApiKey: true,
      hasProfileApiKey: false,
      hasEnvKey: true,
      authType: "env",
    },
    "openai-codex": {
      provider: "openai-codex",
      hasAuth: true,
      hasSubscription: true,
      hasApiKey: false,
      hasProfileApiKey: false,
      hasEnvKey: false,
      authType: "oauth",
    },
  });

  assert.equal(model, "openai-codex/gpt-5.4");
});
