import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  ConversationSearchField,
  ConversationSearchResult,
  Message,
  SessionRecord,
  SessionSummary,
} from "@clawjs/core";

import { NodeFileSystemHost } from "../host/filesystem.ts";
import {
  DEFAULT_SESSION_TITLE,
  normalizeTranscriptEvents,
  resolveSessionTitle,
  SESSION_FILE_EXTENSION,
  summarizePreview,
  summarizeTitle,
} from "./transcript.ts";
import { resolveFileLockPath } from "../host/filesystem.ts";

export interface ConversationStoreOptions {
  filesystem?: NodeFileSystemHost;
}

export interface AppendMessageInput extends Omit<Message, "id" | "createdAt"> {
  id?: string;
  createdAt?: number;
}

export interface ConversationStoreSearchOptions {
  limit?: number;
  includeMessages?: boolean;
}

export function resolveConversationsDir(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "conversations");
}

export function resolveConversationPath(workspaceDir: string, sessionId: string): string {
  return path.join(resolveConversationsDir(workspaceDir), `${sessionId}${SESSION_FILE_EXTENSION}`);
}

export function resolveConversationLockPath(workspaceDir: string, sessionId: string): string {
  return resolveFileLockPath(resolveConversationPath(workspaceDir, sessionId));
}

function sessionHeaderLine(sessionId: string, createdAt: number, title?: string): string {
  const event: Record<string, unknown> = {
    type: "session",
    id: sessionId,
    timestamp: new Date(createdAt).toISOString(),
  };
  if (typeof title === "string" && title.trim()) {
    event.title = summarizeTitle(title);
  }
  return `${JSON.stringify(event)}\n`;
}

function readTranscriptRaw(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function splitTranscript(raw: string): string[] {
  return raw.split("\n").map((line) => line.trim()).filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase();
}

function truncateSnippet(value: string, maxLength = 180): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3).trim()}...`;
}

function buildSearchResult(
  session: SessionRecord,
  snippet: string,
  score: number,
  matchedFields: ConversationSearchField[],
): ConversationSearchResult {
  return {
    sessionId: session.sessionId,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    preview: session.preview,
    snippet: truncateSnippet(snippet),
    score,
    strategy: "local",
    matchedFields,
  };
}

function scoreMatch(haystack: string, query: string, base: number): number {
  if (!haystack || !query) return 0;
  const occurrences = haystack.split(query).length - 1;
  if (occurrences <= 0) return 0;
  return base + occurrences * 10;
}

function readSessionHeader(raw: string): { sessionId: string; createdAt: number; title?: string } | null {
  for (const line of splitTranscript(raw)) {
    try {
      const event = JSON.parse(line) as { type?: string; id?: string; timestamp?: string; title?: string };
      if (event.type !== "session" || !event.id) continue;
      const parsed = event.timestamp ? Date.parse(event.timestamp) : NaN;
      return {
        sessionId: event.id,
        createdAt: Number.isNaN(parsed) ? Date.now() : parsed,
        ...(typeof event.title === "string" ? { title: event.title } : {}),
      };
    } catch {
      continue;
    }
  }
  return null;
}

export class ConversationStore {
  private readonly filesystem: NodeFileSystemHost;
  private readonly workspaceDir: string;

  constructor(workspaceDir: string, options: ConversationStoreOptions = {}) {
    this.workspaceDir = workspaceDir;
    this.filesystem = options.filesystem ?? new NodeFileSystemHost();
  }

  private ensureConversationsDir(): string {
    const dir = resolveConversationsDir(this.workspaceDir);
    this.filesystem.ensureDir(dir);
    return dir;
  }

  private readTranscript(sessionId: string): string {
    return readTranscriptRaw(resolveConversationPath(this.workspaceDir, sessionId));
  }

  createSession(title?: string): SessionRecord {
    const now = Date.now();
    const sessionId = `clawjs-${randomUUID()}`;
    const record: SessionRecord = {
      sessionId,
      title: summarizeTitle(title || DEFAULT_SESSION_TITLE),
      createdAt: now,
      updatedAt: now,
      messages: [],
      messageCount: 0,
      preview: "",
    };

    this.ensureConversationsDir();
    const filePath = resolveConversationPath(this.workspaceDir, sessionId);
    this.filesystem.withLockRetry(resolveConversationLockPath(this.workspaceDir, sessionId), () => {
      this.filesystem.writeTextAtomic(filePath, sessionHeaderLine(sessionId, now, title));
    });
    return record;
  }

  appendMessage(sessionId: string, message: AppendMessageInput): SessionRecord {
    const filePath = resolveConversationPath(this.workspaceDir, sessionId);
    this.ensureConversationsDir();

    const createdAt = message.createdAt ?? Date.now();
    const event = {
      type: "message",
      id: message.id || randomUUID(),
      timestamp: new Date(createdAt).toISOString(),
      message: {
        role: message.role,
        content: [{ type: "text", text: message.content }],
      },
      ...(Array.isArray(message.attachments) && message.attachments.length > 0 ? { attachments: message.attachments } : {}),
      ...(Array.isArray(message.contextChips) && message.contextChips.length > 0 ? { contextChips: message.contextChips } : {}),
    };

    this.filesystem.withLockRetry(resolveConversationLockPath(this.workspaceDir, sessionId), () => {
      if (!fs.existsSync(filePath)) {
        this.filesystem.writeTextAtomic(filePath, sessionHeaderLine(sessionId, createdAt, message.role === "user" ? message.content : undefined));
      }
      this.filesystem.appendText(filePath, `${JSON.stringify(event)}\n`);
    });
    return this.getSession(sessionId) || {
      sessionId,
      title: summarizeTitle(message.content),
      createdAt,
      updatedAt: createdAt,
      messageCount: 1,
      preview: summarizePreview({
        id: event.id,
        role: message.role,
        content: message.content,
        createdAt,
        ...(message.attachments ? { attachments: message.attachments } : {}),
        ...(message.contextChips ? { contextChips: message.contextChips } : {}),
      }),
      messages: [{
        id: event.id,
        role: message.role,
        content: message.content,
        createdAt,
        ...(message.attachments ? { attachments: message.attachments } : {}),
        ...(message.contextChips ? { contextChips: message.contextChips } : {}),
      }],
    };
  }

  updateSessionTitle(sessionId: string, title: string): boolean {
    const filePath = resolveConversationPath(this.workspaceDir, sessionId);
    if (!fs.existsSync(filePath)) return false;
    return this.filesystem.withLockRetry(resolveConversationLockPath(this.workspaceDir, sessionId), () => {
      const raw = this.readTranscript(sessionId);
      const lines = splitTranscript(raw);
      let replaced = false;

      for (let index = 0; index < lines.length; index += 1) {
        try {
          const event = JSON.parse(lines[index]) as { type?: string; id?: string; timestamp?: string; title?: string };
          if (event.type !== "session") continue;
          event.title = summarizeTitle(title);
          lines[index] = JSON.stringify(event);
          replaced = true;
          break;
        } catch {
          continue;
        }
      }

      if (!replaced) {
        const now = Date.now();
        const header = sessionHeaderLine(sessionId, now, title).trimEnd();
        lines.unshift(header);
      }

      this.filesystem.writeTextAtomic(filePath, `${lines.join("\n")}\n`);
      return true;
    });
  }

  getSession(sessionId: string): SessionRecord | null {
    const raw = this.readTranscript(sessionId);
    if (!raw.trim()) return null;

    const header = readSessionHeader(raw);
    const messages = normalizeTranscriptEvents(raw);
    if (messages.length === 0 && !header) return null;

    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const createdAt = header?.createdAt ?? firstMessage?.createdAt ?? Date.now();
    const updatedAt = lastMessage?.createdAt ?? createdAt;
    const title = resolveSessionTitle({
      title: header?.title,
      messages,
    });

    return {
      sessionId: header?.sessionId || sessionId,
      title,
      createdAt,
      updatedAt,
      messageCount: messages.length,
      preview: summarizePreview(lastMessage),
      messages,
    };
  }

  listSessions(): SessionSummary[] {
    this.ensureConversationsDir();
    const entries = fs.readdirSync(resolveConversationsDir(this.workspaceDir));

    const sessions = entries
      .filter((entry) => entry.endsWith(SESSION_FILE_EXTENSION))
      .map((entry) => entry.slice(0, -SESSION_FILE_EXTENSION.length))
      .map((sessionId) => this.getSession(sessionId))
      .filter(Boolean) as SessionRecord[];

    return sessions
      .sort((a, b) => (
        b.updatedAt - a.updatedAt
        || b.createdAt - a.createdAt
        || b.sessionId.localeCompare(a.sessionId)
      ))
      .map((session) => ({
        sessionId: session.sessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        preview: session.preview,
      }));
  }

  searchSessions(query: string, options: ConversationStoreSearchOptions = {}): ConversationSearchResult[] {
    const normalizedQuery = normalizeSearchText(query.trim());
    if (!normalizedQuery) return [];

    const includeMessages = options.includeMessages !== false;
    const limit = Math.max(1, options.limit ?? 20);

    const results = this.listSessions()
      .map((summary) => this.getSession(summary.sessionId))
      .filter(Boolean)
      .map((session) => {
        const record = session as SessionRecord;
        const matchedFields: ConversationSearchField[] = [];
        let score = 0;
        let snippet = "";

        const normalizedTitle = normalizeSearchText(record.title);
        const normalizedPreview = normalizeSearchText(record.preview);

        const titleScore = scoreMatch(normalizedTitle, normalizedQuery, 400);
        if (titleScore > 0) {
          matchedFields.push("title");
          score += titleScore;
          snippet ||= record.title;
        }

        const previewScore = scoreMatch(normalizedPreview, normalizedQuery, 180);
        if (previewScore > 0) {
          matchedFields.push("preview");
          score += previewScore;
          snippet ||= record.preview;
        }

        if (includeMessages) {
          for (const message of record.messages) {
            const normalizedMessage = normalizeSearchText(message.content);
            const messageScore = scoreMatch(normalizedMessage, normalizedQuery, 120);
            if (messageScore <= 0) continue;
            if (!matchedFields.includes("message")) {
              matchedFields.push("message");
            }
            score += messageScore;
            snippet ||= message.content;
          }
        }

        if (score <= 0) return null;
        return buildSearchResult(record, snippet || record.preview || record.title, score, matchedFields);
      })
      .filter(Boolean) as ConversationSearchResult[];

    return results
      .sort((left, right) => (
        right.score - left.score
        || right.updatedAt - left.updatedAt
        || right.createdAt - left.createdAt
        || right.sessionId.localeCompare(left.sessionId)
      ))
      .slice(0, limit);
  }
}
