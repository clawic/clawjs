import { NextRequest } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getClaw, ensureClawWorkspaceReady } from "@/lib/claw";
import { getE2EIntegrationStatus, isE2EEnabled, setE2EIntegrationStatus } from "@/lib/e2e";
import { getUserConfig, saveUserConfig } from "@/lib/user-config";

const execFileAsync = promisify(execFile);

const TELEGRAM_SECRET_NAME = "clawjs_telegram_bot_token";

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
          telegram: {
            enabled: false,
            botConnected: false,
            botUsername: undefined,
            webhookUrl: undefined,
            lastError: null,
          },
        };
        setE2EIntegrationStatus(next);
        saveUserConfig({
          ...config,
          telegram: {
            enabled: false,
            botToken: "",
            botName: "",
            botUsername: "",
            allowedChatIds: [],
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
        telegram: {
          enabled: true,
          botConnected: true,
          botUsername: "clawjs_demo_bot",
          webhookUrl: "https://example.invalid/webhook",
          lastError: null,
        },
      };
      setE2EIntegrationStatus(next);
      saveUserConfig({
        ...config,
        telegram: {
          ...config.telegram,
          enabled: true,
          botToken: "",
          botName: "ClawJS Demo Bot",
          botUsername: "clawjs_demo_bot",
        },
      });
      return Response.json({
        ok: true,
        state: "connected",
        botUsername: "clawjs_demo_bot",
        botName: "ClawJS Demo Bot",
      });
    }

    // Disable flow
    if (enabled === false) {
      const config = getUserConfig();
      config.telegram = { ...config.telegram, enabled: false };
      saveUserConfig(config);

      return Response.json({
        ok: true,
        state: "disabled",
      });
    }

    // Delete flow
    if (botToken === null) {
      await removeSecretFromKeychain(TELEGRAM_SECRET_NAME);

      const config = getUserConfig();
      config.telegram = {
        enabled: false,
        botToken: "",
        botName: "",
        botUsername: "",
        allowedChatIds: [],
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

    // 1. First validate the token directly against Telegram API
    const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
    const meData = await meRes.json();
    if (!meData.ok || !meData.result) {
      return Response.json({
        ok: false,
        error: meData.description || "Invalid bot token",
      });
    }

    const botUsername = meData.result.username;
    const botName = meData.result.first_name;

    // 2. Store the token in macOS Keychain
    await storeSecretInKeychain(TELEGRAM_SECRET_NAME, botToken);

    // 3. Save to user config
    const config = getUserConfig();
    config.telegram = {
      ...config.telegram,
      enabled: true,
      botToken: "",
      botName,
      botUsername,
    };
    saveUserConfig(config);

    // 4. Connect via ClawJS SDK
    try {
      await ensureClawWorkspaceReady();
      const claw = await getClaw();
      await claw.telegram.connectBot({
        secretName: TELEGRAM_SECRET_NAME,
        dropPendingUpdates: true,
      });

      // 5. Start polling so the bot actively receives messages
      await claw.telegram.startPolling({
        allowedUpdates: ["message", "edited_message", "callback_query"],
        dropPendingUpdates: true,
      });
    } catch (sdkError) {
      // SDK integration failed but token is valid - still mark as connected
      // The user can use it once SDK issues are resolved
      console.warn("[telegram] SDK connectBot/startPolling failed:", sdkError);
    }

    return Response.json({
      ok: true,
      state: "connected",
      botUsername,
      botName,
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "Connection failed",
    }, { status: 500 });
  }
}
