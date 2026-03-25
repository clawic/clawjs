/**
 * Simple JSON file-based persistence for demo features.
 * Each collection is stored as a separate JSON file in the workspace data directory.
 */
import fs from "fs";
import path from "path";
import os from "os";

export function resolveDemoDataDir(): string {
  const configured = process.env.CLAWJS_DEMO_DATA_DIR?.trim();
  if (!configured) {
    return path.join(os.homedir(), ".clawjs-demo", "data");
  }
  if (configured === "~") {
    return os.homedir();
  }
  if (configured.startsWith("~/")) {
    return path.join(os.homedir(), configured.slice(2));
  }
  return configured;
}

function ensureDir() {
  const dataDir = resolveDemoDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function filePath(collection: string): string {
  return path.join(resolveDemoDataDir(), `${collection}.json`);
}

export function readCollection<T>(collection: string): T[] {
  ensureDir();
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function writeCollection<T>(collection: string, data: T[]): void {
  ensureDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), "utf-8");
}

export function readDocument<T>(collection: string): T | null {
  ensureDir();
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = fs.readFileSync(fp, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeDocument<T>(collection: string, data: T): void {
  ensureDir();
  fs.writeFileSync(filePath(collection), JSON.stringify(data, null, 2), "utf-8");
}

// ── Task types ──
export interface Task {
  id: string;
  title: string;
  description: string;
  status: "backlog" | "in_progress" | "done" | "blocked";
  priority: "low" | "medium" | "high" | "urgent";
  goalId?: string;
  labels: string[];
  linkedSessionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Goal {
  id: string;
  title: string;
  description: string;
  parentId?: string;
  progress: number; // 0-100
  status: "active" | "completed" | "paused";
  taskIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ── Routine types ──
export interface Routine {
  id: string;
  label: string;
  description: string;
  schedule: string; // cron expression
  channel: string; // "chat" | "whatsapp" | "telegram" | "email"
  prompt: string;
  enabled: boolean;
  lastRun?: number;
  nextRun?: number;
  createdAt: number;
  updatedAt: number;
}

export interface RoutineExecution {
  id: string;
  routineId: string;
  status: "success" | "failure" | "running";
  startedAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

// ── Activity types ──
export interface ActivityEvent {
  id: string;
  event: string;
  capability: string;
  detail: string;
  timestamp: number;
  status: "success" | "failure" | "pending";
  metadata?: Record<string, unknown>;
}

// ── Calendar types ──
export interface CalendarEventRecord {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: number;
  endsAt: number | null;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: unknown[];
  createdAt: number;
  updatedAt: number;
}

// ── Note types ──
export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  tags: string[];
  linkedTaskIds: string[];
  linkedSessionIds: string[];
  createdAt: number;
  updatedAt: number;
}

// ── Persona types ──
export interface Persona {
  id: string;
  name: string;
  avatar: string; // emoji or initials
  role: string;
  systemPrompt: string;
  skills: string[];
  channels: string[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ── Usage types ──
export interface UsageRecord {
  id: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estimatedCost: number;
  sessionId?: string;
  taskId?: string;
  timestamp: number;
}

export interface BudgetConfig {
  monthlyLimit: number;
  warningThreshold: number; // percentage 0-100
  enabled: boolean;
}

// ── Memory types ──
export interface MemoryEntry {
  id: string;
  kind: "file" | "store" | "index" | "session" | "knowledge";
  title: string;
  content: string;
  source: string;
  sessionId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

// ── Plugin types ──
export interface Plugin {
  id: string;
  name: string;
  version: string;
  description: string;
  status: "active" | "inactive" | "error";
  config: Record<string, unknown>;
  installedAt: number;
  lastActivity?: number;
}

// ── Health types ──
export interface CapabilityHealth {
  name: string;
  status: "ready" | "degraded" | "error" | "unknown";
  lastChecked: number;
  details?: string;
  actions?: string[];
}

// ── Inbox types ──
export interface InboxMessage {
  id: string;
  channel: string;
  from: string;
  subject?: string;
  preview: string;
  content: string;
  read: boolean;
  timestamp: number;
  threadId?: string;
}

// ── Helper to generate IDs ──
export function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
