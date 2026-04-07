import { randomUUID } from "crypto";
import type { Attachment, ContextChip, DocumentRef, Message, SessionRecord } from "@clawjs/core";

import type { TranscriptEventInput, TranscriptMessageInput } from "./types.ts";
import { resolveLegacyDocumentRefs } from "../documents/store.ts";

export const SESSION_FILE_EXTENSION = ".jsonl";
export const DEFAULT_SESSION_TITLE = "New session";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function summarizeTitle(text: string): string {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return DEFAULT_SESSION_TITLE;
  const stripped = normalized.replace(/^[\[(].*?[\])]\s*/, "").trim();
  if (!stripped) return DEFAULT_SESSION_TITLE;
  return stripped.length > 48 ? `${stripped.slice(0, 48).trim()}...` : stripped;
}

function extractLatestUserMessageFromWrappedPrompt(text: string): string {
  const matches = [...text.matchAll(/(?:^|\n)USER:\s([\s\S]*?)(?=(?:\nAttachments:|\n(?:ASSISTANT|USER):|$))/g)];
  if (matches.length === 0) return text.trim();

  const trailing = matches[matches.length - 1]?.[1] || "";
  const attachmentsMarker = "\nAttachments:";
  const attachmentsIndex = trailing.indexOf(attachmentsMarker);
  return (attachmentsIndex === -1 ? trailing : trailing.slice(0, attachmentsIndex)).trim();
}

function cleanAssistantText(text: string): string {
  return text.replace(/^\[\[reply_to_current\]\]\s*/i, "").trim();
}

function extractTextParts(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as { type?: string; text?: unknown };
      if (record.type && record.type !== "text") return "";
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean);

  return parts.join("\n\n").trim();
}

export function normalizeAttachment(input: unknown): Attachment | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const name = typeof record.name === "string" ? normalizeWhitespace(record.name) : "";
  const mimeType = typeof record.mimeType === "string" ? normalizeWhitespace(record.mimeType) : "";
  if (!name || !mimeType) return null;

  const attachment: Attachment = { name, mimeType };
  if (typeof record.data === "string" && record.data.trim()) {
    attachment.data = record.data;
  }
  if (typeof record.preview === "string" && record.preview.trim()) {
    attachment.preview = record.preview;
  }
  return attachment;
}

export function normalizeContextChip(input: unknown): ContextChip | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const type = typeof record.type === "string" ? normalizeWhitespace(record.type) : "";
  const id = typeof record.id === "string" ? normalizeWhitespace(record.id) : "";
  const label = typeof record.label === "string" ? normalizeWhitespace(record.label) : "";
  if (!type || !id || !label) return null;

  const chip: ContextChip = { type, id, label };
  if (typeof record.emoji === "string" && record.emoji.trim()) {
    chip.emoji = record.emoji;
  }
  return chip;
}

export function normalizeDocumentRef(input: unknown): DocumentRef | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const documentId = typeof record.documentId === "string" ? normalizeWhitespace(record.documentId) : "";
  const name = typeof record.name === "string" ? normalizeWhitespace(record.name) : "";
  const mimeType = typeof record.mimeType === "string" ? normalizeWhitespace(record.mimeType) : "";
  const sizeBytes = typeof record.sizeBytes === "number" && Number.isFinite(record.sizeBytes) ? record.sizeBytes : NaN;
  if (!documentId || !name || !mimeType || Number.isNaN(sizeBytes)) {
    return null;
  }

  return {
    documentId,
    name,
    mimeType,
    sizeBytes,
    ...(typeof record.sha256 === "string" && record.sha256.trim() ? { sha256: record.sha256.trim() } : {}),
  };
}

function normalizeAttachments(input: unknown): Attachment[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const attachments = input.map(normalizeAttachment).filter(Boolean) as Attachment[];
  return attachments.length > 0 ? attachments : undefined;
}

function normalizeDocuments(input: unknown): DocumentRef[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const documents = input.map(normalizeDocumentRef).filter(Boolean) as DocumentRef[];
  return documents.length > 0 ? documents : undefined;
}

function normalizeContextChips(input: unknown): ContextChip[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const chips = input.map(normalizeContextChip).filter(Boolean) as ContextChip[];
  return chips.length > 0 ? chips : undefined;
}

function resolveRole(input: unknown): Message["role"] | null {
  return input === "system" || input === "user" || input === "assistant" || input === "tool" ? input : null;
}

export function normalizeTranscriptMessage(input: TranscriptMessageInput | unknown): Message | null {
  if (!input || typeof input !== "object") return null;

  const record = input as TranscriptMessageInput & Record<string, unknown>;
  const role = resolveRole(record.role);
  if (!role) return null;

  const rawText = extractTextParts(record.content);
  const content = role === "assistant"
    ? cleanAssistantText(rawText)
    : role === "user" && /(?:^|\n)USER:\s/.test(rawText)
      ? extractLatestUserMessageFromWrappedPrompt(rawText)
      : rawText;

  const attachments = normalizeAttachments(record.attachments);
  const documents = normalizeDocuments(record.documents);
  const contextChips = normalizeContextChips(record.contextChips);

  if (!content && !attachments?.length && !documents?.length) return null;

  const message: Message = {
    id: randomUUID(),
    role,
    content: content || "(empty message)",
    createdAt: Date.now(),
    ...(attachments ? { attachments } : {}),
    ...(documents ? { documents } : {}),
    ...(contextChips ? { contextChips } : {}),
  };

  if (!documents && attachments?.length) {
    message.documents = resolveLegacyDocumentRefs(message.id, attachments);
  }

  return message;
}

export function parseTranscriptLine(line: string): TranscriptEventInput | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as TranscriptEventInput;
  } catch {
    return null;
  }
}

export function normalizeTranscriptEvents(raw: string): Message[] {
  const parsed: Message[] = [];

  for (const line of raw.split("\n")) {
    const event = parseTranscriptLine(line);
    if (!event) continue;

    const messageInput = event.message ?? {
      role: event.role,
      content: event.content,
      attachments: event.attachments,
      documents: event.documents,
      contextChips: event.contextChips,
    };

    const normalizedMessageInput: TranscriptMessageInput = {
      ...(messageInput || {}),
      ...(Array.isArray(event.attachments) ? { attachments: event.attachments } : {}),
      ...(Array.isArray(event.documents) ? { documents: event.documents } : {}),
      ...(Array.isArray(event.contextChips) ? { contextChips: event.contextChips } : {}),
    };

    const message = normalizeTranscriptMessage(normalizedMessageInput);
    if (!message) continue;

    const timestamp = event.timestamp ? Date.parse(event.timestamp) : NaN;
    message.createdAt = Number.isNaN(timestamp) ? Date.now() : timestamp;
    if (typeof event.id === "string" && event.id.trim()) {
      message.id = event.id.trim();
    }

    const last = parsed[parsed.length - 1];
    if (last && last.role === message.role && last.content === message.content) {
      continue;
    }

    parsed.push(message);
  }

  return parsed;
}

export function summarizePreview(message?: Message | null): string {
  if (!message) return "";
  const normalized = normalizeWhitespace(message.content || "");
  if (!normalized) {
    return message.role === "assistant" ? "Assistant reply" : "User message";
  }
  return normalized.length > 96 ? `${normalized.slice(0, 96).trim()}...` : normalized;
}

export function suggestConversationTitle(messages: Array<Pick<Message, "role" | "content">>): string {
  const firstUser = messages.find((message) => message.role === "user" && normalizeWhitespace(message.content))?.content;
  const firstAssistant = messages.find((message) => message.role === "assistant" && normalizeWhitespace(message.content))?.content;
  return summarizeTitle(firstUser || firstAssistant || DEFAULT_SESSION_TITLE);
}

export function resolveSessionTitle(sessionRecord: Partial<SessionRecord> & { messages?: Message[] }): string {
  if (typeof sessionRecord.title === "string" && sessionRecord.title.trim()) {
    return summarizeTitle(sessionRecord.title);
  }

  return suggestConversationTitle(sessionRecord.messages ?? []);
}
