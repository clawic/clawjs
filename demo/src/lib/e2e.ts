import fs from "fs";
import path from "path";

import type { TtsCatalog } from "@clawjs/claw";

import type { IntegrationStatus } from "@/lib/app-bootstrap";
import { getClawJSLocalSettingsPath, saveClawJSLocalSettings } from "@/lib/local-settings";
import {
  generateId,
  readCollection,
  readDocument,
  resolveDemoDataDir,
  writeCollection,
  writeDocument,
  type ActivityEvent,
  type BudgetConfig,
  type CalendarEventRecord,
  type Goal,
  type InboxMessage,
  type MemoryEntry,
  type Note,
  type Plugin,
  type Routine,
  type RoutineExecution,
  type Task,
  type UsageRecord,
} from "@/lib/demo-store";
import {
  appendSessionMessage,
  createSession,
  getSession,
  listSessions,
  updateSessionTitle,
} from "@/lib/sessions";
import { clearConfigCache, getClawJSConfigDir, getUserConfig, saveUserConfig } from "@/lib/user-config";
import {
  resolveClawJSAgentDir,
  resolveClawJSSessionsDir,
  resolveClawJSWorkspaceDir,
  resolveOpenClawStateDir,
} from "@/lib/openclaw-agent";

export interface E2EAiAuthProviderInfo {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
  enabledForAgent?: boolean;
}

export interface E2EAiAuthStatus {
  cliAvailable: boolean;
  defaultModel?: string;
  providers: Record<string, E2EAiAuthProviderInfo>;
}

export interface E2ESkillDescriptor {
  id: string;
  label: string;
  enabled: boolean;
  scope?: "workspace" | "runtime" | "global";
  path?: string;
}

export interface E2ESkillSearchEntry {
  source: string;
  slug: string;
  label: string;
  summary?: string;
  installRef: string;
  homepage?: string;
}

export interface E2ESkillSourceDescriptor {
  id: string;
  label: string;
  status: "ready" | "degraded" | "unsupported";
  capabilities: { search: boolean; install: boolean; resolveExact: boolean };
  summary?: string;
  warnings?: string[];
}

export interface E2EContact {
  id: string;
  name: string;
  relationship: string;
  avatar: { type: string; value?: string };
  emoji?: string;
}

export interface E2EWorkspaceFile {
  fileName: string;
  content: string;
}

export interface E2EImageAsset {
  relativePath: string;
  filePath: string;
  exists: boolean;
  size: number | null;
  mimeType: string | null;
}

export interface E2EImageRecord {
  id: string;
  kind: string;
  status: "succeeded" | "failed";
  prompt: string;
  title: string;
  backendId: string;
  backendLabel: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
  output: E2EImageAsset | null;
  error?: string;
}

const AUTH_DOC = "e2e-auth";
const INTEGRATIONS_DOC = "e2e-integrations";
const CONTACTS_COLLECTION = "e2e-contacts";
const SKILLS_COLLECTION = "e2e-skills";
const SKILL_SOURCES_DOC = "e2e-skill-sources";
const IMAGES_COLLECTION = "e2e-images";
const WORKSPACE_FILES_DOC = "e2e-workspace-files";

const DEFAULT_PROVIDER_IDS = [
  "anthropic",
  "openai",
  "openai-codex",
  "google",
  "google-gemini-cli",
  "deepseek",
  "mistral",
  "xai",
  "groq",
  "openrouter",
  "kimi-coding",
  "qwen",
] as const;

const DEFAULT_SKILL_SOURCES: E2ESkillSourceDescriptor[] = [
  {
    id: "registry",
    label: "Registry",
    status: "ready",
    capabilities: { search: true, install: true, resolveExact: true },
    summary: "Versioned skills published by the ClawJS registry.",
  },
  {
    id: "workspace",
    label: "Workspace",
    status: "ready",
    capabilities: { search: true, install: true, resolveExact: true },
    summary: "Skills discovered in the local workspace.",
  },
];

const DEFAULT_SKILL_CATALOG: E2ESkillSearchEntry[] = [
  {
    source: "registry",
    slug: "checks",
    label: "Checks",
    summary: "Runs project checks and summarizes failures.",
    installRef: "registry:checks",
    homepage: "https://example.invalid/skills/checks",
  },
  {
    source: "registry",
    slug: "release-notes",
    label: "Release Notes",
    summary: "Collects package changes into a concise release note draft.",
    installRef: "registry:release-notes",
    homepage: "https://example.invalid/skills/release-notes",
  },
  {
    source: "workspace",
    slug: "design-review",
    label: "Design Review",
    summary: "Structured feedback for UI and product UX changes.",
    installRef: "workspace:design-review",
  },
];

const DEFAULT_WORKSPACE_FILES: E2EWorkspaceFile[] = [
  {
    fileName: "SOUL.md",
    content: "## Soul\n\nKeep ClawJS grounded, specific, and useful.",
  },
  {
    fileName: "USER.md",
    content: "## User\n\nPrefers concise analysis, deterministic tooling, and stable tests.",
  },
  {
    fileName: "IDENTITY.md",
    content: "## Identity\n\nClawJS demo workspace with deterministic fixture data.",
  },
  {
    fileName: "AGENTS.md",
    content: "## Agents\n\nKeep changes covered by browser tests.",
  },
  {
    fileName: "TOOLS.md",
    content: "## Tools\n\nUse deterministic fixtures in `CLAWJS_E2E` mode.",
  },
  {
    fileName: "HEARTBEAT.md",
    content: "## Heartbeat\n\nDaily snapshot generated during seeded E2E state.",
  },
];

const DEFAULT_TTS_CATALOG: TtsCatalog = {
  globalFields: [
    {
      key: "enabled",
      label: "Enabled",
      type: "toggle",
      defaultValue: true,
    },
  ],
  providers: [
    {
      id: "local",
      label: "Local voice",
      requiresApiKey: false,
      defaultVoice: "alloy",
      defaultModel: null,
      defaults: { voice: "alloy", speed: 1 },
      fields: [
        { key: "voice", label: "Voice", type: "text", placeholder: "alloy" },
        { key: "speed", label: "Speed", type: "number", min: 0.5, max: 2, step: 0.1, defaultValue: 1 },
      ],
    },
    {
      id: "openai",
      label: "OpenAI",
      requiresApiKey: true,
      defaultVoice: "alloy",
      defaultModel: "gpt-4o-mini-tts",
      defaults: { voice: "alloy", model: "gpt-4o-mini-tts", speed: 1 },
      fields: [
        { key: "apiKey", label: "API key", type: "password", required: true, placeholder: "sk-..." },
        { key: "voice", label: "Voice", type: "text", defaultValue: "alloy" },
        { key: "model", label: "Model", type: "text", defaultValue: "gpt-4o-mini-tts" },
      ],
    },
  ],
};

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rmIfExists(targetPath: string): void {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // Best effort cleanup for hermetic test state.
  }
}

function nowMinus(minutes: number): number {
  return Date.now() - minutes * 60_000;
}

function defaultAuthProviders(): Record<string, E2EAiAuthProviderInfo> {
  return Object.fromEntries(
    DEFAULT_PROVIDER_IDS.map((provider) => [
      provider,
      {
        provider,
        hasAuth: provider === "openai-codex",
        hasSubscription: provider === "openai-codex",
        hasApiKey: provider === "openai",
        hasProfileApiKey: provider === "openai",
        hasEnvKey: false,
        authType: provider === "openai-codex" ? "oauth" : provider === "openai" ? "api_key" : null,
        enabledForAgent: provider === "openai-codex" || provider === "openai",
      },
    ]),
  );
}

function buildDefaultAuthStatus(): E2EAiAuthStatus {
  return {
    cliAvailable: true,
    defaultModel: "openai-codex/gpt-5.4",
    providers: defaultAuthProviders(),
  };
}

function buildFreshAuthStatus(): E2EAiAuthStatus {
  return {
    cliAvailable: true,
    providers: Object.fromEntries(
      DEFAULT_PROVIDER_IDS.map((provider) => [
        provider,
        {
          provider,
          hasAuth: false,
          hasSubscription: false,
          hasApiKey: false,
          hasProfileApiKey: false,
          hasEnvKey: false,
          authType: null,
          enabledForAgent: provider === "openai"
            || provider === "anthropic"
            || provider === "google"
            || provider === "deepseek"
            || provider === "mistral"
            || provider === "xai"
            || provider === "groq"
            || provider === "openrouter",
        },
      ]),
    ),
  };
}

function buildDefaultIntegrationStatus(): IntegrationStatus {
  return {
    adapters: [
      {
        id: "openclaw",
        runtimeName: "OpenClaw",
        stability: "stable",
        supportLevel: "official",
        cliAvailable: true,
        version: "0.0.0-e2e",
        recommended: true,
        capabilities: [
          { key: "conversation_gateway", supported: true, status: "ready", strategy: "gateway", source: "fixture", probeMethod: "fixture" },
          { key: "memory", supported: true, status: "degraded", strategy: "derived", source: "fixture", probeMethod: "fixture", limitations: ["OpenClaw memory is workspace-file based in ClawJS."] },
          { key: "scheduler", supported: true, status: "degraded", strategy: "derived", source: "fixture", probeMethod: "fixture", limitations: ["Heartbeat-based scheduling only."] },
        ],
        providers: [
          { id: "openai-codex", label: "OpenAI Codex" },
          { id: "openai", label: "OpenAI" },
        ],
        channels: [
          { id: "chat", label: "Chat", kind: "core" },
          { id: "whatsapp", label: "WhatsApp", kind: "integration" },
          { id: "telegram", label: "Telegram", kind: "integration" },
          { id: "slack", label: "Slack", kind: "integration" },
        ],
        workspaceFiles: DEFAULT_WORKSPACE_FILES.map((file) => file.fileName),
        limitations: [
          "OpenClaw memory is workspace-file based in ClawJS.",
          "Heartbeat-based scheduling only.",
        ],
        hasScheduler: true,
        hasMemory: true,
        hasSandbox: true,
        hasGateway: true,
        conversation: {
          transport: "hybrid",
          fallbackTransport: "cli",
          gatewayKind: "openai-responses",
          sessionPersistence: "agent",
          sessionPath: path.join(resolveOpenClawStateDir(), "agents", "clawjs-demo-e2e", "sessions"),
        },
      },
      {
        id: "hermes",
        runtimeName: "Hermes Agent",
        stability: "experimental",
        supportLevel: "experimental",
        cliAvailable: true,
        version: "0.9.0-e2e",
        recommended: false,
        capabilities: [
          { key: "conversation_gateway", supported: true, status: "ready", strategy: "gateway", source: "fixture", probeMethod: "fixture" },
          { key: "skills", supported: true, status: "ready", strategy: "native", source: "fixture", probeMethod: "filesystem" },
          { key: "memory", supported: true, status: "ready", strategy: "bridge", source: "fixture", probeMethod: "filesystem", limitations: ["Memory inventory is mapped from ~/.hermes/memories and session storage."] },
          { key: "sandbox", supported: true, status: "degraded", strategy: "hosted", source: "fixture", probeMethod: "fixture", limitations: ["Isolation depends on the selected Hermes terminal backend."] },
        ],
        providers: [
          { id: "openai", label: "openai" },
          { id: "anthropic", label: "anthropic" },
        ],
        channels: [
          { id: "telegram", label: "Telegram", kind: "chat" },
          { id: "discord", label: "Discord", kind: "chat" },
          { id: "slack", label: "Slack", kind: "chat" },
          { id: "email", label: "Email", kind: "email" },
        ],
        workspaceFiles: ["SOUL", "USER", "SKILLS", "IDENTITY", "MEMORY"],
        limitations: [
          "Isolation depends on the selected Hermes terminal backend.",
        ],
        hasScheduler: true,
        hasMemory: true,
        hasSandbox: true,
        hasGateway: true,
        conversation: {
          transport: "hybrid",
          fallbackTransport: "cli",
          gatewayKind: "openai-chat-completions",
          sessionPersistence: "runtime",
          sessionPath: path.join(process.cwd(), ".tmp", "e2e-hermes-sessions"),
        },
      },
      {
        id: "nanobot",
        runtimeName: "Nanobot",
        stability: "experimental",
        supportLevel: "experimental",
        cliAvailable: true,
        version: "0.1.5-e2e",
        recommended: false,
        capabilities: [
          { key: "conversation_gateway", supported: true, status: "ready", strategy: "gateway", source: "fixture", probeMethod: "fixture" },
          { key: "channels", supported: true, status: "ready", strategy: "native", source: "fixture", probeMethod: "config" },
          { key: "memory", supported: true, status: "ready", strategy: "bridge", source: "fixture", probeMethod: "filesystem", limitations: ["Memory is mapped from workspace files and does not expose Nanobot Dream memory internals."] },
          { key: "sandbox", supported: true, status: "degraded", strategy: "hosted", source: "fixture", probeMethod: "fixture", limitations: ["Bubblewrap sandboxing is only available on Linux with bwrap installed."] },
        ],
        providers: [
          { id: "openrouter", label: "openrouter" },
          { id: "openai", label: "openai" },
        ],
        channels: [
          { id: "telegram", label: "Telegram", kind: "chat" },
          { id: "whatsapp", label: "WhatsApp", kind: "chat" },
          { id: "email", label: "Email", kind: "email" },
        ],
        workspaceFiles: ["SOUL", "USER", "AGENTS", "IDENTITY", "MEMORY"],
        limitations: [
          "Bubblewrap sandboxing is only available on Linux with bwrap installed.",
        ],
        hasScheduler: true,
        hasMemory: true,
        hasSandbox: true,
        hasGateway: true,
        conversation: {
          transport: "hybrid",
          fallbackTransport: "cli",
          gatewayKind: "openai-chat-completions",
          sessionPersistence: "runtime",
          sessionPath: path.join(process.cwd(), ".tmp", "e2e-nanobot-sessions"),
        },
      },
    ],
    openClaw: {
      installed: true,
      cliAvailable: true,
      agentConfigured: true,
      modelConfigured: true,
      authConfigured: true,
      ready: true,
      needsSetup: false,
      needsAuth: false,
      lastError: null,
      version: "0.0.0-e2e",
      latestVersion: "0.0.0-e2e",
      defaultModel: "openai-codex/gpt-5.4",
      context: {
        agentId: "clawjs-demo-e2e",
        workspaceDir: resolveClawJSWorkspaceDir(),
        stateDir: resolveOpenClawStateDir(),
        agentDir: resolveClawJSAgentDir(),
        agentName: "clawjs-e2e",
      },
    },
    whatsapp: {
      installed: true,
      dbExists: true,
      authenticated: true,
      authInProgress: false,
      syncing: false,
      qrText: "",
      lastError: null,
      wacliAvailable: true,
    },
    email: {
      installed: true,
      available: true,
      backend: "mock",
      enabled: true,
      accounts: [
        { id: "inbox", email: "demo@clawjs.local", displayName: "Demo Inbox", default: true },
      ],
      selectedAccountsValid: true,
      message: null,
    },
    calendar: {
      installed: true,
      available: true,
      needsPermission: false,
      backend: "mock",
      enabled: true,
      calendars: [
        { id: "calendar-main", title: "Main", writable: true },
      ],
      selectedCalendarValid: true,
      message: null,
    },
    contacts: {
      installed: true,
      available: true,
      needsPermission: false,
      backend: "mock",
      enabled: true,
      contactCount: 5,
      message: null,
    },
    transcription: { dbExists: true },
    telegram: {
      enabled: true,
      botConnected: true,
      botUsername: "clawjs_demo_bot",
      webhookUrl: "https://example.invalid/webhook",
      lastError: null,
    },
    slack: {
      enabled: true,
      botConnected: true,
      botUsername: "clawjs_demo_bot",
      teamName: "ClawJS Demo Team",
      lastError: null,
    },
  };
}

function buildFreshIntegrationStatus(): IntegrationStatus {
  return {
    ...buildDefaultIntegrationStatus(),
    openClaw: {
      installed: true,
      cliAvailable: true,
      agentConfigured: false,
      modelConfigured: false,
      authConfigured: false,
      ready: false,
      needsSetup: true,
      needsAuth: false,
      lastError: null,
      version: "0.0.0-e2e",
      latestVersion: "0.0.0-e2e",
      defaultModel: null,
      context: undefined,
    },
  };
}

function buildCleanIntegrationStatus(): IntegrationStatus {
  return {
    ...buildDefaultIntegrationStatus(),
    openClaw: {
      installed: false,
      cliAvailable: false,
      agentConfigured: false,
      modelConfigured: false,
      authConfigured: false,
      ready: false,
      needsSetup: true,
      needsAuth: false,
      lastError: null,
      version: null,
      latestVersion: null,
      defaultModel: null,
      context: undefined,
    },
  };
}

function buildSeededContacts(): E2EContact[] {
  return [
    {
      id: "contact-alex",
      name: "Alex Morgan",
      relationship: "friend",
      avatar: { type: "emoji", value: "AM" },
      emoji: "A",
    },
    {
      id: "contact-jordan",
      name: "Jordan Lee",
      relationship: "coworker",
      avatar: { type: "emoji", value: "JL" },
      emoji: "J",
    },
  ];
}

function buildSeededNotes(): Note[] {
  return [
    {
      id: "note-architecture",
      title: "Demo architecture review",
      content: "Track missing E2E flows before shipping.",
      folder: "Engineering",
      tags: ["e2e", "release"],
      linkedTaskIds: [],
      linkedSessionIds: [],
      createdAt: nowMinus(240),
      updatedAt: nowMinus(45),
    },
    {
      id: "note-onboarding",
      title: "Onboarding gaps",
      content: "Validate locale persistence and first-run happy path.",
      folder: "Product",
      tags: ["onboarding"],
      linkedTaskIds: [],
      linkedSessionIds: [],
      createdAt: nowMinus(300),
      updatedAt: nowMinus(120),
    },
  ];
}

function buildSeededGoals(): Goal[] {
  return [
    {
      id: "goal-e2e",
      title: "Harden E2E coverage",
      description: "Move the demo to deterministic end-to-end coverage.",
      progress: 40,
      status: "active",
      taskIds: ["task-chat", "task-reset"],
      createdAt: nowMinus(600),
      updatedAt: nowMinus(30),
    },
  ];
}

function buildSeededTasks(): Task[] {
  return [
    {
      id: "task-chat",
      title: "Cover chat streaming",
      description: "Assert session creation, SSE streaming, and title generation.",
      status: "in_progress",
      priority: "high",
      goalId: "goal-e2e",
      labels: ["chat", "e2e"],
      linkedSessionIds: [],
      createdAt: nowMinus(500),
      updatedAt: nowMinus(20),
    },
    {
      id: "task-reset",
      title: "Cover workspace reset",
      description: "Verify destructive flow and persistence after reload.",
      status: "backlog",
      priority: "medium",
      goalId: "goal-e2e",
      labels: ["settings"],
      linkedSessionIds: [],
      createdAt: nowMinus(520),
      updatedAt: nowMinus(60),
    },
  ];
}

function buildSeededRoutines(): Routine[] {
  return [
    {
      id: "routine-daily",
      label: "Daily summary",
      description: "Send a daily workspace summary.",
      schedule: "0 9 * * *",
      channel: "chat",
      prompt: "Summarize what changed since yesterday.",
      enabled: true,
      createdAt: nowMinus(1440),
      updatedAt: nowMinus(120),
      lastRun: nowMinus(60),
      nextRun: nowMinus(-1380),
    },
  ];
}

function buildSeededRoutineExecutions(): RoutineExecution[] {
  return [
    {
      id: "routine-exec-1",
      routineId: "routine-daily",
      status: "success",
      startedAt: nowMinus(60),
      completedAt: nowMinus(59),
      output: "Daily summary delivered.",
    },
  ];
}

function buildSeededPlugins(): Plugin[] {
  return [
    {
      id: "plugin-registry",
      name: "registry-sync",
      version: "1.0.0",
      description: "Synchronizes registry metadata into the workspace.",
      status: "active",
      config: { intervalMinutes: 30 },
      installedAt: nowMinus(10080),
      lastActivity: nowMinus(10),
    },
  ];
}

function buildSeededMemoryEntries(): MemoryEntry[] {
  return [
    {
      id: "memory-gap-analysis",
      kind: "knowledge",
      title: "Gap analysis",
      content: "The most fragile user journey is first-run onboarding plus streaming chat.",
      source: "notes",
      tags: ["analysis", "qa"],
      createdAt: nowMinus(180),
      updatedAt: nowMinus(25),
    },
    {
      id: "memory-contracts",
      kind: "index",
      title: "API contracts",
      content: "Fail tests on console errors, 4xx, 5xx, and unexpected redirects.",
      source: "tasks",
      tags: ["api"],
      createdAt: nowMinus(210),
      updatedAt: nowMinus(35),
    },
  ];
}

function buildSeededInboxMessages(): InboxMessage[] {
  return [
    {
      id: "msg-release",
      channel: "email",
      from: "release@clawjs.local",
      subject: "Release checklist",
      preview: "Browser smoke suite needs one more pass before release.",
      content: "Browser smoke suite needs one more pass before release.",
      read: false,
      timestamp: nowMinus(70),
      threadId: "thread-release",
    },
    {
      id: "msg-chat",
      channel: "telegram",
      from: "QA Bot",
      preview: "Seeded smoke suite passed in 14.2s.",
      content: "Seeded smoke suite passed in 14.2s.",
      read: true,
      timestamp: nowMinus(30),
      threadId: "thread-chat",
    },
  ];
}

function buildSeededUsageRecords(): UsageRecord[] {
  return [
    {
      id: "usage-openai",
      provider: "OpenAI",
      model: "gpt-5.4",
      tokensIn: 1900,
      tokensOut: 2100,
      estimatedCost: 0.1125,
      timestamp: nowMinus(15),
    },
  ];
}

function buildSeededBudget(): BudgetConfig {
  return {
    monthlyLimit: 100,
    warningThreshold: 80,
    enabled: true,
  };
}

function buildSeededActivity(): ActivityEvent[] {
  return [
    {
      id: "activity-chat",
      event: "chat_stream_completed",
      capability: "chat",
      detail: "Seeded assistant response streamed successfully.",
      timestamp: nowMinus(8),
      status: "success",
    },
  ];
}

function buildSeededCalendarEvents(): CalendarEventRecord[] {
  /** Helper: returns epoch‑ms for a date offset by `daysFromNow` at the given hour:minute. */
  function futureMs(daysFromNow: number, hour: number, minute = 0): number {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, minute, 0, 0);
    return d.getTime();
  }

  function evt(
    id: string,
    title: string,
    description: string,
    location: string,
    startDay: number, startHour: number, startMin: number,
    endDay: number, endHour: number, endMin: number,
  ): CalendarEventRecord {
    return {
      id,
      title,
      description,
      location,
      startsAt: futureMs(startDay, startHour, startMin),
      endsAt: futureMs(endDay, endHour, endMin),
      attendeePersonIds: [],
      linkedTaskIds: [],
      linkedNoteIds: [],
      reminders: [],
      createdAt: nowMinus(300),
      updatedAt: nowMinus(60),
    };
  }

  return [
    // ── Past events (recent history) ──
    evt("event-seed-kickoff", "Kickoff: Q2 Roadmap",
      "Align on Q2 priorities, key milestones, and resource allocation across teams.",
      "Main Auditorium", -6, 10, 0, -6, 11, 30),
    evt("event-seed-backend-guild", "Backend Guild Meetup",
      "Monthly backend guild. Topics: database migration strategy, new caching layer proposal.",
      "Conference Room C", -5, 14, 0, -5, 15, 0),
    evt("event-seed-design-critique", "Design Critique: Onboarding Flow",
      "Review the new onboarding screens. Discuss copy, illustrations, and accessibility improvements.",
      "Design Lab", -4, 11, 0, -4, 12, 0),
    evt("event-seed-security", "Security Review",
      "Quarterly security audit review. Go through pen-test findings and remediation plan.",
      "Virtual (Zoom)", -3, 15, 0, -3, 16, 30),
    evt("event-seed-lunch-learn", "Lunch & Learn: GraphQL Best Practices",
      "Informal talk on schema design, N+1 queries, and DataLoader patterns.",
      "Kitchen / Lounge", -2, 12, 30, -2, 13, 30),
    evt("event-seed-product-sync", "Product Sync",
      "Weekly product sync. Review metrics dashboard, discuss feature prioritization for next sprint.",
      "Conference Room A", -1, 10, 0, -1, 10, 45),
    evt("event-seed-1on1-past", "1:1 with Manager",
      "Weekly sync. Topics: project timeline update, hiring decisions, conference budget approval.",
      "Virtual (Teams)", -1, 16, 0, -1, 16, 30),

    // ── Today ──
    evt("event-seed-standup", "Daily Standup",
      "Quick sync: what you did yesterday, what you're doing today, any blockers.",
      "Slack Huddle", 0, 9, 15, 0, 9, 30),
    evt("event-seed-code-review", "Code Review Session",
      "Review open PRs together. Focus on the auth refactor and the new notification service.",
      "Conference Room B", 0, 11, 0, 0, 12, 0),
    evt("event-seed-lunch-mkt", "Lunch with Marketing",
      "Cross-team lunch to align on launch messaging and developer docs timeline.",
      "Cafeteria", 0, 13, 0, 0, 14, 0),
    evt("event-seed-client-demo", "Client Demo - Staging Review",
      "Walk the client through the staging environment. Show new dashboard features and API improvements.",
      "Zoom Meeting", 0, 15, 0, 0, 16, 0),
    evt("event-seed-1on1-today", "1:1 with Manager",
      "Weekly sync. Topics: project timeline update, hiring decisions, conference budget approval.",
      "Virtual (Teams)", 0, 16, 30, 0, 17, 0),

    // ── Tomorrow (+1) ──
    evt("event-seeded-planning", "Sprint Planning",
      "Review backlog, assign stories, and set sprint goal for the upcoming sprint.",
      "Conference Room B", 1, 10, 0, 1, 11, 30),
    evt("event-seed-arch-review", "Architecture Review: Event System",
      "Deep dive into the new event-driven architecture. Review sequence diagrams and failure modes.",
      "Whiteboard Room", 1, 14, 0, 1, 15, 30),

    // ── +2 days ──
    evt("event-seed-qa-handoff", "QA Handoff",
      "Walk QA through the new features. Provide test accounts, edge cases to cover, and known limitations.",
      "Virtual (Google Meet)", 2, 10, 0, 2, 10, 45),
    evt("event-seed-design-nav", "Design Review: Navigation Overhaul",
      "Review updated wireframes from Carol. Discuss navigation flow changes based on user testing feedback.",
      "Design Lab", 2, 14, 0, 2, 15, 0),

    // ── +3 days ──
    evt("event-seed-allhands", "All-Hands Meeting",
      "Company all-hands. CEO update, department highlights, Q&A session.",
      "Main Auditorium", 3, 11, 0, 3, 12, 0),
    evt("event-seed-pair-prog", "Pair Programming: API Refactor",
      "Pair on the REST → gRPC migration for the payments service. Bring your laptop.",
      "Dev Corner", 3, 14, 0, 3, 16, 0),

    // ── +4 days ──
    evt("event-seed-feedback", "Customer Feedback Review",
      "Go through latest NPS results and support tickets. Identify top pain points for next sprint.",
      "Conference Room A", 4, 10, 0, 4, 11, 0),
    evt("event-seed-infra-oh", "Infra Office Hours",
      "Open office hours with the infra team. Bring your deployment questions and scaling concerns.",
      "Virtual (Slack Huddle)", 4, 15, 0, 4, 16, 0),

    // ── +5 days ──
    evt("event-seeded-retro", "Team Retrospective",
      "End-of-sprint retro. What went well, what to improve, action items for next sprint.",
      "Conference Room A", 5, 15, 0, 5, 16, 0),

    // ── +6 days ──
    evt("event-seed-hackathon", "Hackathon Kickoff",
      "Quarterly hackathon begins! Form teams, pitch ideas, and start building.",
      "Open Space / All Floors", 6, 9, 0, 6, 18, 0),

    // ── +7 days ──
    evt("event-seed-hack-demos", "Hackathon Demos & Judging",
      "Present your hackathon projects. Judges score on creativity, impact, and technical execution.",
      "Main Auditorium", 7, 14, 0, 7, 16, 0),
  ];
}

function buildSeededImages(): E2EImageRecord[] {
  const asset = ensureFixtureImageAsset("seeded-chat-image");
  const createdAt = new Date(nowMinus(20)).toISOString();
  return [
    {
      id: "img-seeded-chat",
      kind: "image",
      status: "succeeded",
      prompt: "A clean dashboard screenshot for E2E documentation.",
      title: "Dashboard reference",
      backendId: "mock-image",
      backendLabel: "Mock image backend",
      model: "mock-v1",
      createdAt,
      updatedAt: createdAt,
      output: asset,
    },
  ];
}

function buildSeededSkills(): E2ESkillDescriptor[] {
  return [
    {
      id: "checks",
      label: "Checks",
      enabled: true,
      scope: "workspace",
      path: path.join(process.cwd(), ".codex", "skills", "checks", "SKILL.md"),
    },
  ];
}

function buildSeededWorkspaceFiles(): E2EWorkspaceFile[] {
  return DEFAULT_WORKSPACE_FILES.map((file) => ({ ...file }));
}

function buildSeededSession(): void {
  const existing = listSessions();
  if (existing.length > 0) {
    return;
  }

  const session = createSession("Release readiness");
  appendSessionMessage(session.sessionId, {
    role: "user",
    content: "Audit the demo and tell me which high-risk flows still need end-to-end coverage.",
    createdAt: nowMinus(16),
  });
  appendSessionMessage(session.sessionId, {
    role: "assistant",
    content: "The highest-risk gaps are onboarding, settings resets, streaming chat, and the mutable CRUD pages.",
    createdAt: nowMinus(15),
  });
  updateSessionTitle(session.sessionId, "Release readiness");
}

export function isE2EEnabled(): boolean {
  return process.env.CLAWJS_E2E === "1";
}

/**
 * Ensures E2E demo data is seeded exactly once per process lifetime.
 * Call this from any API route that runs in E2E mode so the demo works
 * immediately after deployment without a manual /api/e2e/seed call.
 */
let _e2eAutoSeeded = false;
export function ensureE2ESeeded(): void {
  if (!isE2EEnabled() || _e2eAutoSeeded) return;
  _e2eAutoSeeded = true;
  try {
    // If the local-settings file already exists, data was seeded previously (or
    // persisted across restarts). Skip re-seeding to avoid overwriting user changes.
    const settingsPath = getClawJSLocalSettingsPath();
    if (fs.existsSync(settingsPath)) return;
    seedE2EState("seeded");
  } catch (err) {
    console.error("[e2e] Auto-seed failed:", err);
  }
}

export function getE2EFixtureMode(): string {
  return process.env.CLAWJS_E2E_FIXTURE_MODE?.trim() || "hermetic";
}

export function isE2EExternalCallsDisabled(): boolean {
  return process.env.CLAWJS_E2E_DISABLE_EXTERNAL_CALLS === "1";
}

export function assertE2EEnabled(): void {
  if (!isE2EEnabled()) {
    throw new Error("CLAWJS_E2E is not enabled.");
  }
}

export function getE2EAiAuthStatus(): E2EAiAuthStatus {
  return readDocument<E2EAiAuthStatus>(AUTH_DOC) ?? buildDefaultAuthStatus();
}

export function setE2EAiAuthStatus(next: E2EAiAuthStatus): void {
  writeDocument(AUTH_DOC, next);
}

export function getE2EIntegrationStatus(): IntegrationStatus {
  return readDocument<IntegrationStatus>(INTEGRATIONS_DOC) ?? buildDefaultIntegrationStatus();
}

export function setE2EIntegrationStatus(next: IntegrationStatus): void {
  writeDocument(INTEGRATIONS_DOC, next);
}

export function listE2EContacts(): E2EContact[] {
  return readCollection<E2EContact>(CONTACTS_COLLECTION);
}

export function listE2ESkills(): E2ESkillDescriptor[] {
  return readCollection<E2ESkillDescriptor>(SKILLS_COLLECTION);
}

export function setE2ESkills(next: E2ESkillDescriptor[]): void {
  writeCollection(SKILLS_COLLECTION, next);
}

export function getE2ESkillSources(): E2ESkillSourceDescriptor[] {
  return readDocument<E2ESkillSourceDescriptor[]>(SKILL_SOURCES_DOC) ?? DEFAULT_SKILL_SOURCES;
}

export function listE2EImages(): E2EImageRecord[] {
  return readCollection<E2EImageRecord>(IMAGES_COLLECTION);
}

export function setE2EImages(next: E2EImageRecord[]): void {
  writeCollection(IMAGES_COLLECTION, next);
}

export function getE2EWorkspaceFiles(): E2EWorkspaceFile[] {
  return readDocument<E2EWorkspaceFile[]>(WORKSPACE_FILES_DOC) ?? buildSeededWorkspaceFiles();
}

export function setE2EWorkspaceFiles(next: E2EWorkspaceFile[]): void {
  writeDocument(WORKSPACE_FILES_DOC, next);
}

export function getE2ETtsCatalog(): TtsCatalog {
  return DEFAULT_TTS_CATALOG;
}

export function buildE2EChatBootstrap() {
  return {
    greeting: "This workspace is running in hermetic E2E mode.",
    suggestedTopics: ["Onboarding", "Chat reliability", "Settings", "Workspace CRUD"],
    hotTopicSuggestions: [
      {
        id: "topic-e2e",
        title: "E2E hardening",
        heat: 92,
        summary: "Focus on broad deterministic coverage and failure visibility.",
      },
    ],
    contextShortLabels: {
      release: "Release",
      qa: "QA",
    },
    expertSupportUrl: null,
    profileLocation: "config/profile.md",
    models: [
      { id: "openai-codex/gpt-5.4", label: "GPT-5.4", available: true },
      { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", available: true },
    ],
  };
}

const MOCK_REPLIES: string[] = [
  "Good question. I checked the current state and everything looks healthy. If you want, I can break down any part in more detail.",
  "I reviewed the available information, and the safest path is to move forward step by step. I can also turn this into a tighter summary if needed.",
  "I have it. The request was processed cleanly and the current state looks consistent. If you want to refine anything, point me to the next adjustment.",
  "There are a few workable options here. The most direct path is the one that best matches your current priorities, so I would start there.",
  "I reviewed the inputs and did not find any immediate issues. The data is consistent and ready for the next step.",
  "My recommendation is to update the moving parts first and then walk through each item in order. That keeps the process predictable and avoids gaps.",
  "The direction makes sense. I still need a couple of confirmations before locking it in, but the overall path looks sound.",
  "This can be resolved without much ceremony. The important part is to keep the focus on the highest-signal next step, so here is the proposal I would use.",
  "After reviewing everything, I would continue with the current plan. The priorities line up and the numbers look internally consistent.",
  "The simplest way to tackle this is to break it into smaller parts and clear them one by one. That usually produces the cleanest rollout.",
  "I checked the available options and there is a solid starting point here. The next move is to shape it into something concrete and easy to verify.",
  "The most efficient route is to simplify the flow without changing the outcome. Fewer steps, same result, lower coordination cost.",
  "That is a strong observation and worth using as the frame for the next decision. If we proceed from that angle, the outcome should be easier to evaluate.",
  "The quick summary is that everything is green right now. If you want a deeper pass on any specific area, I can drill into it.",
  "The best move here is a gradual approach. There is no need to add complexity before the simple path stops working.",
];

let _mockReplyIndex = 0;

export function buildE2EChatReply(_inputText: string): string {
  const reply = MOCK_REPLIES[_mockReplyIndex % MOCK_REPLIES.length];
  _mockReplyIndex++;
  return reply;
}

export function updateProviderAuth(
  provider: string,
  updates: Partial<E2EAiAuthProviderInfo>,
  defaultModel?: string,
): E2EAiAuthStatus {
  const auth = getE2EAiAuthStatus();
  const current = auth.providers[provider] ?? {
    provider,
    hasAuth: false,
    hasSubscription: false,
    hasApiKey: false,
    hasProfileApiKey: false,
    hasEnvKey: false,
    authType: null,
  };
  const next: E2EAiAuthStatus = {
    ...auth,
    ...(defaultModel ? { defaultModel } : {}),
    providers: {
      ...auth.providers,
      [provider]: {
        ...current,
        ...updates,
      },
    },
  };
  setE2EAiAuthStatus(next);
  return next;
}

export function syncAuthIntoIntegrationStatus(auth: E2EAiAuthStatus): IntegrationStatus {
  const status = getE2EIntegrationStatus();
  const hasEnabledAuth = Object.values(auth.providers).some((provider) => provider.hasAuth && provider.enabledForAgent !== false);
  const next: IntegrationStatus = {
    ...status,
    openClaw: {
      ...status.openClaw,
      authConfigured: hasEnabledAuth,
      defaultModel: auth.defaultModel ?? status.openClaw.defaultModel,
      ready: hasEnabledAuth,
      needsAuth: !hasEnabledAuth,
      lastError: null,
    },
  };
  setE2EIntegrationStatus(next);
  return next;
}

export function searchE2ESkills(query: string, limit = 30): E2ESkillSearchEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  return DEFAULT_SKILL_CATALOG
    .filter((entry) =>
      entry.label.toLowerCase().includes(normalized)
      || entry.slug.toLowerCase().includes(normalized)
      || entry.summary?.toLowerCase().includes(normalized),
    )
    .slice(0, limit);
}

export function installE2ESkill(ref: string): E2ESkillDescriptor {
  const catalogEntry = DEFAULT_SKILL_CATALOG.find((entry) => entry.installRef === ref)
    || DEFAULT_SKILL_CATALOG.find((entry) => ref.endsWith(entry.slug));
  const skills = listE2ESkills();
  const next: E2ESkillDescriptor = {
    id: catalogEntry?.slug || ref.replace(/^[^:]+:/, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
    label: catalogEntry?.label || ref,
    enabled: true,
    scope: catalogEntry?.source === "workspace" ? "workspace" : "global",
    path: catalogEntry?.source === "workspace"
      ? path.join(process.cwd(), ".codex", "skills", catalogEntry.slug, "SKILL.md")
      : undefined,
  };
  if (!skills.some((skill) => skill.id === next.id)) {
    setE2ESkills([...skills, next]);
  }
  return next;
}

export function removeE2ESkill(id: string): boolean {
  const skills = listE2ESkills();
  if (!skills.some((skill) => skill.id === id)) {
    return false;
  }
  setE2ESkills(skills.filter((skill) => skill.id !== id));
  return true;
}

export function listE2EImagesFiltered(filters: {
  limit?: number;
  status?: string | null;
  backendId?: string | null;
}): E2EImageRecord[] {
  const { limit, status, backendId } = filters;
  let images = listE2EImages();
  if (status === "succeeded" || status === "failed") {
    images = images.filter((image) => image.status === status);
  }
  if (backendId) {
    images = images.filter((image) => image.backendId === backendId);
  }
  images = [...images].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return typeof limit === "number" && Number.isFinite(limit) ? images.slice(0, limit) : images;
}

export function createE2EImage(input: {
  prompt: string;
  backendId?: string;
  model?: string;
  title?: string;
}): E2EImageRecord {
  const asset = ensureFixtureImageAsset(generateId());
  const createdAt = new Date().toISOString();
  const record: E2EImageRecord = {
    id: generateId(),
    kind: "image",
    status: "succeeded",
    prompt: input.prompt,
    title: input.title?.trim() || input.prompt.slice(0, 32),
    backendId: input.backendId || "mock-image",
    backendLabel: "Mock image backend",
    ...(input.model ? { model: input.model } : { model: "mock-v1" }),
    createdAt,
    updatedAt: createdAt,
    output: asset,
  };
  setE2EImages([record, ...listE2EImages()]);
  return record;
}

export function removeE2EImage(id: string): boolean {
  const images = listE2EImages();
  const image = images.find((item) => item.id === id);
  if (!image) return false;
  if (image.output?.filePath) {
    rmIfExists(image.output.filePath);
  }
  setE2EImages(images.filter((item) => item.id !== id));
  return true;
}

export function getE2EImage(id: string): E2EImageRecord | null {
  return listE2EImages().find((image) => image.id === id) ?? null;
}

export function updateE2EWorkspaceFile(fileName: string, content: string): boolean {
  const files = getE2EWorkspaceFiles();
  const nextFiles = files.some((file) => file.fileName === fileName)
    ? files.map((file) => file.fileName === fileName ? { ...file, content } : file)
    : [...files, { fileName, content }];
  setE2EWorkspaceFiles(nextFiles);
  return true;
}

export function createE2EStreamResponse(
  sessionId: string,
  text: string,
  debug?: { traceId: string },
): Response {
  const encoder = new TextEncoder();
  const chunks = text.match(/.{1,28}/g) ?? [text];
  const CHUNK_DELAY_MS = 60;
  const INITIAL_DELAY_MS = 400;

  const stream = new ReadableStream({
    async start(controller) {
      if (debug?.traceId) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          debug: {
            traceId: debug.traceId,
            phase: "request_ready",
            totalMs: 35,
            messageCount: 1,
            availabilityMs: 2,
            transcribeMs: 0,
            systemPromptMs: 0,
            ensureAgentMs: 4,
            getClawMs: 3,
            prompt: {
              prepMs: 0,
              emailMs: 0,
              calendarMs: 0,
              totalMs: 0,
              promptChars: 0,
            },
          },
        })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          debug: {
            traceId: debug.traceId,
            phase: "transport_selected",
            totalMs: 42,
            messageCount: 1,
            transport: "gateway",
            fallback: false,
            retries: 0,
          },
        })}\n\n`));
      }
      await new Promise((r) => setTimeout(r, INITIAL_DELAY_MS));
      if (debug?.traceId) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          debug: {
            traceId: debug.traceId,
            phase: "first_chunk",
            totalMs: INITIAL_DELAY_MS + 42,
            messageCount: 1,
            transport: "gateway",
            fallback: false,
            retries: 0,
            firstChunkMs: INITIAL_DELAY_MS,
          },
        })}\n\n`));
      }
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
        await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
      }
      if (debug?.traceId) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          debug: {
            traceId: debug.traceId,
            phase: "stream_complete",
            totalMs: INITIAL_DELAY_MS + chunks.length * CHUNK_DELAY_MS + 42,
            messageCount: 1,
            transport: "gateway",
            fallback: false,
            retries: 0,
            firstChunkMs: INITIAL_DELAY_MS,
            streamMs: INITIAL_DELAY_MS + chunks.length * CHUNK_DELAY_MS,
          },
        })}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-ClawJS-Session-Id": sessionId,
      ...(debug?.traceId ? { "X-ClawJS-Chat-Trace-Id": debug.traceId } : {}),
    },
  });
}

function writeSeededCollections(): void {
  writeCollection(CONTACTS_COLLECTION, buildSeededContacts());
  writeCollection("notes", buildSeededNotes());
  writeCollection("tasks", buildSeededTasks());
  writeCollection("goals", buildSeededGoals());
  writeCollection("routines", buildSeededRoutines());
  writeCollection("routine-executions", buildSeededRoutineExecutions());
  writeCollection("plugins", buildSeededPlugins());
  writeCollection("memory", buildSeededMemoryEntries());
  writeCollection("inbox", buildSeededInboxMessages());
  writeCollection("usage-records", buildSeededUsageRecords());
  writeCollection("activity-events", buildSeededActivity());
  writeCollection("calendar-events", buildSeededCalendarEvents());
  writeDocument("budget-config", buildSeededBudget());
  setE2ESkills(buildSeededSkills());
  writeDocument(SKILL_SOURCES_DOC, DEFAULT_SKILL_SOURCES);
  setE2EImages(buildSeededImages());
  setE2EAiAuthStatus(buildDefaultAuthStatus());
  setE2EIntegrationStatus(buildDefaultIntegrationStatus());
  setE2EWorkspaceFiles(buildSeededWorkspaceFiles());
}

function writeFreshCollections(): void {
  writeCollection(CONTACTS_COLLECTION, buildSeededContacts());
  writeCollection<Note>("notes", []);
  writeCollection<Task>("tasks", []);
  writeCollection<Goal>("goals", []);
  writeCollection<Routine>("routines", []);
  writeCollection<RoutineExecution>("routine-executions", []);
  writeCollection<Plugin>("plugins", []);
  writeCollection<MemoryEntry>("memory", []);
  writeCollection<InboxMessage>("inbox", []);
  writeCollection<UsageRecord>("usage-records", []);
  writeCollection<ActivityEvent>("activity-events", []);
  writeCollection<CalendarEventRecord>("calendar-events", buildSeededCalendarEvents());
  writeDocument("budget-config", buildSeededBudget());
  setE2ESkills([]);
  writeDocument(SKILL_SOURCES_DOC, DEFAULT_SKILL_SOURCES);
  setE2EImages([]);
  setE2EAiAuthStatus(buildFreshAuthStatus());
  setE2EIntegrationStatus(buildFreshIntegrationStatus());
  setE2EWorkspaceFiles(buildSeededWorkspaceFiles());
}

function writeCleanCollections(): void {
  writeCollection(CONTACTS_COLLECTION, buildSeededContacts());
  writeCollection<Note>("notes", []);
  writeCollection<Task>("tasks", []);
  writeCollection<Goal>("goals", []);
  writeCollection<Routine>("routines", []);
  writeCollection<RoutineExecution>("routine-executions", []);
  writeCollection<Plugin>("plugins", []);
  writeCollection<MemoryEntry>("memory", []);
  writeCollection<InboxMessage>("inbox", []);
  writeCollection<UsageRecord>("usage-records", []);
  writeCollection<ActivityEvent>("activity-events", []);
  writeCollection<CalendarEventRecord>("calendar-events", buildSeededCalendarEvents());
  writeDocument("budget-config", buildSeededBudget());
  setE2ESkills([]);
  writeDocument(SKILL_SOURCES_DOC, DEFAULT_SKILL_SOURCES);
  setE2EImages([]);
  setE2EAiAuthStatus(buildFreshAuthStatus());
  setE2EIntegrationStatus(buildCleanIntegrationStatus());
  setE2EWorkspaceFiles(buildSeededWorkspaceFiles());
}

/**
 * Pick a random image from the pool directory (pre-downloaded by seed.mjs)
 * and copy it as the fixture for this image ID. Falls back to a 1-pixel PNG
 * if no pool images are available.
 */
function ensureFixtureImageAsset(id: string): E2EImageAsset {
  const workspace = resolveClawJSWorkspaceDir();
  const imageDir = path.join(workspace, ".clawjs-e2e", "images");
  ensureDir(imageDir);
  const filePath = path.join(imageDir, `${id}.jpg`);
  if (!fs.existsSync(filePath)) {
    // Try to pick a random image from the pool
    const poolDir = path.join(workspace, "images", "_pool");
    let copied = false;
    if (fs.existsSync(poolDir)) {
      const poolFiles = fs.readdirSync(poolDir).filter((f) => f.endsWith(".jpg"));
      if (poolFiles.length > 0) {
        const pick = poolFiles[Math.floor(Math.random() * poolFiles.length)];
        fs.copyFileSync(path.join(poolDir, pick), filePath);
        copied = true;
      }
    }
    if (!copied) {
      // Fallback: 1-pixel PNG
      const fallback = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7KJcsAAAAASUVORK5CYII=",
        "base64",
      );
      fs.writeFileSync(filePath, fallback);
    }
  }
  const stat = fs.statSync(filePath);
  return {
    relativePath: path.relative(workspace, filePath),
    filePath,
    exists: true,
    size: stat.size,
    mimeType: "image/jpeg",
  };
}

export function resetE2EState(): void {
  assertE2EEnabled();
  _mockReplyIndex = 0;
  clearConfigCache();
  const targets = [
    resolveDemoDataDir(),
    getClawJSConfigDir(),
    resolveClawJSWorkspaceDir(),
    resolveClawJSAgentDir(),
    resolveClawJSSessionsDir(),
    resolveOpenClawStateDir(),
    path.dirname(getClawJSLocalSettingsPath()),
  ];
  for (const target of targets) {
    if (target && target !== ".") {
      rmIfExists(target);
    }
  }
  clearConfigCache();
}

export function seedE2EState(mode: "seeded" | "fresh" | "clean" = "seeded"): void {
  assertE2EEnabled();
  clearConfigCache();

  const config = getUserConfig();
  saveUserConfig({
    ...config,
    locale: "en",
    displayName: mode === "seeded" ? "Taylor" : "",
    profileNameKey: mode === "seeded" ? "taylor" : "",
    emailAccounts: mode === "seeded" ? ["inbox"] : [],
    calendarAccounts: mode === "seeded" ? ["calendar-main"] : [],
    telegram: {
      enabled: mode === "seeded",
      botToken: "",
      botName: mode === "seeded" ? "ClawJS Demo Bot" : "",
      botUsername: mode === "seeded" ? "clawjs_demo_bot" : "",
      allowedChatIds: [],
      syncMessages: false,
    },
    slack: {
      enabled: mode === "seeded",
      botToken: "",
      teamName: mode === "seeded" ? "ClawJS Demo Team" : "",
      botUsername: mode === "seeded" ? "clawjs_demo_bot" : "",
      allowedChannelIds: [],
      syncMessages: false,
    },
    imageGeneration: {
      enabled: true,
      defaultBackendId: "mock-image",
      model: "mock-v1",
    },
    transcription: {
      provider: "local",
    },
    tts: {
      enabled: true,
      autoRead: false,
      provider: "local",
      voice: "alloy",
      speed: 1,
    },
  });

  saveClawJSLocalSettings({
    locale: "en",
    onboardingCompleted: mode === "seeded",
    disclaimerAcceptedAt: mode === "seeded" ? new Date().toISOString() : undefined,
    sidebarOpen: true,
    openClawEnabled: true,
    theme: "light",
  });

  if (mode === "seeded") {
    writeSeededCollections();
    buildSeededSession();
  } else if (mode === "fresh") {
    writeFreshCollections();
  } else {
    writeCleanCollections();
  }

  clearConfigCache();
}
