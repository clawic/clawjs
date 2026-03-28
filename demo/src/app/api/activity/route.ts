import { NextRequest, NextResponse } from "next/server";
import { resolveClawJSWorkspaceDir } from "@/lib/claw";
import { isE2EEnabled } from "@/lib/e2e";
import { readCollection, writeCollection, type ActivityEvent as StoredActivityEvent } from "@/lib/demo-store";
import { WorkspaceAuditLog } from "@clawjs/claw";
import fs from "fs";
import path from "path";

interface AuditRecord {
  timestamp: string;
  event: string;
  capability?: string;
  detail?: Record<string, unknown>;
}

interface ActivityEvent {
  id: string;
  event: string;
  capability: string;
  detail: string;
  timestamp: number;
  status: "success" | "failure" | "pending";
}

const auditLog = new WorkspaceAuditLog();

function getWorkspaceDir(): string {
  return resolveClawJSWorkspaceDir();
}

function readAuditRecords(wsDir: string): AuditRecord[] {
  const auditPath = path.join(wsDir, ".clawjs", "audit", "audit.jsonl");
  if (!fs.existsSync(auditPath)) return [];
  try {
    return fs.readFileSync(auditPath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line) as AuditRecord; }
        catch { return null; }
      })
      .filter((r): r is AuditRecord => r !== null);
  } catch {
    return [];
  }
}

function mapRecordToEvent(record: AuditRecord, index: number): ActivityEvent {
  const detailStr = record.detail
    ? (record.detail.message as string || JSON.stringify(record.detail))
    : "";
  const hasFailure = /fail|error/i.test(detailStr) || /fail|error/i.test(record.event);
  const hasPending = /pending|draft|awaiting/i.test(detailStr);
  return {
    id: `audit-${index}-${new Date(record.timestamp).getTime()}`,
    event: record.event,
    capability: record.capability || "general",
    detail: detailStr,
    timestamp: new Date(record.timestamp).getTime(),
    status: hasFailure ? "failure" : hasPending ? "pending" : "success",
  };
}

const SEED_EVENTS = [
  { event: "Message sent via WhatsApp", capability: "channels", detail: "Delivered confirmation to contact +1 555-0123", hoursAgo: 0.5 },
  { event: "Context files updated", capability: "memory", detail: "Indexed 12 new documents from project workspace", hoursAgo: 2 },
  { event: "Routine 'Daily Summary' executed", capability: "scheduler", detail: "Generated and delivered morning briefing to email", hoursAgo: 4 },
  { event: "Image generated", capability: "models", detail: "Created 1024x1024 illustration using DALL-E 3", hoursAgo: 6 },
  { event: "Email draft created", capability: "channels", detail: "Draft 'Q1 Report Follow-up' awaiting review", hoursAgo: 8 },
  { event: "Skill 'web-search' installed", capability: "skills", detail: "Installed from registry v2.1.0", hoursAgo: 24 },
  { event: "Budget threshold warning", capability: "providers", detail: "Monthly spend reached 85% of $50 budget limit — error threshold", hoursAgo: 26 },
  { event: "Chat session completed", capability: "channels", detail: "32 messages exchanged, 4.2k tokens used", hoursAgo: 36 },
  { event: "Memory consolidation ran", capability: "memory", detail: "Merged 8 short-term entries into long-term store", hoursAgo: 48 },
  { event: "Routine 'Weekly Review' executed", capability: "scheduler", detail: "Compiled task progress and sent to Telegram", hoursAgo: 51 },
  { event: "Model fallback triggered", capability: "models", detail: "Primary model unavailable — failure, switched to gpt-4o-mini", hoursAgo: 72 },
  { event: "Telegram message received", capability: "channels", detail: "Incoming message from @alex_dev processed", hoursAgo: 84 },
  { event: "Skill 'code-review' updated", capability: "skills", detail: "Updated from v1.0.2 to v1.1.0", hoursAgo: 96 },
  { event: "Routine 'Backup Notes' failed", capability: "scheduler", detail: "Storage quota exceeded — failure", hoursAgo: 120 },
  { event: "Provider API key rotated", capability: "providers", detail: "OpenAI key refreshed, all endpoints verified", hoursAgo: 144 },
  { event: "Voice transcription completed", capability: "models", detail: "Transcribed 4m 32s audio clip via Whisper", hoursAgo: 156 },
];

function seedAuditLog(wsDir: string): void {
  const now = Date.now();
  for (const seed of SEED_EVENTS) {
    const timestamp = new Date(now - seed.hoursAgo * 3_600_000).toISOString();
    auditLog.append(wsDir, {
      timestamp,
      event: seed.event,
      capability: seed.capability,
      detail: { message: seed.detail },
    });
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const capability = searchParams.get("capability");
  const status = searchParams.get("status");
  const limit = parseInt(searchParams.get("limit") || "100", 10);

  if (isE2EEnabled()) {
    let events = readCollection<StoredActivityEvent>("activity-events").map((event) => ({
      ...event,
      capability: event.capability || "general",
      detail: event.detail || "",
    })) as ActivityEvent[];
    if (capability) {
      events = events.filter((event) => event.capability === capability);
    }
    if (status) {
      events = events.filter((event) => event.status === status);
    }
    events.sort((a, b) => b.timestamp - a.timestamp);
    return NextResponse.json({ events: events.slice(0, limit) });
  }

  const wsDir = getWorkspaceDir();
  let records = readAuditRecords(wsDir);

  if (records.length === 0) {
    seedAuditLog(wsDir);
    records = readAuditRecords(wsDir);
  }

  let events: ActivityEvent[] = records.map((r, i) => mapRecordToEvent(r, i));

  if (capability) {
    events = events.filter((e) => e.capability === capability);
  }
  if (status) {
    events = events.filter((e) => e.status === status);
  }

  events.sort((a, b) => b.timestamp - a.timestamp);
  events = events.slice(0, limit);

  return NextResponse.json({ events });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (isE2EEnabled()) {
    const nextEvent: StoredActivityEvent = {
      id: `activity-${Date.now()}`,
      event: body.event || "Untitled event",
      capability: body.capability || "channels",
      detail: body.detail || "",
      timestamp: Date.now(),
      status: body.status || "success",
    };
    const existing = readCollection<StoredActivityEvent>("activity-events");
    writeCollection("activity-events", [nextEvent, ...existing]);
    return NextResponse.json(nextEvent);
  }

  const wsDir = getWorkspaceDir();

  auditLog.append(wsDir, {
    timestamp: new Date().toISOString(),
    event: body.event || "Untitled event",
    capability: body.capability || "channels",
    detail: { message: body.detail || "" },
  });

  return NextResponse.json({
    id: `audit-${Date.now()}`,
    event: body.event || "Untitled event",
    capability: body.capability || "channels",
    detail: body.detail || "",
    timestamp: Date.now(),
    status: body.status || "success",
  });
}
