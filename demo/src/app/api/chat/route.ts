import { NextRequest } from "next/server";
import { ALL_CALENDARS_ID, NONE_CALENDARS_ID } from "@/lib/calendar-constants";
import { ALL_EMAIL_ACCOUNTS_ID, NONE_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";
import { getClaw } from "@/lib/claw";
import {
  buildE2EChatBootstrap,
  buildE2EChatReply,
  createE2EStreamResponse,
  ensureE2ESeeded,
  isE2EEnabled,
} from "@/lib/e2e";
import {
  ensureClawJSOpenClawAgent,
  getClawJSOpenClawStatus,
} from "@/lib/openclaw-agent";
import { getLiveData } from "@/lib/whatsapp-live";
import { getUserConfig, loadContextFileContent } from "@/lib/user-config";
import { localeMetadata } from "@/lib/i18n/messages";
import { buildProfileMemoryPrompt, syncGeneratedProfile } from "@/lib/profile-context";
import { appendSessionMessage, createSession, getSession, sessionExists } from "@/lib/sessions";

// Fallback helpers for optional local integrations.
function isNoiseChat(_name: string): boolean { return false; }
function isPriorityContact(_name: string): boolean { return false; }
function getTranscriptionMap(): Map<string, string> { return new Map(); }
type AnonymizationContext = { anonName: (n: string) => string; anonText: (t: string) => string; anonEmail: (e: string) => string; anonLocation: (l: string) => string; getReverseMap: () => Record<string, string> };
function createAnonymizationContext(_config: unknown): AnonymizationContext {
  return { anonName: (n) => n, anonText: (t) => t, anonEmail: (e) => e, anonLocation: (l) => l, getReverseMap: () => ({}) };
}
function buildContactsContext(_anonCtx?: AnonymizationContext | null): string { return ""; }
function buildHotTopicsContext(): string { return ""; }
function buildHotTopicSuggestions(): string[] { return []; }
import { listRecentCalendarEvents } from "@/lib/calendar";
import { listRecentEmailEnvelopes } from "@/lib/email";
// KB loading falls back to direct file reads when freshness metadata is unavailable.
import Database from "better-sqlite3";
import { resolvePath } from "@/lib/user-config";
import { openDb } from "@/lib/safe-db";
import { execFile } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };
const ENABLE_CHAT_PERF_LOGS = process.env.CLAWJS_DEBUG_CHAT_PERF === "1";

function logChatPerf(message: string): void {
  if (ENABLE_CHAT_PERF_LOGS) {
    console.log(message);
  }
}

interface ChatPerfPromptBreakdown {
  prepMs: number;
  emailMs: number;
  calendarMs: number;
  totalMs: number;
  promptChars: number;
}

interface ChatPerfDebugFrame {
  traceId: string;
  phase: string;
  totalMs: number;
  messageCount?: number;
  availabilityMs?: number;
  transcribeMs?: number;
  systemPromptMs?: number;
  ensureAgentMs?: number;
  getClawMs?: number;
  firstChunkMs?: number;
  streamMs?: number;
  transport?: "gateway" | "cli";
  fallback?: boolean;
  retries?: number;
  attempt?: number;
  maxAttempts?: number;
  error?: string;
  prompt?: ChatPerfPromptBreakdown;
}

interface ChatPerfTraceContext {
  enabled: boolean;
  traceId: string;
  requestStartMs: number;
  messageCount: number;
  availabilityMs: number;
  transcribeMs: number;
  systemPromptMs: number;
  prompt: ChatPerfPromptBreakdown;
}

function formatChatPerfLog(frame: ChatPerfDebugFrame): string {
  const parts = [
    `[chat][perf][${frame.traceId}]`,
    frame.phase,
    `total=${frame.totalMs}ms`,
  ];
  if (typeof frame.transport === "string") parts.push(`transport=${frame.transport}`);
  if (typeof frame.fallback === "boolean") parts.push(`fallback=${String(frame.fallback)}`);
  if (typeof frame.firstChunkMs === "number") parts.push(`firstChunk=${frame.firstChunkMs}ms`);
  if (typeof frame.streamMs === "number") parts.push(`stream=${frame.streamMs}ms`);
  if (typeof frame.availabilityMs === "number") parts.push(`availability=${frame.availabilityMs}ms`);
  if (typeof frame.transcribeMs === "number") parts.push(`transcribe=${frame.transcribeMs}ms`);
  if (typeof frame.systemPromptMs === "number") parts.push(`systemPrompt=${frame.systemPromptMs}ms`);
  if (typeof frame.ensureAgentMs === "number") parts.push(`ensureAgent=${frame.ensureAgentMs}ms`);
  if (typeof frame.getClawMs === "number") parts.push(`getClaw=${frame.getClawMs}ms`);
  if (typeof frame.retries === "number") parts.push(`retries=${frame.retries}`);
  if (typeof frame.attempt === "number") parts.push(`attempt=${frame.attempt}`);
  if (typeof frame.maxAttempts === "number") parts.push(`maxAttempts=${frame.maxAttempts}`);
  if (frame.prompt) {
    parts.push(
      `prompt(prep=${frame.prompt.prepMs}ms,email=${frame.prompt.emailMs}ms,calendar=${frame.prompt.calendarMs}ms,total=${frame.prompt.totalMs}ms,chars=${frame.prompt.promptChars})`,
    );
  }
  if (frame.error) parts.push(`error=${frame.error}`);
  return parts.join(" ");
}

function emitChatPerfFrame(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  trace: ChatPerfTraceContext,
  frame: Omit<ChatPerfDebugFrame, "traceId" | "messageCount">,
): void {
  const payload: ChatPerfDebugFrame = {
    traceId: trace.traceId,
    messageCount: trace.messageCount,
    ...frame,
  };
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ debug: payload })}\n\n`));
  logChatPerf(formatChatPerfLog(payload));
}

let _openClawAvailabilityCache: { available: boolean; ts: number } | null = null;
const OPENCLAW_AVAILABILITY_CACHE_MS = 60_000;
const CHAT_CALENDAR_BUDGET_MS = 1_200;

/** Invalidate the availability cache so the next request re-checks. */
export function invalidateOpenClawAvailabilityCache() {
  _openClawAvailabilityCache = null;
}

function getRecentWhatsAppActivitySummary(days = 14, anonCtx?: AnonymizationContext | null): string {
  const config = getUserConfig();
  const rawPath = config.dataSources.wacliDbPath;
  if (!rawPath) return "";
  const dbPath = resolvePath(rawPath);
  let db: Database.Database;
  try {
    db = openDb(dbPath, {});
  } catch {
    return "";
  }

  try {
    const cutoff = Math.floor(Date.now() / 1000) - days * 24 * 3600;
    const dailyRows = db.prepare(`
      SELECT
        date(ts, 'unixepoch', 'localtime') as d,
        count(*) as total_messages,
        count(distinct chat_name) as active_chats
      FROM messages
      WHERE ts >= ?
        AND chat_name IS NOT NULL
        AND chat_name != ''
        AND COALESCE(text, media_caption, '') != ''
      GROUP BY d
      ORDER BY d DESC
      LIMIT ?
    `).all(cutoff, days) as Array<{
      d: string;
      total_messages: number;
      active_chats: number;
    }>;

    if (dailyRows.length === 0) return "";

    const topChats = db.prepare(`
      SELECT chat_name, count(*) as total_messages
      FROM messages
      WHERE ts >= ?
        AND chat_name IS NOT NULL
        AND chat_name != ''
        AND COALESCE(text, media_caption, '') != ''
      GROUP BY chat_name
      ORDER BY total_messages DESC
      LIMIT 8
    `).all(cutoff) as Array<{
      chat_name: string;
      total_messages: number;
    }>;

    let output = `\nRECENT WHATSAPP ACTIVITY SNAPSHOT (last ${days} days):`;
    for (const row of dailyRows) {
      output += `\n- ${row.d}: ${row.total_messages} messages across ${row.active_chats} chats`;
    }

    if (topChats.length > 0) {
      output += `\nTop chats in that window:`;
      for (const chat of topChats) {
        if (isNoiseChat(chat.chat_name)) continue;
        const displayChat = anonCtx ? anonCtx.anonName(chat.chat_name) : chat.chat_name;
        output += `\n- ${displayChat}: ${chat.total_messages} messages`;
      }
    }

    return output;
  } finally {
    db.close();
  }
}

// Read recent WhatsApp messages directly from wacli.db
// Priority contacts: 14 days of history (relationships need context)
// Everyone else: 48 hours (recent activity)
function getRecentWhatsAppMessages(anonCtx?: AnonymizationContext | null): string {
  const config = getUserConfig();
  const rawPath = config.dataSources.wacliDbPath;
  if (!rawPath) return "";
  const dbPath = resolvePath(rawPath);
  let db: Database.Database;
  try {
    db = openDb(dbPath, {});
  } catch {
    return "";
  }

  try {
    // Pull 14 days, we'll filter by contact tier below
    const cutoff14d = Math.floor(Date.now() / 1000) - 14 * 24 * 3600;
    const cutoff48h = Math.floor(Date.now() / 1000) - 48 * 3600;
    const rows = db.prepare(`
      SELECT chat_name, sender_name, from_me, ts, msg_id,
             COALESCE(text, media_caption, '') as msg_text,
             media_type
      FROM messages
      WHERE ts > ?
      ORDER BY ts ASC
    `).all(cutoff14d) as Array<{
      chat_name: string;
      sender_name: string;
      from_me: number;
      ts: number;
      msg_id: string;
      msg_text: string;
      media_type: string | null;
    }>;

    // Load cached audio transcriptions
    const transcriptions = getTranscriptionMap();

    // Group by chat, skip noise, apply time windows per tier
    const chats = new Map<string, Array<{ sender: string; from_me: boolean; time: string; text: string; ts: number }>>();
    for (const r of rows) {
      if (!r.chat_name || isNoiseChat(r.chat_name)) continue;

      // Priority contacts: 14 days. Others: 48 hours.
      const priority = isPriorityContact(r.chat_name);
      if (!priority && r.ts < cutoff48h) continue;

      // Resolve message text, replace [Audio] with transcription if available
      let msgText = r.msg_text.trim();
      if (r.media_type === "audio") {
        const transcription = transcriptions.get(r.msg_id);
        if (transcription) {
          msgText = `[Voice note]: ${transcription}`;
        } else {
          msgText = "[Voice note, not yet transcribed]";
        }
      }

      // Sanitize known prompt injection patterns
      msgText = msgText.replace(/^(IGNORE\s|SYSTEM:|You are now|OVERRIDE|INSTRUCTION:)/gim, "[filtered] ");

      if (!msgText || msgText.length <= 2) continue;

      const chatMsgs = chats.get(r.chat_name) || [];
      const date = new Date(r.ts * 1000);
      const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
      const rawSender = r.from_me ? config.displayName : (r.sender_name || r.chat_name);
      const displaySender = anonCtx ? anonCtx.anonName(rawSender) : rawSender;
      const displayText = anonCtx ? anonCtx.anonText(msgText.length > 500 ? msgText.slice(0, 500) + "..." : msgText) : (msgText.length > 500 ? msgText.slice(0, 500) + "..." : msgText);
      chatMsgs.push({
        sender: displaySender,
        from_me: !!r.from_me,
        time: `${dateStr} ${timeStr}`,
        text: displayText,
        ts: r.ts,
      });
      chats.set(r.chat_name, chatMsgs);
    }

    if (chats.size === 0) return "";

    // Sort: priority contacts first (by name match), then by message count
    const sortedChats = [...chats.entries()]
      .sort((a, b) => {
        const aPriority = isPriorityContact(a[0]) ? 1 : 0;
        const bPriority = isPriorityContact(b[0]) ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b[1].length - a[1].length;
      })
      .slice(0, 20);

    let output = "";
    let totalChars = 0;
    const MAX_CHARS = 12000; // Larger budget for 14 days of priority-contact data

    for (const [chatName, msgs] of sortedChats) {
      if (totalChars > MAX_CHARS) break;

      const priority = isPriorityContact(chatName);
      // Priority contacts: show up to 40 messages. Others: up to 15.
      const limit = priority ? 40 : 15;
      const displayMsgs = msgs.length > limit ? msgs.slice(-limit) : msgs;
      const displayChatName = anonCtx ? anonCtx.anonName(chatName) : chatName;
      let chatBlock = `\n[${displayChatName}] (${msgs.length} messages, ${priority ? "priority" : "contact"}):\n`;

      for (const m of displayMsgs) {
        const line = `  ${m.time} ${m.sender}: ${m.text}\n`;
        if (totalChars + chatBlock.length + line.length > MAX_CHARS) break;
        chatBlock += line;
      }

      output += chatBlock;
      totalChars += chatBlock.length;
    }

    return output;
  } finally {
    db.close();
  }
}

// Available models for the frontend
export const MODELS = {
  openclaw: {
    label: "Local runtime",
    provider: "openclaw",
  },
} as const;

type ModelId = keyof typeof MODELS;
const DEFAULT_MODEL: ModelId = "openclaw";

// Cache emails for 5 minutes (they don't change that fast)
let _cachedEmails: { text: string; ts: number } | null = null;
const EMAIL_CACHE_MS = 300_000;

async function getRecentEmails(anonCtx?: AnonymizationContext | null): Promise<string> {
  if (_cachedEmails && !anonCtx && Date.now() - _cachedEmails.ts < EMAIL_CACHE_MS) {
    return _cachedEmails.text;
  }

  const config = getUserConfig();

  if (config.emailAccounts.includes(NONE_EMAIL_ACCOUNTS_ID) || config.emailAccounts.length === 0) {
    return "";
  }

  try {
    const envelopes = await listRecentEmailEnvelopes({
      selectedAccountIds: config.emailAccounts.includes(ALL_EMAIL_ACCOUNTS_ID) ? [] : config.emailAccounts,
      maxCount: 10,
    });

    let output = "";
    const grouped = new Map<string, typeof envelopes>();

    for (const envelope of envelopes) {
      const key = envelope.accountEmail || envelope.accountId;
      const entries = grouped.get(key) || [];
      entries.push(envelope);
      grouped.set(key, entries);
    }

    for (const [account, threads] of grouped.entries()) {
      const relevant = threads.filter((thread) => {
        const subj = thread.subject?.toLowerCase() || "";
        const from = thread.from?.toLowerCase() || "";
        if (from.includes("noreply") || from.includes("no-reply") || from.includes("notifications@")) return false;
        if (subj.includes("unsubscribe") || subj.includes("newsletter")) return false;
        return true;
      }).slice(0, 10);

      if (relevant.length === 0) continue;
      const displayAccount = anonCtx ? anonCtx.anonEmail(account) : account;
      output += `\n[${displayAccount}] (${relevant.length} recent emails):\n`;
      for (const thread of relevant) {
        const from = (thread.from || "").replace(/<[^>]+>/g, "").replace(/"/g, "").trim();
        const displayFrom = anonCtx ? anonCtx.anonText(from) : from;
        const displaySubject = anonCtx ? anonCtx.anonText(thread.subject || "") : (thread.subject || "");
        output += `  ${thread.date} | From: ${displayFrom} | "${displaySubject}"\n`;
      }
    }

    if (!anonCtx) {
      _cachedEmails = { text: output, ts: Date.now() };
    }
    return output;
  } catch (e) {
    console.error("[chat] Email fetch error:", e);
    return "";
  }
}

// Cache calendar events (raw) for 10 minutes so we avoid 20s osascript calls
let _cachedCalendarEvents: { events: Array<{ summary?: string; start?: string; allDay?: boolean; calendarTitle?: string; calendarId?: string; location?: string; description?: string }>; ts: number } | null = null;
let _cachedCalendar: { text: string; ts: number } | null = null;
const CALENDAR_CACHE_MS = 600_000;

function formatOpenClawConversation(
  messages: Array<{ role: string; content: string; attachments?: Array<{ data: string; mimeType: string; name?: string }> }>
): string {
  return messages
    .map((msg) => {
      const role = msg.role === "assistant" ? "ASSISTANT" : "USER";
      const body = (msg.content || "").trim() || "(empty message)";
      const attachmentSummary = msg.attachments?.length
        ? `\nAttachments: ${msg.attachments
            .map((att, index) => att.name || `${att.mimeType || "file"} #${index + 1}`)
            .join(", ")}`
        : "";
      return `${role}: ${body}${attachmentSummary}`;
    })
    .join("\n\n");
}

async function hasOpenClawFallback(): Promise<boolean> {
  if (_openClawAvailabilityCache && Date.now() - _openClawAvailabilityCache.ts < OPENCLAW_AVAILABILITY_CACHE_MS) {
    return _openClawAvailabilityCache.available;
  }

  const available = (await getClawJSOpenClawStatus({ includeLatestVersion: false })).ready;

  _openClawAvailabilityCache = { available, ts: Date.now() };
  return available;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<T>([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function hasAudioAttachments(
  attachments?: Array<{ data: string; mimeType: string; name?: string }>
): boolean {
  return Array.isArray(attachments) && attachments.some(
    (att) => att.data && att.mimeType.startsWith("audio/")
  );
}

import { findCommand, isWindows } from "@/lib/platform";

/** Resolve a binary from PATH or common locations (sync wrapper). */
function findBinary(cmd: string): string | null {
  // Synchronous fallback for well-known paths
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const ext = cmd.endsWith(".exe") ? "" : ".exe";
    const candidates = [
      ...(localAppData ? [path.join(localAppData, cmd, `${cmd}${ext}`)] : []),
      path.join(programFiles, cmd, `${cmd}${ext}`),
    ];
    return candidates.find((c) => fs.existsSync(c)) || null;
  }
  const candidates = [
    `/opt/homebrew/bin/${cmd}`,
    `/usr/local/bin/${cmd}`,
    `/usr/bin/${cmd}`,
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

/**
 * Transcribe a single audio file using OpenClaw's whisper setup.
 * Uses the same binary and arguments that OpenClaw uses internally:
 *   1. whisper-cli (whisper.cpp), fast native, converts webm→wav via ffmpeg first
 *   2. whisper (Python fallback), accepts webm directly but is slower
 */
async function transcribeAudioFile(audioPath: string): Promise<string | null> {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "ot-whisper-"));
  const baseName = path.basename(audioPath, path.extname(audioPath));
  const outputBase = path.join(outDir, baseName);

  try {
    // Try whisper-cli (whisper.cpp), same as OpenClaw's media understanding
    const whisperCli = findBinary("whisper-cli");
    const ffmpegBin = findBinary("ffmpeg");

    if (whisperCli && ffmpegBin) {
      const defaultModelPath = isWindows
        ? path.join(process.env.ProgramFiles || "C:\\Program Files", "whisper-cpp", "ggml-base.bin")
        : "/opt/homebrew/share/whisper-cpp/ggml-base.bin";
      const modelPath = process.env.WHISPER_CPP_MODEL?.trim() || defaultModelPath;

      if (fs.existsSync(modelPath)) {
        // Convert webm → wav (whisper.cpp requires wav)
        const wavPath = path.join(outDir, "audio.wav");
        const converted = await new Promise<boolean>((resolve) => {
          execFile(ffmpegBin, ["-i", audioPath, "-ar", "16000", "-ac", "1", wavPath, "-y"],
            { timeout: 10_000 },
            (err) => resolve(!err && fs.existsSync(wavPath)),
          );
        });

        if (converted) {
          const text = await new Promise<string | null>((resolve) => {
            execFile(whisperCli, ["-m", modelPath, "-otxt", "-of", outputBase, "-np", "-nt", wavPath], { timeout: 30_000 }, (err) => {
              if (err) { resolve(null); return; }
              const txtPath = outputBase + ".txt";
              try {
                const t = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf-8").trim() : null;
                resolve(t || null);
              } catch { resolve(null); }
            });
          });
          if (text) return text;
        }
      }
    }

    // Fallback: Python whisper (accepts webm directly)
    const whisperPy = findBinary("whisper");
    if (!whisperPy) return null;

    return new Promise((resolve) => {
      execFile(whisperPy, [audioPath, "--output_format", "txt", "--output_dir", outDir], { timeout: 120_000 }, (err) => {
        if (err) { resolve(null); return; }
        const txtPath = path.join(outDir, baseName + ".txt");
        try {
          const t = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf-8").trim() : null;
          resolve(t || null);
        } catch { resolve(null); }
      });
    });
  } finally {
    try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Transcribe audio attachments in user messages using OpenClaw's local whisper setup.
 * Replaces audio content with the transcribed text so OpenClaw receives plain text.
 */
async function transcribeAudioInMessages(
  messages: Array<{ role: string; content: string; attachments?: Array<{ data: string; mimeType: string; name?: string }> }>
): Promise<Array<{ role: string; content: string; attachments?: Array<{ data: string; mimeType: string; name?: string }> }>> {
  const result = [];
  for (const msg of messages) {
    if (msg.role !== "user" || !hasAudioAttachments(msg.attachments)) {
      result.push(msg);
      continue;
    }

    const transcriptions: string[] = [];
    for (const att of msg.attachments || []) {
      if (!att.data || !att.mimeType.startsWith("audio/")) continue;
      try {
        const base64Data = att.data.includes(",") ? att.data.split(",")[1] : att.data;
        const audioBuffer = Buffer.from(base64Data, "base64");
        const ext = att.mimeType.includes("webm") ? "webm" : att.mimeType.includes("mp4") ? "mp4" : "ogg";
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ot-voice-"));
        const audioPath = path.join(tmpDir, `voice.${ext}`);
        fs.writeFileSync(audioPath, audioBuffer);

        const text = await transcribeAudioFile(audioPath);
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        if (text) transcriptions.push(text);
      } catch (e) {
        console.error("[chat] Audio transcription failed:", e);
      }
    }

    const userText = msg.content && msg.content !== "[Voice message]" ? msg.content : "";
    const transcribedText = transcriptions.join("\n");
    const finalContent = userText && transcribedText
      ? `${userText}\n\n${transcribedText}`
      : transcribedText || userText || "[Voice message, transcription failed]";

    result.push({ ...msg, content: finalContent });
  }
  return result;
}


async function streamOpenClawAgent(
  systemPrompt: string,
  messages: Array<{ role: string; content: string; attachments?: Array<{ data: string; mimeType: string; name?: string }> }>,
  sessionId: string,
  trace?: ChatPerfTraceContext,
): Promise<Response> {
  const ensureStart = Date.now();
  await ensureClawJSOpenClawAgent();
  const ensureAgentMs = Date.now() - ensureStart;
  const clawStart = Date.now();
  const claw = await getClaw();
  const getClawMs = Date.now() - clawStart;
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!latestUserMessage) {
    throw new Error("Chat session requires a user message");
  }

  const sseHeaders = { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" };

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const streamStartMs = Date.now();
      let selectedTransport: "gateway" | "cli" | undefined;
      let usedFallback = false;
      let retries = 0;
      let firstChunkMs: number | undefined;
      try {
        if (trace?.enabled) {
          emitChatPerfFrame(controller, encoder, trace, {
            phase: "request_ready",
            totalMs: Date.now() - trace.requestStartMs,
            availabilityMs: trace.availabilityMs,
            transcribeMs: trace.transcribeMs,
            systemPromptMs: trace.systemPromptMs,
            ensureAgentMs,
            getClawMs,
            prompt: trace.prompt,
          });
        } else {
          logChatPerf(formatChatPerfLog({
            traceId: trace?.traceId ?? "no-trace",
            phase: "request_ready",
            totalMs: trace ? Date.now() - trace.requestStartMs : ensureAgentMs + getClawMs,
            messageCount: trace?.messageCount,
            availabilityMs: trace?.availabilityMs,
            transcribeMs: trace?.transcribeMs,
            systemPromptMs: trace?.systemPromptMs,
            ensureAgentMs,
            getClawMs,
            ...(trace?.prompt ? { prompt: trace.prompt } : {}),
          }));
        }

        for await (const event of claw.conversations.streamAssistantReplyEvents({
          sessionId,
          systemPrompt,
          transport: "auto",
          chunkSize: 24,
        })) {
          if (event.type === "transport") {
            selectedTransport = event.transport;
            usedFallback = event.fallback;
            if (trace?.enabled) {
              emitChatPerfFrame(controller, encoder, trace, {
                phase: "transport_selected",
                totalMs: Date.now() - trace.requestStartMs,
                transport: event.transport,
                fallback: event.fallback,
                retries,
              });
            } else {
              logChatPerf(formatChatPerfLog({
                traceId: trace?.traceId ?? "no-trace",
                phase: "transport_selected",
                totalMs: trace ? Date.now() - trace.requestStartMs : Date.now() - streamStartMs,
                messageCount: trace?.messageCount,
                transport: event.transport,
                fallback: event.fallback,
                retries,
              }));
            }
            continue;
          }

          if (event.type === "retry") {
            retries += 1;
            if (trace?.enabled) {
              emitChatPerfFrame(controller, encoder, trace, {
                phase: "transport_retry",
                totalMs: Date.now() - trace.requestStartMs,
                transport: event.transport,
                retries,
                attempt: event.attempt,
                maxAttempts: event.maxAttempts,
                error: event.error.message,
              });
            } else {
              logChatPerf(formatChatPerfLog({
                traceId: trace?.traceId ?? "no-trace",
                phase: "transport_retry",
                totalMs: trace ? Date.now() - trace.requestStartMs : Date.now() - streamStartMs,
                messageCount: trace?.messageCount,
                transport: event.transport,
                retries,
                attempt: event.attempt,
                maxAttempts: event.maxAttempts,
                error: event.error.message,
              }));
            }
            continue;
          }

          if (event.type === "chunk") {
            if (typeof firstChunkMs !== "number") {
              firstChunkMs = Date.now() - streamStartMs;
              if (trace?.enabled) {
                emitChatPerfFrame(controller, encoder, trace, {
                  phase: "first_chunk",
                  totalMs: Date.now() - trace.requestStartMs,
                  transport: selectedTransport,
                  fallback: usedFallback,
                  firstChunkMs,
                  retries,
                });
              } else {
                logChatPerf(formatChatPerfLog({
                  traceId: trace?.traceId ?? "no-trace",
                  phase: "first_chunk",
                  totalMs: trace ? Date.now() - trace.requestStartMs : Date.now() - streamStartMs,
                  messageCount: trace?.messageCount,
                  transport: selectedTransport,
                  fallback: usedFallback,
                  firstChunkMs,
                  retries,
                }));
              }
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: event.chunk.delta, model: "clawjs" })}\n\n`)
            );
            continue;
          }

          if (event.type === "done") {
            if (trace?.enabled) {
              emitChatPerfFrame(controller, encoder, trace, {
                phase: "stream_complete",
                totalMs: Date.now() - trace.requestStartMs,
                transport: selectedTransport,
                fallback: usedFallback,
                firstChunkMs,
                streamMs: Date.now() - streamStartMs,
                retries,
              });
            } else {
              logChatPerf(formatChatPerfLog({
                traceId: trace?.traceId ?? "no-trace",
                phase: "stream_complete",
                totalMs: trace ? Date.now() - trace.requestStartMs : Date.now() - streamStartMs,
                messageCount: trace?.messageCount,
                transport: selectedTransport,
                fallback: usedFallback,
                firstChunkMs,
                streamMs: Date.now() - streamStartMs,
                retries,
              }));
            }
            continue;
          }

          if (event.type === "error") {
            if (trace?.enabled) {
              emitChatPerfFrame(controller, encoder, trace, {
                phase: "stream_error",
                totalMs: Date.now() - trace.requestStartMs,
                transport: event.transport,
                fallback: usedFallback,
                firstChunkMs,
                streamMs: Date.now() - streamStartMs,
                retries,
                error: event.error.message,
              });
            } else {
              logChatPerf(formatChatPerfLog({
                traceId: trace?.traceId ?? "no-trace",
                phase: "stream_error",
                totalMs: trace ? Date.now() - trace.requestStartMs : Date.now() - streamStartMs,
                messageCount: trace?.messageCount,
                transport: event.transport,
                fallback: usedFallback,
                firstChunkMs,
                streamMs: Date.now() - streamStartMs,
                retries,
                error: event.error.message,
              }));
            }
            throw event.error;
          }

          if (event.type === "aborted") {
            if (trace?.enabled) {
              emitChatPerfFrame(controller, encoder, trace, {
                phase: "stream_aborted",
                totalMs: Date.now() - trace.requestStartMs,
                transport: selectedTransport,
                fallback: usedFallback,
                firstChunkMs,
                streamMs: Date.now() - streamStartMs,
                retries,
                error: event.reason || "Assistant stream aborted",
              });
            } else {
              logChatPerf(formatChatPerfLog({
                traceId: trace?.traceId ?? "no-trace",
                phase: "stream_aborted",
                totalMs: trace ? Date.now() - trace.requestStartMs : Date.now() - streamStartMs,
                messageCount: trace?.messageCount,
                transport: selectedTransport,
                fallback: usedFallback,
                firstChunkMs,
                streamMs: Date.now() - streamStartMs,
                retries,
                error: event.reason || "Assistant stream aborted",
              }));
            }
            throw new Error(event.reason || "Assistant stream aborted");
          }
        }

        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(readable, { headers: sseHeaders });
}

async function getRecentCalendar(anonCtx?: AnonymizationContext | null): Promise<string> {
  if (_cachedCalendar && !anonCtx && Date.now() - _cachedCalendar.ts < CALENDAR_CACHE_MS) {
    return _cachedCalendar.text;
  }

  const config = getUserConfig();
  const selectedCalendarIds = (config.calendarAccounts || []).filter(Boolean);
  if (selectedCalendarIds.length === 0 || selectedCalendarIds.includes(NONE_CALENDARS_ID)) {
    if (!anonCtx) {
      _cachedCalendar = { text: "", ts: Date.now() };
      _cachedCalendarEvents = { events: [], ts: Date.now() };
    }
    return "";
  }

  try {
    // Reuse cached raw events to avoid expensive 20s osascript calls
    let events: Array<{ summary?: string; start?: string; allDay?: boolean; calendarTitle?: string; calendarId?: string; location?: string; description?: string }>;
    if (_cachedCalendarEvents && Date.now() - _cachedCalendarEvents.ts < CALENDAR_CACHE_MS) {
      events = _cachedCalendarEvents.events;
    } else {
      const calendarIds = selectedCalendarIds;
      const fetchAll = calendarIds.includes(ALL_CALENDARS_ID);
      const legacyTitles = new Set(
        calendarIds.filter((id) => id.includes("::")).map((id) => id.split("::")[0]),
      );
      events = (await withTimeout(listRecentCalendarEvents({
        selectedCalendarId: ALL_CALENDARS_ID,
        pastDays: 3,
        futureDays: 1,
        limit: 50,
      }), CHAT_CALENDAR_BUDGET_MS, [])).filter((e) => fetchAll
        || calendarIds.includes(e.calendarId || "")
        || legacyTitles.has(e.calendarTitle || ""));
      _cachedCalendarEvents = { events, ts: Date.now() };
    }

    const fetchAll = selectedCalendarIds.includes(ALL_CALENDARS_ID);

    let result = "";
    for (const event of events) {
      const description = event.description || "";
      const start = event.start || "";
      let dateStr = start;

      if (start) {
        const date = new Date(start);
        if (event.allDay) {
          dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        } else {
          dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            + " "
            + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        }
      }

      const displaySummary = anonCtx ? anonCtx.anonText(event.summary || "(no title)") : (event.summary || "(no title)");
      result += `  ${dateStr} | ${displaySummary}`;
      if (fetchAll && event.calendarTitle) {
        result += ` | ${event.calendarTitle}`;
      }
      if (event.location) {
        const displayLocation = anonCtx ? anonCtx.anonLocation(event.location.slice(0, 80)) : event.location.slice(0, 80);
        result += ` | ${displayLocation}`;
      }
      if (
        description
        && (description.toLowerCase().includes("flight")
          || description.toLowerCase().includes("vuelo")
          || description.toLowerCase().includes("booking")
          || description.toLowerCase().includes("hotel"))
      ) {
        const displayDesc = anonCtx ? anonCtx.anonText(description.slice(0, 150).replace(/\n/g, " ")) : description.slice(0, 150).replace(/\n/g, " ");
        result += ` | ${displayDesc}`;
      }
      result += "\n";
    }

    if (!anonCtx) {
      _cachedCalendar = { text: result, ts: Date.now() };
    }
    return result;
  } catch (e) {
    console.error("[chat] Calendar fetch error:", e);
    return "";
  }
}


function buildPersonalityParagraph(config: import("@/lib/user-config").UserConfig): string {
  const t = config.assistant ?? config.chat;
  const style = t.guidanceStyle || "balanced";
  const tone = t.emotionalTone || "balanced";

  const styleParagraphs: Record<string, string> = {
    guiding:
      "ASSISTANT STYLE: You take an active, guiding approach. You offer concrete suggestions, share practical frameworks, and help the user move from vague friction to clear next steps. You still listen carefully, but you lean into actionable guidance when it is useful.",
    reflective:
      "ASSISTANT STYLE: You take a reflective, non-directive approach. You primarily listen, ask thoughtful questions, and mirror back what you hear. You help the user arrive at their own insight instead of jumping straight to solutions. You avoid forcing direction unless the user clearly wants it.",
    balanced:
      "ASSISTANT STYLE: You balance guidance with reflection. Sometimes you offer concrete suggestions and frameworks; other times you step back and ask questions that help the user find their own answer. You read the moment and adjust accordingly.",
  };

  const toneParagraphs: Record<string, string> = {
    warm:
      "TONE: You lead with warmth and empathy. You validate feelings before analyzing them. Your language is gentle, encouraging, and compassionate without becoming vague or sugary.",
    direct:
      "TONE: You are honest and direct. You do not sugarcoat things or dance around difficult truths. You challenge assumptions, point out blind spots, and push for clarity while staying respectful.",
    balanced:
      "TONE: You combine warmth with honesty. You are empathetic and validating, but also willing to be direct when it matters. You do not shy away from hard truths, but you deliver them with care.",
  };

  const parts: string[] = [styleParagraphs[style], toneParagraphs[tone]];

  // Depth level
  if (t.depthLevel && t.depthLevel !== "moderate") {
    const depthInstructions: Record<string, string> = {
      surface: "DEPTH: Keep conversations focused on the present situation and practical solutions. Don't dig into childhood history or deep psychological roots unless the user explicitly brings them up. Stay action-oriented and here-and-now.",
      deep: "DEPTH: You go deep. Explore root causes, repeated patterns, hidden motivations, and the deeper 'why' behind behavior. Do not settle for surface-level answers when the conversation clearly supports going deeper.",
    };
    parts.push(depthInstructions[t.depthLevel]);
  }

  // Exercise frequency
  if (t.exerciseFrequency && t.exerciseFrequency !== "sometimes") {
    const exerciseInstructions: Record<string, string> = {
      never: "PRACTICAL EXERCISES: Do NOT suggest exercises, breathing techniques, journaling prompts, or homework unless the user specifically asks for them. Focus purely on conversation and reflection.",
      frequent: "PRACTICAL EXERCISES: Frequently suggest practical exercises, techniques, and activities the user can try between chats. Favor concrete actions over abstract advice.",
    };
    parts.push(exerciseInstructions[t.exerciseFrequency]);
  }

  // Metaphor use
  if (t.metaphorUse && t.metaphorUse !== "moderate") {
    const metaphorInstructions: Record<string, string> = {
      low: "METAPHORS: Keep your language literal and concrete. Avoid metaphors, analogies, and figurative language. Say what you mean directly.",
      frequent: "METAPHORS: Use metaphors, analogies, and stories liberally when they make abstract ideas more tangible or memorable.",
    };
    parts.push(metaphorInstructions[t.metaphorUse]);
  }

  // Response length
  if (t.responseLength && t.responseLength !== "moderate") {
    const lengthInstructions: Record<string, string> = {
      brief: "RESPONSE LENGTH: Keep your responses SHORT, 1-2 paragraphs maximum. Be concise and impactful. Every word should count. Don't over-explain.",
      extended: "RESPONSE LENGTH: You can write longer, more thorough responses when the topic warrants it. Take space to explore ideas, offer multiple perspectives, and provide detailed guidance without rambling.",
    };
    parts.push(lengthInstructions[t.responseLength]);
  }

  // Formality level
  if (t.formalityLevel && t.formalityLevel !== "neutral") {
    const formalityInstructions: Record<string, string> = {
      informal: "FORMALITY: Be casual and conversational, like a close friend. Use informal language, contractions, and a relaxed tone. No jargon unless necessary.",
      formal: "FORMALITY: Maintain a polished, professional tone. Use clear, well-structured language. You can be warm without being overly casual.",
    };
    parts.push(formalityInstructions[t.formalityLevel]);
  }

  // Humor use
  if (t.humorUse && t.humorUse !== "never") {
    const humorInstructions: Record<string, string> = {
      occasional: "HUMOR: You can use gentle humor occasionally to lighten heavy moments or build rapport, a light observation, a wry comment. But always read the room; never joke when someone is in real pain.",
      frequent: "HUMOR: Humor is one of your tools. You can use wit, playful observations, and gentle teasing to build connection and help the user see a situation with more lightness. Always read the room first.",
    };
    parts.push(humorInstructions[t.humorUse]);
  }

  // Progress speed
  if (t.progressSpeed && t.progressSpeed !== "moderate") {
    const speedInstructions: Record<string, string> = {
      patient: "PACING: Be patient and unhurried. Let conversations unfold at their own pace. Don't rush to solutions or try to cover too much ground in one session. Sometimes sitting with something is more valuable than solving it.",
      direct: "PACING: Move the conversation forward efficiently. Do not linger on topics longer than needed. When you understand the issue, pivot toward insight or action.",
    };
    parts.push(speedInstructions[t.progressSpeed]);
  }

  // Confrontation level
  if (t.confrontationLevel && t.confrontationLevel !== "moderate") {
    const confrontationInstructions: Record<string, string> = {
      gentle: "CONFRONTATION: Be very gentle when challenging beliefs or behaviors. Use soft language, tentative suggestions, and lots of validation. Avoid anything that could feel like criticism or judgment.",
      confrontational: "CONFRONTATION: Do not shy away from challenging the user's beliefs, rationalizations, or blind spots. Point out contradictions, push back on excuses, and hold them accountable while staying respectful.",
    };
    parts.push(confrontationInstructions[t.confrontationLevel]);
  }

  // User autonomy
  if (t.userAutonomy && t.userAutonomy !== "collaborative") {
    const autonomyInstructions: Record<string, string> = {
      "active-guidance": "SESSION LEADERSHIP: You actively lead the conversation. You set the agenda, suggest topics, ask structured questions, and guide the user through a clear process.",
      "user-led": "SESSION LEADERSHIP: The user leads. You follow their direction, explore what they bring up, and support their process without steering or forcing an agenda.",
    };
    parts.push(autonomyInstructions[t.userAutonomy]);
  }

  // AI reminders
  if (t.aiReminders && t.aiReminders !== "never") {
    const aiReminderInstructions: Record<string, string> = {
      start: "AI TRANSPARENCY: At the beginning of each conversation, briefly remind the user that you are an AI assistant. After that initial reminder, proceed naturally without repeating it unnecessarily.",
      periodically: "AI TRANSPARENCY: Periodically remind the user that you are an AI assistant, especially when discussing health, legal, financial, or other high-stakes topics.",
    };
    parts.push(aiReminderInstructions[t.aiReminders]);
  }

  if (t.referralSuggestions) {
    parts.push("HUMAN SUPPORT: When a topic becomes high-stakes or clearly needs specialized expertise, suggest involving an appropriate human professional or trusted person in a calm, practical way.");
  }

  // Session duration
  if (t.sessionDuration && t.sessionDuration !== "unlimited") {
    const durationMap: Record<string, string> = { "15min": "15 minutes", "30min": "30 minutes", "45min": "45 minutes" };
    parts.push(`SESSION DURATION: Aim for sessions of approximately ${durationMap[t.sessionDuration]}. As the session approaches this length, begin wrapping up. Summarize key takeaways, suggest something to reflect on, and bring the conversation to a natural close. Let the user know they can continue in a new session.`);
  }

  // Session structure
  if (t.sessionStructure && t.sessionStructure !== "free") {
    const structureInstructions: Record<string, string> = {
      "semi-structured": "SESSION STRUCTURE: Follow a loose structure: begin with a brief check-in (how are you feeling today?), move into the main exploration, and close with a brief reflection or takeaway. But stay flexible. If the user needs to go off-script, follow them.",
      structured: "SESSION STRUCTURE: Follow a clear structure for each chat: (1) Check-in. (2) Exploration. (3) Insights and patterns. (4) Closing with a concise takeaway or next step.",
    };
    parts.push(structureInstructions[t.sessionStructure]);
  }

  // Post-session summary
  if (t.postSessionSummary) {
    parts.push("POST-SESSION SUMMARY: When the user indicates they want to end the session (or after a natural conversational arc), provide a concise summary covering: key topics discussed, insights that emerged, any commitments or action items, and a suggested focus for next time.");
  }

  // Inter-session follow-up
  if (t.interSessionFollowUp) {
    parts.push("INTER-SESSION FOLLOW-UP: At the beginning of each new conversation, briefly check in on topics, commitments, or exercises from previous sessions. Ask how things went, what they noticed, and whether they want to continue exploring those themes or move to something new.");
  }

  const tb = config.assistantPersona;
  if (tb) {
    const identityParts: string[] = [];
    if (tb.name) identityParts.push(`Your name is ${tb.name}.`);
    if (tb.apparentAge) {
      const ageLabels: Record<string, string> = { young: "younger", "middle-aged": "middle-aged", senior: "senior and experienced" };
      identityParts.push(`You present as ${ageLabels[tb.apparentAge]}.`);
    }
    if (tb.gender) {
      identityParts.push(`Your gender is ${tb.gender}.`);
    }
    if (identityParts.length) {
      parts.push(`ASSISTANT PERSONA: ${identityParts.join(" ")}`);
    }
  }

  return parts.join("\n\n");
}

async function buildSystemPrompt(anonCtx?: AnonymizationContext | null): Promise<{
  prompt: string;
  perf: ChatPerfPromptBreakdown;
}> {
  return {
    // The demo intentionally avoids preloading personal data into the system prompt.
    prompt: "",
    perf: {
      prepMs: 0,
      emailMs: 0,
      calendarMs: 0,
      totalMs: 0,
      promptChars: 0,
    },
  };
}

export function clearChatCaches() {
  _cachedEmails = null;
  _cachedCalendar = null;
  _cachedCalendarEvents = null;
}

export async function GET() {
  if (isE2EEnabled()) {
    ensureE2ESeeded();
    return Response.json(buildE2EChatBootstrap(), { headers: NO_STORE_HEADERS });
  }

  const config = getUserConfig();
  const openClawAvailable = await hasOpenClawFallback();

  // Build context short labels from config
  const contextShortLabels: Record<string, string> = {};
  for (const [id, fileConfig] of Object.entries(config.contextFiles)) {
    contextShortLabels[id] = fileConfig.shortLabel;
  }

  return new Response(
    JSON.stringify({
      models: Object.entries(MODELS).map(([id, m]) => ({
        id,
        label: m.label,
        available: m.provider === "openclaw" && openClawAvailable,
      })),
      displayName: config.displayName,
      greeting: config.chat.greeting,
      suggestedTopics: config.chat.suggestedTopics,
      hotTopicSuggestions: buildHotTopicSuggestions(),
      contextShortLabels,
      profileLocation: config.profileBasics?.location || null,
    }),
    { headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS } }
  );
}

export async function POST(req: NextRequest) {
  if (isE2EEnabled()) {
    const body = await req.json();
    const requestMessages = Array.isArray(body?.messages) ? body.messages : [];
    const latestUserMessage = [...requestMessages].reverse().find((message) => message?.role === "user");
    const debugTrace = body?.debugTrace === true;
    let sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : "";

    if (!sessionId || !sessionExists(sessionId)) {
      sessionId = createSession(
        typeof body?.initialSessionTitle === "string" ? body.initialSessionTitle : undefined,
      ).sessionId;
    }

    const existing = getSession(sessionId);
    if (body?.persistLatestUserMessage !== false && latestUserMessage?.content) {
      const lastStored = existing?.messages[existing.messages.length - 1];
      if (!lastStored || lastStored.role !== "user" || lastStored.content !== latestUserMessage.content) {
        appendSessionMessage(sessionId, {
          role: "user",
          content: latestUserMessage.content,
          attachments: latestUserMessage.attachments,
          contextChips: latestUserMessage.contextChips,
        });
      }
    }

    const reply = buildE2EChatReply(latestUserMessage?.content || "");
    appendSessionMessage(sessionId, {
      role: "assistant",
      content: reply,
    });
    return createE2EStreamResponse(
      sessionId,
      reply,
      debugTrace ? { traceId: randomUUID().slice(0, 8) } : undefined,
    );
  }

  const {
    messages,
    model: modelId,
    sessionId: requestedSessionId,
    initialSessionTitle,
    starterPrompt,
    persistLatestUserMessage,
    debugTrace,
  } = await req.json();
  const t0 = Date.now();
  const traceId = (debugTrace === true || ENABLE_CHAT_PERF_LOGS) ? randomUUID().slice(0, 8) : "";
  const selectedModel = (modelId && modelId in MODELS ? modelId : DEFAULT_MODEL) as ModelId;
  const availabilityMs = 0;
  const activeSessionId =
    typeof requestedSessionId === "string" && requestedSessionId.trim() && sessionExists(requestedSessionId)
      ? requestedSessionId
      : createSession(typeof initialSessionTitle === "string" ? initialSessionTitle : undefined).sessionId;

  type IncomingMessage = { role: string; content: string; attachments?: Array<{ data: string; mimeType: string; name?: string }>; contextChips?: Array<{ type: string; id: string; label: string; emoji?: string }> };
  const normalizedMessages: IncomingMessage[] = Array.isArray(messages) ? messages : [];

  // Persist the latest user message BEFORE injecting the focus hint
  const latestUserMessage = normalizedMessages.length > 0
    ? [...normalizedMessages].reverse().find((message) => message?.role === "user")
    : null;
  if (persistLatestUserMessage !== false && (latestUserMessage?.content || latestUserMessage?.attachments?.length)) {
    appendSessionMessage(activeSessionId, {
      role: "user",
      content: latestUserMessage.content || "(empty message)",
      attachments: Array.isArray(latestUserMessage.attachments)
        ? latestUserMessage.attachments.map((attachment: { name?: string; mimeType?: string; data?: string }) => ({
            name: attachment.name || attachment.mimeType || "Attachment",
            mimeType: attachment.mimeType || "application/octet-stream",
            data: attachment.data,
          }))
        : undefined,
      contextChips: Array.isArray(latestUserMessage.contextChips) ? latestUserMessage.contextChips : undefined,
    });
  }

  // Create anonymization context early so it can be used for context chips
  const config = getUserConfig();
  const anonCtx = config.anonymizeContacts !== false
    ? createAnonymizationContext(config)
    : null;

  // Inject focus hint from context chips on the latest user message (for the AI only)
  const latestUserIdx = normalizedMessages.map((m, i) => ({ m, i })).filter(({ m }) => m.role === "user").pop()?.i ?? -1;
  if (latestUserIdx >= 0) {
    const latest = normalizedMessages[latestUserIdx];
    const chips = Array.isArray(latest.contextChips) ? latest.contextChips : [];
    if (chips.length > 0) {
      const focusLines = chips.map((c) => {
        const typeLabel = c.type === "person" ? "Person" : c.type.charAt(0).toUpperCase() + c.type.slice(1);
        const displayLabel = (c.type === "person" && anonCtx) ? anonCtx.anonName(c.label) : c.label;
        return `- ${typeLabel}: ${displayLabel}`;
      });
      const focusHint = `[Context: the user is specifically referring to:\n${focusLines.join("\n")}\nFocus your response on these entities.]\n\n`;
      normalizedMessages[latestUserIdx] = {
        ...latest,
        content: focusHint + (latest.content || ""),
      };
    }
  }

  const requestMessages = typeof starterPrompt === "string" && starterPrompt.trim()
    ? [...normalizedMessages, { role: "user", content: starterPrompt.trim() }]
    : normalizedMessages;

  // Transcribe audio attachments using the whisper CLI (managed by OpenClaw)
  const t1 = Date.now();
  const processedMessages = await transcribeAudioInMessages(requestMessages);
  const transcribeMs = Date.now() - t1;

  try {
    // Build system prompt with anonymization applied to all data sources
    const tSP = Date.now();
    const { prompt: systemPrompt, perf: promptPerf } = await buildSystemPrompt(anonCtx);
    const systemPromptMs = Date.now() - tSP;
    const t2 = Date.now();
    const response = await streamOpenClawAgent(systemPrompt, processedMessages, activeSessionId, {
      enabled: debugTrace === true,
      traceId: traceId || randomUUID().slice(0, 8),
      requestStartMs: t0,
      messageCount: processedMessages.length,
      availabilityMs,
      transcribeMs,
      systemPromptMs,
      prompt: promptPerf,
    });
    const agentMs = Date.now() - t2;
    const totalMs = Date.now() - t0;
    logChatPerf(
      `[chat][perf][${traceId || "no-trace"}] request_dispatched total=${totalMs}ms availability=${availabilityMs}ms transcribe=${transcribeMs}ms systemPrompt=${systemPromptMs}ms responseReady=${agentMs}ms`,
    );
    response.headers.set("X-ClawJS-Session-Id", activeSessionId);
    response.headers.set("X-ClawJS-Legacy-Session-Id", activeSessionId);
    if (debugTrace === true && traceId) {
      response.headers.set("X-ClawJS-Chat-Trace-Id", traceId);
    }
    // Send reverse map so client can de-anonymize AI responses
    if (anonCtx) {
      const reverseMap = anonCtx.getReverseMap();
      if (Object.keys(reverseMap).length > 0) {
        const encoded = btoa(JSON.stringify(reverseMap));
        response.headers.set("X-ClawJS-Anon-Map", encoded);
        response.headers.set("X-ClawJS-Legacy-Anon-Map", encoded);
      }
    }
    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error(`[chat] ${selectedModel} failed:`, errorMessage);
    return new Response(
      JSON.stringify({ error: `ClawJS request failed: ${errorMessage}` }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
