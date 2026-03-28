import { execFile } from "child_process";

import { getClaw } from "@/lib/claw";

export interface OpenClawWhatsAppChannelStatus {
  available: boolean;
  linked: boolean;
  connected: boolean;
  configured: boolean;
  running: boolean;
  lastError: string | null;
}

export interface OpenClawGatewayStatus {
  cliAvailable: boolean;
  gatewayConfigured: boolean;
  gatewayReachable: boolean;
  pluginEnabled: boolean;
  whatsapp: OpenClawWhatsAppChannelStatus;
}

import { findCommandFresh } from "@/lib/platform";

async function execOpenClaw(args: string[]): Promise<string> {
  const binary = await findCommandFresh("openclaw");
  if (!binary) {
    throw new Error("openclaw CLI is not available");
  }

  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function execOpenClawGatewayCall(method: string, params: Record<string, unknown>): Promise<string> {
  const claw = await getClaw();
  const result = await claw.runtime.gateway.call(method, params, { timeoutMs: 10_000 });
  return typeof result === "string" ? result : JSON.stringify(result);
}

export async function ensureWhatsAppPluginEnabled(): Promise<boolean> {
  const status = await getOpenClawGatewayStatus();
  if (status.pluginEnabled) return false;

  await execOpenClaw(["config", "set", "--strict-json", "plugins.entries.whatsapp.enabled", "true"]);
  const claw = await getClaw();
  await claw.runtime.gateway.restart();
  await claw.runtime.gateway.waitUntilReady({ timeoutMs: 10_000, intervalMs: 1_000 });
  return true;
}

export async function getOpenClawGatewayStatus(): Promise<OpenClawGatewayStatus> {
  const cliAvailable = !!await findCommandFresh("openclaw");
  if (!cliAvailable) {
    return {
      cliAvailable,
      gatewayConfigured: false,
      gatewayReachable: false,
      pluginEnabled: false,
      whatsapp: {
        available: false,
        linked: false,
        connected: false,
        configured: false,
        running: false,
        lastError: null,
      },
    };
  }

  try {
    const claw = await getClaw();
    const gatewayStatus = await claw.runtime.gateway.status();
    const data = (gatewayStatus.response ?? await claw.runtime.gateway.call("channels.status", {
      probe: true,
      timeoutMs: 3000,
    }, { timeoutMs: 3_000 })) as {
      channels?: Record<string, {
        configured?: boolean;
        connected?: boolean;
        running?: boolean;
        lastError?: string | null;
      }>;
      channelAccounts?: Record<string, Array<{
        configured?: boolean;
        linked?: boolean;
        connected?: boolean;
        running?: boolean;
        lastError?: string | null;
      }>>;
    };

    const channel = data.channels?.whatsapp;
    const account = data.channelAccounts?.whatsapp?.[0];
    const pluginEnabled = !!channel || Array.isArray(data.channelAccounts?.whatsapp);

    return {
      cliAvailable,
      gatewayConfigured: !!gatewayStatus.config,
      gatewayReachable: gatewayStatus.available,
      pluginEnabled,
      whatsapp: {
        available: pluginEnabled || !!channel || Array.isArray(data.channelAccounts?.whatsapp),
        linked: !!account?.linked,
        connected: !!channel?.connected || !!account?.connected,
        configured: !!channel?.configured || !!account?.configured,
        running: !!channel?.running || !!account?.running,
        lastError: account?.lastError || channel?.lastError || null,
      },
    };
  } catch {
    return {
      cliAvailable,
      gatewayConfigured: false,
      gatewayReachable: false,
      pluginEnabled: false,
      whatsapp: {
        available: false,
        linked: false,
        connected: false,
        configured: false,
        running: false,
        lastError: null,
      },
    };
  }
}

export async function startWhatsAppLogin(): Promise<{ qrDataUrl?: string; message?: string }> {
  const raw = await execOpenClawGatewayCall("web.login.start", { force: false, timeoutMs: 5000 });
  return JSON.parse(raw) as { qrDataUrl?: string; message?: string };
}
