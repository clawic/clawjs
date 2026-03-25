import type {
  Attachment,
  ContextChip,
  ConversationSearchInput,
  ConversationSearchResult,
  Message,
  SessionRecord,
  SessionSummary,
} from "@clawjs/core";

export type ConversationMessage = Message;
export type ConversationAttachment = Attachment;
export type ConversationContextChip = ContextChip;
export type ConversationSessionRecord = SessionRecord;
export type ConversationSessionSummary = SessionSummary;
export type ConversationSessionSearchInput = ConversationSearchInput;
export type ConversationSessionSearchResult = ConversationSearchResult;

export interface TranscriptMessageInput {
  role?: ConversationMessage["role"] | string;
  content?: unknown;
  attachments?: unknown;
  contextChips?: unknown;
}

export interface TranscriptEventInput {
  type?: string;
  id?: string;
  timestamp?: string;
  title?: string;
  message?: TranscriptMessageInput;
  role?: TranscriptMessageInput["role"];
  content?: unknown;
  attachments?: unknown;
  contextChips?: unknown;
}
