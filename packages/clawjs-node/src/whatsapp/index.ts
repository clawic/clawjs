import { maskCredential, type ChannelDescriptor, type WhatsAppBotProfile, type WhatsAppStateSnapshot, type WhatsAppTransportStatus } from "@clawjs/core";

import type { WorkspaceDataStore } from "../data/store.ts";
import type { CommandRunner } from "../runtime/contracts.ts";
import type { ConversationStore } from "../conversations/store.ts";
import { DEFAULT_SECRETS_PROXY_PATH } from "../secrets/index.ts";
import { readWhatsAppStateSnapshot, writeWhatsAppStateSnapshot } from "../state/store.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";

const DEFAULT_WACLI_PATH = "wacli";
const WHATSAPP_GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

type JsonRecord = Record<string, unknown>;

export interface WhatsAppConnectInput {
  mode: "wacli" | "business-api";
  secretName?: string;
  phoneNumberId?: string;
}

export interface WhatsAppSendMessageInput {
  to: string;
  text: string;
  quotedMessageId?: string;
}

export interface WhatsAppStatusResult extends WhatsAppStateSnapshot {
  channel: ChannelDescriptor;
}

export interface WhatsAppService {
  channel(): ChannelDescriptor;
  status(): Promise<WhatsAppStatusResult>;
  connect(input: WhatsAppConnectInput): Promise<WhatsAppStatusResult>;
  sendMessage(input: WhatsAppSendMessageInput): Promise<JsonRecord>;
  disconnect(): Promise<WhatsAppStatusResult>;
}

export interface CreateWhatsAppServiceOptions {
  workspaceDir: string;
  dataStore: WorkspaceDataStore;
  conversationStore: ConversationStore;
  runner: CommandRunner;
  env?: NodeJS.ProcessEnv;
  filesystem?: NodeFileSystemHost;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readState(workspaceDir: string, filesystem: NodeFileSystemHost): WhatsAppStateSnapshot {
  return readWhatsAppStateSnapshot(workspaceDir, filesystem) ?? {
    schemaVersion: 1,
    updatedAt: nowIso(),
    connected: false,
    transport: {
      mode: "disabled",
      active: false,
    },
    recentErrors: [],
    canSendMessages: false,
  };
}

function writeState(
  workspaceDir: string,
  filesystem: NodeFileSystemHost,
  next: WhatsAppStateSnapshot,
): WhatsAppStateSnapshot {
  return writeWhatsAppStateSnapshot(workspaceDir, {
    ...next,
    schemaVersion: 1,
    updatedAt: nowIso(),
  }, filesystem);
}

function validateSecretName(secretName: string | undefined): string {
  const trimmed = (secretName ?? "").trim();
  if (!trimmed) {
    throw new Error("whatsapp secretName is required for business-api mode");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`whatsapp secretName contains unsupported characters: ${secretName}`);
  }
  return trimmed;
}

function validatePhoneNumberId(phoneNumberId: string | undefined): string {
  const trimmed = (phoneNumberId ?? "").trim();
  if (!trimmed) {
    throw new Error("whatsapp phoneNumberId is required for business-api mode");
  }
  return trimmed;
}

function maskSecretReference(secretName: string): string {
  return `vault:${maskCredential(secretName) ?? "configured"}`;
}

function resolveSecretsProxyPath(env?: NodeJS.ProcessEnv): string {
  return env?.CLAWJS_SECRETS_PROXY_PATH?.trim() || process.env.CLAWJS_SECRETS_PROXY_PATH?.trim() || DEFAULT_SECRETS_PROXY_PATH;
}

function resolveWacliPath(env?: NodeJS.ProcessEnv): string {
  return env?.CLAWJS_WACLI_PATH?.trim() || process.env.CLAWJS_WACLI_PATH?.trim() || DEFAULT_WACLI_PATH;
}

function buildRunnerEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

async function callBusinessApi<TResult>(
  runner: CommandRunner,
  env: NodeJS.ProcessEnv | undefined,
  secretName: string,
  phoneNumberId: string,
  endpoint: string,
  body: JsonRecord,
  timeoutMs = 15_000,
): Promise<TResult> {
  const proxyPath = resolveSecretsProxyPath(env);
  const url = `${WHATSAPP_GRAPH_API_BASE}/${phoneNumberId}/${endpoint}`;
  const args = [
    "request",
    "--method",
    "POST",
    "--url",
    url,
    "--header",
    "Content-Type: application/json",
    "--header",
    `Authorization: Bearer {{${secretName}}}`,
    "--body",
    JSON.stringify(body),
    "--timeout",
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
  ];
  const result = await runner.exec(proxyPath, args, {
    env: buildRunnerEnv(env),
    timeoutMs: timeoutMs + 1_000,
  });
  const payload = JSON.parse(result.stdout || "null") as JsonRecord;
  if (payload?.error) {
    const errObj = payload.error as JsonRecord;
    throw new Error(`WhatsApp API ${endpoint} failed: ${errObj.message ?? JSON.stringify(errObj)}`);
  }
  return payload as TResult;
}

async function callWacli(
  runner: CommandRunner,
  env: NodeJS.ProcessEnv | undefined,
  args: string[],
  timeoutMs = 15_000,
): Promise<JsonRecord> {
  const wacliPath = resolveWacliPath(env);
  const result = await runner.exec(wacliPath, args, {
    env: buildRunnerEnv(env),
    timeoutMs,
  });
  try {
    return JSON.parse(result.stdout || "{}") as JsonRecord;
  } catch {
    return { stdout: result.stdout, stderr: result.stderr };
  }
}

function buildChannel(snapshot: WhatsAppStateSnapshot): ChannelDescriptor {
  const lastError = snapshot.recentErrors[0] ?? null;
  const status: ChannelDescriptor["status"] = !snapshot.connected
    ? "disconnected"
    : lastError
      ? "degraded"
      : snapshot.transport.active
        ? "connected"
        : "configured";
  return {
    id: "whatsapp",
    label: snapshot.botProfile?.displayName
      ? `WhatsApp (${snapshot.botProfile.displayName})`
      : "WhatsApp",
    kind: "chat",
    status,
    provider: "whatsapp",
    lastError,
    metadata: {
      mode: snapshot.transport.mode,
      phoneNumberId: snapshot.botProfile?.phoneNumber,
    },
  };
}

function appendRecentError(snapshot: WhatsAppStateSnapshot, message: string): WhatsAppStateSnapshot {
  return {
    ...snapshot,
    recentErrors: [message, ...snapshot.recentErrors.filter((entry) => entry !== message)].slice(0, 10),
  };
}

export function createWhatsAppService(options: CreateWhatsAppServiceOptions): WhatsAppService {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();

  async function persist(snapshot: WhatsAppStateSnapshot): Promise<WhatsAppStateSnapshot> {
    return writeState(options.workspaceDir, filesystem, snapshot);
  }

  async function status(): Promise<WhatsAppStatusResult> {
    const snapshot = readState(options.workspaceDir, filesystem);
    const persisted = await persist(snapshot);
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function connect(input: WhatsAppConnectInput): Promise<WhatsAppStatusResult> {
    const mode = input.mode ?? "wacli";
    let snapshot = readState(options.workspaceDir, filesystem);

    if (mode === "business-api") {
      const secretName = validateSecretName(input.secretName);
      const phoneNumberId = validatePhoneNumberId(input.phoneNumberId);

      // Verify credentials by calling the phone number endpoint
      let profile: WhatsAppBotProfile | undefined;
      try {
        const proxyPath = resolveSecretsProxyPath(options.env);
        const url = `${WHATSAPP_GRAPH_API_BASE}/${phoneNumberId}`;
        const result = await options.runner.exec(proxyPath, [
          "request",
          "--method", "GET",
          "--url", url,
          "--header", `Authorization: Bearer {{${secretName}}}`,
          "--timeout", "10",
        ], {
          env: buildRunnerEnv(options.env),
          timeoutMs: 12_000,
        });
        const data = JSON.parse(result.stdout || "null") as JsonRecord;
        if (data?.error) {
          throw new Error(`WhatsApp verification failed: ${(data.error as JsonRecord).message ?? "unknown error"}`);
        }
        profile = {
          phoneNumber: phoneNumberId,
          displayName: typeof data.verified_name === "string" ? data.verified_name : phoneNumberId,
          platform: "business-api",
          verified: typeof data.verified_name === "string" ? true : undefined,
        };
      } catch (error) {
        throw new Error(`Failed to verify WhatsApp Business API credentials: ${error instanceof Error ? error.message : String(error)}`);
      }

      snapshot = {
        ...snapshot,
        connected: true,
        secretName,
        maskedCredential: maskSecretReference(secretName),
        botProfile: profile,
        transport: {
          mode: "business-api",
          active: true,
        },
        recentErrors: [],
        canSendMessages: true,
      };
    } else {
      // wacli mode: verify wacli is available
      try {
        await callWacli(options.runner, options.env, ["status"], 10_000);
      } catch (error) {
        throw new Error(`Failed to connect via wacli: ${error instanceof Error ? error.message : String(error)}`);
      }

      snapshot = {
        ...snapshot,
        connected: true,
        transport: {
          mode: "wacli",
          active: true,
        },
        recentErrors: [],
        canSendMessages: true,
      };
    }

    const persisted = await persist(snapshot);
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function sendMessage(input: WhatsAppSendMessageInput): Promise<JsonRecord> {
    const snapshot = readState(options.workspaceDir, filesystem);
    if (!snapshot.connected) {
      throw new Error("whatsapp is not connected");
    }

    const mode = snapshot.transport.mode;

    if (mode === "business-api") {
      if (!snapshot.secretName || !snapshot.botProfile?.phoneNumber) {
        throw new Error("whatsapp business-api credentials are not configured");
      }
      const body: JsonRecord = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: input.to,
        type: "text",
        text: { body: input.text },
      };
      if (input.quotedMessageId) {
        body.context = { message_id: input.quotedMessageId };
      }
      return callBusinessApi<JsonRecord>(
        options.runner,
        options.env,
        snapshot.secretName,
        snapshot.botProfile.phoneNumber,
        "messages",
        body,
      );
    }

    // wacli mode
    const args = ["send", "--to", input.to, "--text", input.text];
    if (input.quotedMessageId) {
      args.push("--quote", input.quotedMessageId);
    }
    return callWacli(options.runner, options.env, args);
  }

  async function disconnect(): Promise<WhatsAppStatusResult> {
    let snapshot = readState(options.workspaceDir, filesystem);
    snapshot = {
      ...snapshot,
      connected: false,
      transport: {
        mode: "disabled",
        active: false,
      },
    };
    const persisted = await persist(snapshot);
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  return {
    channel() {
      return buildChannel(readState(options.workspaceDir, filesystem));
    },
    status,
    connect,
    sendMessage,
    disconnect,
  };
}
