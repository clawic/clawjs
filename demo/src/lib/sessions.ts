import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { ConversationStore, resolveConversationsDir } from "@clawjs/node";

import { resolveClawJSSessionsDir, resolveClawJSWorkspaceDir } from "./openclaw-agent.ts";

export interface SessionAttachment {
  name: string;
  mimeType: string;
  data?: string;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  attachments?: SessionAttachment[];
  contextChips?: Array<{ type: string; id: string; label: string; emoji?: string }>;
}

export interface SessionRecord {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: SessionMessage[];
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

interface OpenClawTranscriptEvent {
  type?: string;
  id?: string;
  timestamp?: string;
  title?: string;
  message?: {
    role?: string;
    content?: Array<{ type?: string; text?: string }>;
  };
  attachments?: Array<{ name: string; mimeType: string; data?: string }>;
  contextChips?: Array<{ type: string; id: string; label: string; emoji?: string }>;
}

const CLAWJS_SESSION_PREFIX = "clawjs-";
const LEGACY_SESSION_PREFIX = "clawjs-legacy-";

function summarizeTitle(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "New chat";
  const stripped = normalized.replace(/^[\[(].*?[\])]\s*/, "").trim();
  if (!stripped) return "New chat";
  return stripped.length > 48 ? `${stripped.slice(0, 48).trim()}...` : stripped;
}

function extractTextParts(content: Array<{ type?: string; text?: string }> | undefined): string {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text || "")
    .join("\n\n")
    .trim();
}

function cleanAssistantText(text: string): string {
  return text.replace(/^\[\[reply_to_current\]\]\s*/i, "").trim();
}

export function extractLatestUserMessageFromWrappedPrompt(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  const matches = [...normalized.matchAll(/(?:^|\n)USER:\s([\s\S]*?)(?=(?:\nAttachments:|\n(?:ASSISTANT|USER):|$))/g)];
  if (matches.length === 0) {
    const compact = normalized.replace(/\s+/g, " ").trim();
    const fallback = compact.match(/(?:^|CONVERSATION:\s*)USER:\s(.+?)(?=(?:\s+ASSISTANT:|\s+USER:|$))/i);
    return (fallback?.[1] || text).trim();
  }

  const trailing = matches[matches.length - 1]?.[1] || "";
  const attachmentsMarker = "\nAttachments:";
  const attachmentsIndex = trailing.indexOf(attachmentsMarker);
  return (attachmentsIndex === -1 ? trailing : trailing.slice(0, attachmentsIndex)).trim();
}

function parseTranscriptMessage(event: OpenClawTranscriptEvent): SessionMessage | null {
  if (event.type !== "message" || !event.message?.role) return null;

  const timestamp = event.timestamp ? Date.parse(event.timestamp) : Date.now();
  const createdAt = Number.isNaN(timestamp) ? Date.now() : timestamp;
  const rawText = extractTextParts(event.message.content);

  if (event.message.role === "assistant") {
    const content = cleanAssistantText(rawText);
    if (!content) return null;
    return {
      id: event.id || randomUUID(),
      role: "assistant",
      content,
      createdAt,
    };
  }

  if (event.message.role === "user") {
    const content = extractLatestUserMessageFromWrappedPrompt(rawText);
    if (!content && (!event.attachments || event.attachments.length === 0)) return null;
    return {
      id: event.id || randomUUID(),
      role: "user",
      content: content || "(empty message)",
      createdAt,
      ...(Array.isArray(event.attachments) && event.attachments.length > 0
        ? { attachments: event.attachments }
        : {}),
      ...(Array.isArray(event.contextChips) && event.contextChips.length > 0
        ? { contextChips: event.contextChips }
        : {}),
    };
  }

  return null;
}

export function parseOpenClawTranscript(raw: string): SessionMessage[] {
  const parsed: SessionMessage[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const event = JSON.parse(trimmed) as OpenClawTranscriptEvent;
      const message = parseTranscriptMessage(event);
      if (!message) continue;

      const last = parsed[parsed.length - 1];
      if (last && last.role === message.role && last.content === message.content) {
        continue;
      }

      parsed.push(message);
    } catch {
      continue;
    }
  }

  return parsed;
}

function legacyTranscriptPath(sessionId: string): string {
  return path.join(resolveClawJSSessionsDir(), `${sessionId}.jsonl`);
}

function conversationsDir(): string {
  return resolveConversationsDir(resolveClawJSWorkspaceDir());
}

function conversationPath(sessionId: string): string {
  return path.join(conversationsDir(), `${sessionId}.jsonl`);
}

function ensureLegacySessionsMigrated(): void {
  const sourceDir = resolveClawJSSessionsDir();
  const targetDir = conversationsDir();
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir)) {
    if (!entry.endsWith(".jsonl")) continue;
    const targetPath = path.join(targetDir, entry);
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(path.join(sourceDir, entry), targetPath);
    }
  }
}

function ensureSessionAvailable(sessionId: string): void {
  ensureLegacySessionsMigrated();
  const targetPath = conversationPath(sessionId);
  if (fs.existsSync(targetPath)) return;
  const sourcePath = legacyTranscriptPath(sessionId);
  if (!fs.existsSync(sourcePath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function getConversationStore(): ConversationStore {
  ensureLegacySessionsMigrated();
  return new ConversationStore(resolveClawJSWorkspaceDir());
}

function normalizeRecord(record: {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Array<{
    id: string;
    role: string;
    content: string;
    createdAt: number;
    attachments?: SessionAttachment[];
    contextChips?: Array<{ type: string; id: string; label: string; emoji?: string }>;
  }>;
}): SessionRecord {
  const messages = record.messages.flatMap((message): SessionMessage[] => {
    if (message.role !== "user" && message.role !== "assistant") {
      return [];
    }
    if (message.role === "assistant") {
      return [{ ...message, role: "assistant", content: cleanAssistantText(message.content) }];
    }
    return [{ ...message, role: "user", content: extractLatestUserMessageFromWrappedPrompt(message.content) }];
  });

  return {
    sessionId: record.sessionId,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    messages,
  };
}

function normalizeSummary(summary: {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}): SessionSummary {
  return {
    sessionId: summary.sessionId,
    title: summary.title,
    createdAt: summary.createdAt,
    updatedAt: summary.updatedAt,
    messageCount: summary.messageCount,
    preview: extractLatestUserMessageFromWrappedPrompt(cleanAssistantText(summary.preview)),
  };
}

export function openClawSessionsDir(): string {
  ensureLegacySessionsMigrated();
  return conversationsDir();
}

export function listSessions(): SessionSummary[] {
  return getConversationStore().listSessions().map(normalizeSummary);
}

export function searchSessions(query: string, limit?: number): SessionSummary[] {
  const results = getConversationStore().searchSessions(query, {
    limit: limit ?? 20,
    includeMessages: true,
  });
  return results.map((r) => normalizeSummary(r));
}

export function getSession(sessionId: string): SessionRecord | null {
  ensureSessionAvailable(sessionId);
  const session = getConversationStore().getSession(sessionId);
  return session ? normalizeRecord(session) : null;
}

export function createSession(title?: string): SessionRecord {
  const session = getConversationStore().createSession(title);
  return normalizeRecord(session);
}

export function appendSessionMessage(
  sessionId: string,
  message: Omit<SessionMessage, "id" | "createdAt"> & { createdAt?: number },
): SessionRecord {
  ensureSessionAvailable(sessionId);
  const store = getConversationStore();
  const createdAt = message.createdAt ?? Date.now();
  const session = store.appendMessage(sessionId, {
    role: message.role,
    content: message.content,
    createdAt,
    ...(Array.isArray(message.attachments) ? { attachments: message.attachments } : {}),
    ...(Array.isArray(message.contextChips) ? { contextChips: message.contextChips } : {}),
  });
  return normalizeRecord(session);
}

export function sessionExists(sessionId: string): boolean {
  if (!sessionId.startsWith(CLAWJS_SESSION_PREFIX) && !sessionId.startsWith(LEGACY_SESSION_PREFIX) && !sessionId.startsWith("clawjs-")) {
    return false;
  }
  return getSession(sessionId) !== null;
}

export function updateSessionTitle(sessionId: string, newTitle: string): boolean {
  ensureSessionAvailable(sessionId);
  return getConversationStore().updateSessionTitle(sessionId, newTitle);
}
