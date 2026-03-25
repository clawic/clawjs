import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getClaw, ensureClawWorkspaceReady } from "@/lib/claw";
import { getE2EIntegrationStatus, isE2EEnabled, setE2EIntegrationStatus } from "@/lib/e2e";
import { getUserConfig, saveUserConfig } from "@/lib/user-config";

const execFileAsync = promisify(execFile);

const SLACK_SECRET_NAME = "clawjs_slack_bot_token";

async function storeSecretInKeychain(secretName: string, secretValue: string): Promise<void> {
  const serviceName = `secrets-proxy:${secretName}`;

  // Delete existing entry if present (ignore errors)
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-s", serviceName,
      "-a", secretName,
    ], { timeout: 5000 });
  } catch {
    // Entry didn't exist, that's fine
  }

  // Add new entry
  await execFileAsync("security", [
    "add-generic-password",
    "-s", serviceName,
    "-a", secretName,
    "-w", secretValue,
    "-U",
  ], { timeout: 5000 });
}

async function removeSecretFromKeychain(secretName: string): Promise<void> {
  const serviceName = `secrets-proxy:${secretName}`;
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-s", serviceName,
      "-a", secretName,
    ], { timeout: 5000 });
  } catch {
    // Entry didn't exist
  }
}

export async function POST(req: NextRequest) {
  try {
    const { botToken, enabled } = await req.json();

    if (isE2EEnabled()) {
      const status = getE2EIntegrationStatus();
      const config = getUserConfig();
      if (enabled === false || botToken === null) {
        const next = {
          ...status,
          slack: {
            enabled: false,
            botConnected: false,
            botUsername: undefined,
            teamName: undefined,
            lastError: null,
          },
        };
        setE2EIntegrationStatus(next);
        saveUserConfig({
          ...config,
          slack: {
            enabled: false,
            botToken: "",
            botUsername: "",
            teamName: "",
            allowedChannelIds: [],
            syncMessages: false,
          },
        });
        return Response.json({ ok: true, state: enabled === false ? "disabled" : "disconnected" });
      }
      if (!botToken || typeof botToken !== "string") {
        return Response.json({ ok: false, error: "Missing bot token" }, { status: 400 });
      }
      const next = {
        ...status,
        slack: {
          enabled: true,
          botConnected: true,
          botUsername: "clawjs_demo_bot",
          teamName: "ClawJS Demo Team",
          lastError: null,
        },
      };
      setE2EIntegrationStatus(next);
      saveUserConfig({
        ...config,
        slack: {
          ...config.slack,
          enabled: true,
          botToken: "",
          botUsername: "clawjs_demo_bot",
          teamName: "ClawJS Demo Team",
        },
      });
      return Response.json({
        ok: true,
        state: "connected",
        botUsername: "clawjs_demo_bot",
        teamName: "ClawJS Demo Team",
      });
    }

    // Disable flow
    if (enabled === false) {
      const config = getUserConfig();
      config.slack = { ...config.slack, enabled: false };
      saveUserConfig(config);

      return Response.json({
        ok: true,
        state: "disabled",
      });
    }

    // Delete flow
    if (botToken === null) {
      await removeSecretFromKeychain(SLACK_SECRET_NAME);

      const config = getUserConfig();
      config.slack = {
        enabled: false,
        botToken: "",
        botUsername: "",
        teamName: "",
        allowedChannelIds: [],
        syncMessages: false,
      };
      saveUserConfig(config);

      return Response.json({
        ok: true,
        state: "disconnected",
      });
    }

    // Connect flow
    if (!botToken || typeof botToken !== "string") {
      return Response.json({ ok: false, error: "Missing bot token" }, { status: 400 });
    }

    // 1. First validate the token directly against Slack API
    const authRes = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const authData = await authRes.json();
    if (!authData.ok) {
      return Response.json({
        ok: false,
        error: authData.error || "Invalid bot token",
      });
    }

    const botUsername = authData.user;
    const teamName = authData.team;

    // 2. Store the token in macOS Keychain
    await storeSecretInKeychain(SLACK_SECRET_NAME, botToken);

    // 3. Save to user config
    const config = getUserConfig();
    config.slack = {
      ...config.slack,
      enabled: true,
      botToken: "",
      botUsername,
      teamName,
    };
    saveUserConfig(config);

    // 4. Best-effort workspace setup. Slack runtime wiring is not yet available in this SDK build.
    try {
      await ensureClawWorkspaceReady();
      await getClaw();
    } catch (sdkError) {
      console.warn("[slack] workspace setup failed:", sdkError);
    }

    return Response.json({
      ok: true,
      state: "connected",
      botUsername,
      teamName,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "Connection failed",
    }, { status: 500 });
  }
}
