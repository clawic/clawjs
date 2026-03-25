import { maskCredential, type ChannelDescriptor, type TelegramBotProfile, type TelegramChatSummary, type TelegramCommand, type TelegramMemberSummary, type TelegramStateSnapshot, type TelegramTransportStatus, type TelegramUpdateEnvelope, type TelegramWebhookStatus } from "@clawjs/core";

import type { WorkspaceDataStore } from "../data/store.ts";
import type { CommandRunner } from "../runtime/contracts.ts";
import type { ConversationStore } from "../conversations/store.ts";
import { DEFAULT_SECRETS_PROXY_PATH } from "../secrets/index.ts";
import { readTelegramStateSnapshot, writeTelegramStateSnapshot } from "../state/store.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";

const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";
const TELEGRAM_SESSION_MAP_DOCUMENT = "telegram-session-map";
const TELEGRAM_UPDATES_COLLECTION = "telegram-updates";

type JsonRecord = Record<string, unknown>;

export interface TelegramConnectBotInput {
  secretName: string;
  apiBaseUrl?: string;
  webhookUrl?: string;
  webhookSecretToken?: string;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
}

export interface TelegramWebhookConfigInput {
  url: string;
  secretToken?: string;
  allowedUpdates?: string[];
  dropPendingUpdates?: boolean;
  maxConnections?: number;
  ipAddress?: string;
}

export interface TelegramSendMessageInput {
  chatId: string | number;
  text: string;
  parseMode?: "MarkdownV2" | "HTML";
  replyToMessageId?: number;
  messageThreadId?: number;
}

export interface TelegramSendMediaInput {
  type: "photo" | "video" | "document" | "audio" | "animation";
  chatId: string | number;
  media: string;
  caption?: string;
  parseMode?: "MarkdownV2" | "HTML";
  replyToMessageId?: number;
  messageThreadId?: number;
}

export interface TelegramBanOrRestrictInput {
  action: "ban" | "unban" | "restrict";
  chatId: string | number;
  userId: string | number;
  permissions?: Record<string, boolean>;
  untilDate?: number;
  revokeMessages?: boolean;
}

export interface TelegramInviteLinkOptions {
  name?: string;
  expireDate?: number;
  memberLimit?: number;
  createsJoinRequest?: boolean;
}

export interface TelegramSyncUpdatesOptions {
  limit?: number;
  timeoutSeconds?: number;
  allowedUpdates?: string[];
}

export interface TelegramStatusResult extends TelegramStateSnapshot {
  channel: ChannelDescriptor;
}

export interface TelegramService {
  channel(): ChannelDescriptor;
  status(): Promise<TelegramStatusResult>;
  connectBot(input: TelegramConnectBotInput): Promise<TelegramStatusResult>;
  configureWebhook(input: TelegramWebhookConfigInput): Promise<TelegramStatusResult>;
  disableWebhook(options?: { dropPendingUpdates?: boolean }): Promise<TelegramStatusResult>;
  startPolling(options?: TelegramSyncUpdatesOptions & { dropPendingUpdates?: boolean }): Promise<TelegramStatusResult>;
  stopPolling(): Promise<TelegramStatusResult>;
  setCommands(commands: TelegramCommand[]): Promise<TelegramCommand[]>;
  getCommands(): Promise<TelegramCommand[]>;
  sendMessage(input: TelegramSendMessageInput): Promise<JsonRecord>;
  sendMedia(input: TelegramSendMediaInput): Promise<JsonRecord>;
  listChats(query?: string): Promise<TelegramChatSummary[]>;
  getChat(chatId: string | number): Promise<TelegramChatSummary>;
  getChatAdministrators(chatId: string | number): Promise<TelegramMemberSummary[]>;
  getChatMember(chatId: string | number, userId: string | number): Promise<TelegramMemberSummary>;
  setChatPermissions(chatId: string | number, permissions: Record<string, boolean>): Promise<boolean>;
  banOrRestrictMember(input: TelegramBanOrRestrictInput): Promise<boolean>;
  createInviteLink(chatId: string | number, options?: TelegramInviteLinkOptions): Promise<JsonRecord>;
  revokeInviteLink(chatId: string | number, inviteLink: string): Promise<JsonRecord>;
  syncUpdates(options?: TelegramSyncUpdatesOptions): Promise<TelegramUpdateEnvelope[]>;
  ingestUpdate(update: JsonRecord): Promise<TelegramUpdateEnvelope | null>;
}

export interface CreateTelegramServiceOptions {
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

function readState(workspaceDir: string, filesystem: NodeFileSystemHost): TelegramStateSnapshot {
  return readTelegramStateSnapshot(workspaceDir, filesystem) ?? {
    schemaVersion: 1,
    updatedAt: nowIso(),
    connected: false,
    transport: {
      mode: "disabled",
      active: false,
      webhook: null,
    },
    commands: [],
    recentErrors: [],
    knownChats: [],
  };
}

function writeState(
  workspaceDir: string,
  filesystem: NodeFileSystemHost,
  next: TelegramStateSnapshot,
): TelegramStateSnapshot {
  return writeTelegramStateSnapshot(workspaceDir, {
    ...next,
    schemaVersion: 1,
    updatedAt: nowIso(),
  }, filesystem);
}

function normalizeApiBaseUrl(apiBaseUrl?: string): string {
  return (apiBaseUrl?.trim() || DEFAULT_TELEGRAM_API_BASE_URL).replace(/\/+$/, "");
}

function validateSecretName(secretName: string): string {
  const trimmed = secretName.trim();
  if (!trimmed) {
    throw new Error("telegram secretName is required");
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`telegram secretName contains unsupported characters: ${secretName}`);
  }
  return trimmed;
}

function validateWebhookSecretToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(trimmed)) {
    throw new Error("telegram webhook secret token must match Telegram allowed characters");
  }
  return trimmed;
}

function maskSecretReference(secretName: string): string {
  return `vault:${maskCredential(secretName) ?? "configured"}`;
}

function resolveSecretsProxyPath(env?: NodeJS.ProcessEnv): string {
  return env?.CLAWJS_SECRETS_PROXY_PATH?.trim() || process.env.CLAWJS_SECRETS_PROXY_PATH?.trim() || DEFAULT_SECRETS_PROXY_PATH;
}

function buildRunnerEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

async function callTelegramApi<TResult>(
  runner: CommandRunner,
  env: NodeJS.ProcessEnv | undefined,
  secretName: string,
  apiBaseUrl: string,
  method: string,
  params: JsonRecord = {},
  timeoutMs = 15_000,
): Promise<TResult> {
  const proxyPath = resolveSecretsProxyPath(env);
  const url = `${normalizeApiBaseUrl(apiBaseUrl)}/bot{{${secretName}}}/${method}`;
  const body = JSON.stringify(params);
  const args = [
    "request",
    "--method",
    "POST",
    "--url",
    url,
    "--header",
    "Content-Type: application/json",
    "--body",
    body,
    "--timeout",
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
  ];
  const result = await runner.exec(proxyPath, args, {
    env: buildRunnerEnv(env),
    timeoutMs: timeoutMs + 1_000,
  });
  const payload = JSON.parse(result.stdout || "null") as { ok?: boolean; result?: TResult; description?: string; error_code?: number };
  if (!payload || payload.ok !== true) {
    throw new Error(`Telegram ${method} failed${payload?.description ? `: ${payload.description}` : ""}`);
  }
  return payload.result as TResult;
}

function asStringId(value: string | number | bigint): string {
  return String(value);
}

function normalizeBotProfile(raw: JsonRecord): TelegramBotProfile {
  return {
    id: asStringId(raw.id as string | number),
    isBot: !!raw.is_bot,
    username: typeof raw.username === "string" ? raw.username : undefined,
    firstName: String(raw.first_name ?? ""),
    canJoinGroups: typeof raw.can_join_groups === "boolean" ? raw.can_join_groups : undefined,
    canReadAllGroupMessages: typeof raw.can_read_all_group_messages === "boolean" ? raw.can_read_all_group_messages : undefined,
    supportsInlineQueries: typeof raw.supports_inline_queries === "boolean" ? raw.supports_inline_queries : undefined,
  };
}

function normalizeWebhookStatus(raw: JsonRecord | null | undefined, configuredSecretToken?: string): TelegramWebhookStatus | null {
  if (!raw) return null;
  return {
    url: typeof raw.url === "string" ? raw.url : undefined,
    hasCustomCertificate: typeof raw.has_custom_certificate === "boolean" ? raw.has_custom_certificate : undefined,
    pendingUpdateCount: typeof raw.pending_update_count === "number" ? raw.pending_update_count : undefined,
    ipAddress: typeof raw.ip_address === "string" ? raw.ip_address : undefined,
    lastErrorDate: typeof raw.last_error_date === "number" ? raw.last_error_date : undefined,
    lastErrorMessage: typeof raw.last_error_message === "string" ? raw.last_error_message : undefined,
    lastSynchronizationErrorDate: typeof raw.last_synchronization_error_date === "number" ? raw.last_synchronization_error_date : undefined,
    maxConnections: typeof raw.max_connections === "number" ? raw.max_connections : undefined,
    allowedUpdates: Array.isArray(raw.allowed_updates) ? raw.allowed_updates.map(String) : undefined,
    secretTokenConfigured: configuredSecretToken ? true : undefined,
  };
}

function normalizeChatSummary(raw: JsonRecord): TelegramChatSummary {
  return {
    id: asStringId(raw.id as string | number),
    type: String(raw.type ?? "private") as TelegramChatSummary["type"],
    title: typeof raw.title === "string" ? raw.title : undefined,
    username: typeof raw.username === "string" ? raw.username : undefined,
    firstName: typeof raw.first_name === "string" ? raw.first_name : undefined,
    lastName: typeof raw.last_name === "string" ? raw.last_name : undefined,
    isForum: typeof raw.is_forum === "boolean" ? raw.is_forum : undefined,
    inviteLink: typeof raw.invite_link === "string" ? raw.invite_link : undefined,
    lastSeenAt: nowIso(),
  };
}

function normalizeMemberSummary(raw: JsonRecord): TelegramMemberSummary {
  const user = (raw.user as JsonRecord | undefined) ?? {};
  const permissions = Object.fromEntries(
    Object.entries(raw).filter(([key, value]) => key.startsWith("can_") && typeof value === "boolean"),
  ) as Record<string, boolean>;
  return {
    userId: asStringId(user.id as string | number),
    status: String(raw.status ?? "member") as TelegramMemberSummary["status"],
    username: typeof user.username === "string" ? user.username : undefined,
    firstName: typeof user.first_name === "string" ? user.first_name : undefined,
    lastName: typeof user.last_name === "string" ? user.last_name : undefined,
    isBot: typeof user.is_bot === "boolean" ? user.is_bot : undefined,
    canBeEdited: typeof raw.can_be_edited === "boolean" ? raw.can_be_edited : undefined,
    permissions: Object.keys(permissions).length > 0 ? permissions : undefined,
  };
}

function normalizeCommands(raw: unknown): TelegramCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => ({
      command: typeof (entry as JsonRecord).command === "string" ? (entry as JsonRecord).command as string : "",
      description: typeof (entry as JsonRecord).description === "string" ? (entry as JsonRecord).description as string : "",
    }))
    .filter((entry) => entry.command && entry.description);
}

function buildChannel(snapshot: TelegramStateSnapshot): ChannelDescriptor {
  const lastError = snapshot.recentErrors[0] ?? snapshot.transport.webhook?.lastErrorMessage ?? null;
  const status: ChannelDescriptor["status"] = !snapshot.secretName
    ? "disconnected"
    : !snapshot.connected
      ? "configured"
      : lastError
        ? "degraded"
        : snapshot.transport.active
          ? "connected"
          : "configured";
  return {
    id: "telegram",
    label: snapshot.botProfile?.username ? `Telegram (@${snapshot.botProfile.username})` : "Telegram",
    kind: "chat",
    status,
    provider: "telegram",
    endpoint: snapshot.transport.webhook?.url,
    lastSyncAt: snapshot.transport.lastSyncAt,
    lastError,
    metadata: {
      botId: snapshot.botProfile?.id,
      botUsername: snapshot.botProfile?.username,
      mode: snapshot.transport.mode,
      pendingUpdateCount: snapshot.transport.pendingUpdateCount ?? snapshot.transport.webhook?.pendingUpdateCount,
      knownChats: snapshot.knownChats.length,
    },
  };
}

function dedupeChats(chats: TelegramChatSummary[]): TelegramChatSummary[] {
  const byId = new Map<string, TelegramChatSummary>();
  for (const chat of chats) {
    byId.set(chat.id, chat);
  }
  return Array.from(byId.values()).sort((left, right) => right.id.localeCompare(left.id));
}

function appendRecentError(snapshot: TelegramStateSnapshot, message: string): TelegramStateSnapshot {
  return {
    ...snapshot,
    connected: snapshot.connected,
    recentErrors: [message, ...snapshot.recentErrors.filter((entry) => entry !== message)].slice(0, 10),
  };
}

function updateTransport(snapshot: TelegramStateSnapshot, transport: TelegramTransportStatus): TelegramStateSnapshot {
  return {
    ...snapshot,
    transport,
  };
}

function updateKnownChats(snapshot: TelegramStateSnapshot, chats: TelegramChatSummary[]): TelegramStateSnapshot {
  return {
    ...snapshot,
    knownChats: dedupeChats([...chats, ...snapshot.knownChats]),
  };
}

function detectUpdateType(update: JsonRecord): TelegramUpdateEnvelope["type"] {
  if (update.message) return "message";
  if (update.edited_message) return "edited_message";
  if (update.callback_query) return "callback_query";
  if (update.my_chat_member) return "my_chat_member";
  if (update.chat_member) return "chat_member";
  return "unknown";
}

function extractUpdateChat(update: JsonRecord): { chat?: TelegramChatSummary; messageId?: number } {
  const sources = [
    update.message as JsonRecord | undefined,
    update.edited_message as JsonRecord | undefined,
    (update.callback_query as JsonRecord | undefined)?.message as JsonRecord | undefined,
    (update.my_chat_member as JsonRecord | undefined)?.chat as JsonRecord | undefined,
    (update.chat_member as JsonRecord | undefined)?.chat as JsonRecord | undefined,
  ].filter(Boolean);
  for (const source of sources) {
    const chat = (source?.chat as JsonRecord | undefined) ?? source;
    if (chat?.id !== undefined && chat?.type !== undefined) {
      return {
        chat: normalizeChatSummary(chat),
        messageId: typeof source?.message_id === "number" ? source.message_id : undefined,
      };
    }
  }
  return {};
}

function extractUserText(update: JsonRecord): string | null {
  const message = update.message as JsonRecord | undefined;
  if (typeof message?.text === "string" && message.text.trim()) return message.text;
  if (typeof message?.caption === "string" && message.caption.trim()) return message.caption;
  const callback = update.callback_query as JsonRecord | undefined;
  if (typeof callback?.data === "string" && callback.data.trim()) return `callback:${callback.data}`;
  return null;
}

function readSessionMap(dataStore: WorkspaceDataStore): Record<string, string> {
  return dataStore.document<Record<string, string>>(TELEGRAM_SESSION_MAP_DOCUMENT).read() ?? {};
}

function writeSessionMap(dataStore: WorkspaceDataStore, value: Record<string, string>): void {
  dataStore.document<Record<string, string>>(TELEGRAM_SESSION_MAP_DOCUMENT).write(value);
}

function rememberUpdate(dataStore: WorkspaceDataStore, envelope: TelegramUpdateEnvelope): void {
  dataStore.collection<TelegramUpdateEnvelope>(TELEGRAM_UPDATES_COLLECTION).put(String(envelope.updateId), {
    ...envelope,
    raw: undefined,
  });
}

function recordMessageInConversation(
  dataStore: WorkspaceDataStore,
  conversationStore: ConversationStore,
  envelope: TelegramUpdateEnvelope,
  chat: TelegramChatSummary | undefined,
  content: string | null,
): void {
  if (!chat || !content) return;
  const sessionMap = readSessionMap(dataStore);
  let sessionId = sessionMap[chat.id];
  if (!sessionId) {
    const title = chat.title ?? chat.username ?? chat.firstName ?? `Telegram ${chat.id}`;
    const session = conversationStore.createSession(title);
    sessionId = session.sessionId;
    sessionMap[chat.id] = sessionId;
    writeSessionMap(dataStore, sessionMap);
  }
  conversationStore.appendMessage(sessionId, {
    role: "user",
    content,
    contextChips: [{
      type: "telegram_chat",
      id: chat.id,
      label: chat.title ?? chat.username ?? chat.firstName ?? chat.id,
    }],
  });
}

export function createTelegramService(options: CreateTelegramServiceOptions): TelegramService {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();

  async function persist(snapshot: TelegramStateSnapshot): Promise<TelegramStateSnapshot> {
    return writeState(options.workspaceDir, filesystem, snapshot);
  }

  async function refreshWebhook(snapshot: TelegramStateSnapshot): Promise<TelegramStateSnapshot> {
    if (!snapshot.secretName) return snapshot;
    try {
      const webhookInfo = await callTelegramApi<JsonRecord>(
        options.runner,
        options.env,
        snapshot.secretName,
        snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
        "getWebhookInfo",
      );
      return {
        ...snapshot,
        transport: {
          ...snapshot.transport,
          webhook: normalizeWebhookStatus(webhookInfo),
          pendingUpdateCount: typeof webhookInfo.pending_update_count === "number"
            ? webhookInfo.pending_update_count
            : snapshot.transport.pendingUpdateCount,
          lastSyncAt: nowIso(),
        },
      };
    } catch (error) {
      return appendRecentError(snapshot, error instanceof Error ? error.message : "telegram status refresh failed");
    }
  }

  async function status(): Promise<TelegramStatusResult> {
    const snapshot = await persist(await refreshWebhook(readState(options.workspaceDir, filesystem)));
    return {
      ...snapshot,
      channel: buildChannel(snapshot),
    };
  }

  async function requireConnectedState(): Promise<TelegramStateSnapshot> {
    const snapshot = readState(options.workspaceDir, filesystem);
    if (!snapshot.secretName) {
      throw new Error("telegram bot is not connected");
    }
    return snapshot;
  }

  async function connectBot(input: TelegramConnectBotInput): Promise<TelegramStatusResult> {
    const secretName = validateSecretName(input.secretName);
    const apiBaseUrl = normalizeApiBaseUrl(input.apiBaseUrl);
    const webhookSecretToken = validateWebhookSecretToken(input.webhookSecretToken);
    const profile = normalizeBotProfile(await callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      secretName,
      apiBaseUrl,
      "getMe",
    ));
    let snapshot: TelegramStateSnapshot = {
      ...readState(options.workspaceDir, filesystem),
      connected: true,
      apiBaseUrl,
      secretName,
      maskedCredential: maskSecretReference(secretName),
      botProfile: profile,
      transport: {
        mode: input.webhookUrl ? "webhook" : "polling",
        active: true,
        webhook: null,
      },
      recentErrors: [],
    };
    if (input.webhookUrl) {
      await callTelegramApi<boolean>(
        options.runner,
        options.env,
        secretName,
        apiBaseUrl,
        "setWebhook",
        {
          url: input.webhookUrl,
          ...(webhookSecretToken ? { secret_token: webhookSecretToken } : {}),
          ...(input.allowedUpdates ? { allowed_updates: input.allowedUpdates } : {}),
          ...(typeof input.dropPendingUpdates === "boolean" ? { drop_pending_updates: input.dropPendingUpdates } : {}),
        },
      );
      const webhook = normalizeWebhookStatus(await callTelegramApi<JsonRecord>(
        options.runner,
        options.env,
        secretName,
        apiBaseUrl,
        "getWebhookInfo",
      ), webhookSecretToken);
      snapshot = updateTransport(snapshot, {
        mode: "webhook",
        active: true,
        webhook,
        pendingUpdateCount: webhook?.pendingUpdateCount,
        lastSyncAt: nowIso(),
      });
    } else {
      snapshot = updateTransport(snapshot, {
        mode: "polling",
        active: true,
        webhook: null,
        lastSyncAt: nowIso(),
      });
    }
    const persisted = await persist(snapshot);
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function configureWebhook(input: TelegramWebhookConfigInput): Promise<TelegramStatusResult> {
    const snapshot = await requireConnectedState();
    const secretToken = validateWebhookSecretToken(input.secretToken);
    await callTelegramApi<boolean>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "setWebhook",
      {
        url: input.url,
        ...(secretToken ? { secret_token: secretToken } : {}),
        ...(input.allowedUpdates ? { allowed_updates: input.allowedUpdates } : {}),
        ...(typeof input.dropPendingUpdates === "boolean" ? { drop_pending_updates: input.dropPendingUpdates } : {}),
        ...(typeof input.maxConnections === "number" ? { max_connections: input.maxConnections } : {}),
        ...(input.ipAddress ? { ip_address: input.ipAddress } : {}),
      },
    );
    const webhook = normalizeWebhookStatus(await callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "getWebhookInfo",
    ), secretToken);
    const persisted = await persist(updateTransport(snapshot, {
      mode: "webhook",
      active: true,
      webhook,
      pendingUpdateCount: webhook?.pendingUpdateCount,
      lastSyncAt: nowIso(),
    }));
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function disableWebhook(config: { dropPendingUpdates?: boolean } = {}): Promise<TelegramStatusResult> {
    const snapshot = await requireConnectedState();
    await callTelegramApi<boolean>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "deleteWebhook",
      typeof config.dropPendingUpdates === "boolean" ? { drop_pending_updates: config.dropPendingUpdates } : {},
    );
    const persisted = await persist(updateTransport(snapshot, {
      mode: snapshot.transport.mode === "polling" ? "polling" : "disabled",
      active: snapshot.transport.mode === "polling" ? snapshot.transport.active : false,
      webhook: null,
      lastSyncAt: nowIso(),
      lastUpdateId: snapshot.transport.lastUpdateId,
      pendingUpdateCount: 0,
    }));
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function ingestUpdate(update: JsonRecord): Promise<TelegramUpdateEnvelope | null> {
    const snapshot = readState(options.workspaceDir, filesystem);
    const updateId = typeof update.update_id === "number" ? update.update_id : null;
    if (updateId === null) {
      throw new Error("telegram update_id is required");
    }
    if (typeof snapshot.transport.lastUpdateId === "number" && updateId <= snapshot.transport.lastUpdateId) {
      return null;
    }
    const type = detectUpdateType(update);
    const { chat, messageId } = extractUpdateChat(update);
    const envelope: TelegramUpdateEnvelope = {
      updateId,
      type,
      chatId: chat?.id,
      messageId,
      chatType: chat?.type,
      receivedAt: nowIso(),
      raw: update,
    };
    rememberUpdate(options.dataStore, envelope);
    recordMessageInConversation(options.dataStore, options.conversationStore, envelope, chat, extractUserText(update));
    const persisted = await persist(updateKnownChats(updateTransport(snapshot, {
      ...snapshot.transport,
      active: snapshot.transport.mode !== "disabled",
      lastUpdateId: updateId,
      lastSyncAt: nowIso(),
      pendingUpdateCount: 0,
    }), chat ? [chat] : []));
    return {
      ...envelope,
      ...(persisted.transport.lastSyncAt ? { receivedAt: persisted.transport.lastSyncAt } : {}),
    };
  }

  async function syncUpdates(config: TelegramSyncUpdatesOptions = {}): Promise<TelegramUpdateEnvelope[]> {
    const snapshot = await requireConnectedState();
    if (snapshot.transport.mode === "webhook" && snapshot.transport.webhook?.url) {
      return [];
    }
    const updates = await callTelegramApi<JsonRecord[]>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "getUpdates",
      {
        ...(typeof snapshot.transport.lastUpdateId === "number" ? { offset: snapshot.transport.lastUpdateId + 1 } : {}),
        ...(typeof config.limit === "number" ? { limit: config.limit } : {}),
        ...(typeof config.timeoutSeconds === "number" ? { timeout: config.timeoutSeconds } : {}),
        ...(config.allowedUpdates ? { allowed_updates: config.allowedUpdates } : {}),
      },
      Math.max(15_000, (config.timeoutSeconds ?? 0) * 1_000 + 5_000),
    );
    const envelopes: TelegramUpdateEnvelope[] = [];
    for (const update of updates) {
      const envelope = await ingestUpdate(update);
      if (envelope) envelopes.push(envelope);
    }
    return envelopes;
  }

  async function startPolling(config: TelegramSyncUpdatesOptions & { dropPendingUpdates?: boolean } = {}): Promise<TelegramStatusResult> {
    const snapshot = await requireConnectedState();
    await callTelegramApi<boolean>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "deleteWebhook",
      typeof config.dropPendingUpdates === "boolean" ? { drop_pending_updates: config.dropPendingUpdates } : {},
    );
    const next = await persist(updateTransport(snapshot, {
      mode: "polling",
      active: true,
      webhook: null,
      lastUpdateId: snapshot.transport.lastUpdateId,
      lastSyncAt: nowIso(),
      pendingUpdateCount: 0,
    }));
    await syncUpdates(config);
    const refreshed = await persist(readState(options.workspaceDir, filesystem));
    return {
      ...refreshed,
      channel: buildChannel(refreshed),
    };
  }

  async function stopPolling(): Promise<TelegramStatusResult> {
    const snapshot = await requireConnectedState();
    const persisted = await persist(updateTransport(snapshot, {
      ...snapshot.transport,
      active: false,
      mode: snapshot.transport.webhook?.url ? "webhook" : "disabled",
      lastSyncAt: nowIso(),
    }));
    return {
      ...persisted,
      channel: buildChannel(persisted),
    };
  }

  async function setCommands(commands: TelegramCommand[]): Promise<TelegramCommand[]> {
    const snapshot = await requireConnectedState();
    await callTelegramApi<boolean>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "setMyCommands",
      { commands },
    );
    const normalized = normalizeCommands(commands);
    await persist({
      ...snapshot,
      commands: normalized,
    });
    return normalized;
  }

  async function getCommands(): Promise<TelegramCommand[]> {
    const snapshot = await requireConnectedState();
    const commands = normalizeCommands(await callTelegramApi<JsonRecord[]>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "getMyCommands",
    ));
    await persist({
      ...snapshot,
      commands,
    });
    return commands;
  }

  async function sendMessage(input: TelegramSendMessageInput): Promise<JsonRecord> {
    const snapshot = await requireConnectedState();
    return callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "sendMessage",
      {
        chat_id: input.chatId,
        text: input.text,
        ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
        ...(typeof input.replyToMessageId === "number" ? { reply_parameters: { message_id: input.replyToMessageId } } : {}),
        ...(typeof input.messageThreadId === "number" ? { message_thread_id: input.messageThreadId } : {}),
      },
    );
  }

  async function sendMedia(input: TelegramSendMediaInput): Promise<JsonRecord> {
    const snapshot = await requireConnectedState();
    const method = ({
      photo: "sendPhoto",
      video: "sendVideo",
      document: "sendDocument",
      audio: "sendAudio",
      animation: "sendAnimation",
    })[input.type];
    return callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      method,
      {
        chat_id: input.chatId,
        [input.type]: input.media,
        ...(input.caption ? { caption: input.caption } : {}),
        ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
        ...(typeof input.replyToMessageId === "number" ? { reply_parameters: { message_id: input.replyToMessageId } } : {}),
        ...(typeof input.messageThreadId === "number" ? { message_thread_id: input.messageThreadId } : {}),
      },
    );
  }

  async function listChats(query?: string): Promise<TelegramChatSummary[]> {
    const snapshot = readState(options.workspaceDir, filesystem);
    const normalizedQuery = query?.trim().toLowerCase();
    if (!normalizedQuery) return snapshot.knownChats;
    return snapshot.knownChats.filter((chat) => {
      const haystack = [chat.id, chat.title, chat.username, chat.firstName, chat.lastName].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  async function getChat(chatId: string | number): Promise<TelegramChatSummary> {
    const snapshot = await requireConnectedState();
    const raw = await callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "getChat",
      { chat_id: chatId },
    );
    const chat = normalizeChatSummary(raw);
    await persist(updateKnownChats(snapshot, [chat]));
    return chat;
  }

  async function getChatAdministrators(chatId: string | number): Promise<TelegramMemberSummary[]> {
    const snapshot = await requireConnectedState();
    const raw = await callTelegramApi<JsonRecord[]>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "getChatAdministrators",
      { chat_id: chatId },
    );
    return raw.map((entry) => normalizeMemberSummary(entry));
  }

  async function getChatMember(chatId: string | number, userId: string | number): Promise<TelegramMemberSummary> {
    const snapshot = await requireConnectedState();
    const raw = await callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "getChatMember",
      { chat_id: chatId, user_id: userId },
    );
    return normalizeMemberSummary(raw);
  }

  async function setChatPermissions(chatId: string | number, permissions: Record<string, boolean>): Promise<boolean> {
    const snapshot = await requireConnectedState();
    return callTelegramApi<boolean>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "setChatPermissions",
      { chat_id: chatId, permissions },
    );
  }

  async function banOrRestrictMember(input: TelegramBanOrRestrictInput): Promise<boolean> {
    const snapshot = await requireConnectedState();
    const method = input.action === "ban"
      ? "banChatMember"
      : input.action === "unban"
        ? "unbanChatMember"
        : "restrictChatMember";
    const params: JsonRecord = {
      chat_id: input.chatId,
      user_id: input.userId,
    };
    if (input.action === "restrict") {
      params.permissions = input.permissions ?? {};
    }
    if (typeof input.untilDate === "number") {
      params.until_date = input.untilDate;
    }
    if (typeof input.revokeMessages === "boolean") {
      params.revoke_messages = input.revokeMessages;
    }
    return callTelegramApi<boolean>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      method,
      params,
    );
  }

  async function createInviteLink(chatId: string | number, config: TelegramInviteLinkOptions = {}): Promise<JsonRecord> {
    const snapshot = await requireConnectedState();
    return callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "createChatInviteLink",
      {
        chat_id: chatId,
        ...(config.name ? { name: config.name } : {}),
        ...(typeof config.expireDate === "number" ? { expire_date: config.expireDate } : {}),
        ...(typeof config.memberLimit === "number" ? { member_limit: config.memberLimit } : {}),
        ...(typeof config.createsJoinRequest === "boolean" ? { creates_join_request: config.createsJoinRequest } : {}),
      },
    );
  }

  async function revokeInviteLink(chatId: string | number, inviteLink: string): Promise<JsonRecord> {
    const snapshot = await requireConnectedState();
    return callTelegramApi<JsonRecord>(
      options.runner,
      options.env,
      snapshot.secretName!,
      snapshot.apiBaseUrl ?? DEFAULT_TELEGRAM_API_BASE_URL,
      "revokeChatInviteLink",
      { chat_id: chatId, invite_link: inviteLink },
    );
  }

  return {
    channel() {
      return buildChannel(readState(options.workspaceDir, filesystem));
    },
    status,
    connectBot,
    configureWebhook,
    disableWebhook: disableWebhook,
    startPolling,
    stopPolling,
    setCommands,
    getCommands,
    sendMessage,
    sendMedia,
    listChats,
    getChat,
    getChatAdministrators,
    getChatMember,
    setChatPermissions,
    banOrRestrictMember,
    createInviteLink,
    revokeInviteLink,
    syncUpdates,
    ingestUpdate,
  };
}
