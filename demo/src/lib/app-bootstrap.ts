import type { UserConfig } from "@/lib/user-config";
import type { ClawJSLocalSettings } from "@/lib/local-settings";

export interface Attachment {
  name: string;
  mimeType: string;
  data?: string;
  preview?: string;
}

export type ContextChipType = "person" | "style" | "notes";

export interface ContextChip {
  type: ContextChipType;
  id: string;
  label: string;
  emoji?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  contextChips?: ContextChip[];
}

export interface SessionSummary {
  sessionId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  preview: string;
}

export interface ProfileSection {
  id: string;
  group: string;
  title: string;
  description: string;
  fileName: string;
  placeholder: string;
  isPrimary?: boolean;
  path: string;
  content: string;
}

export interface AdapterStatusSummary {
  id: string;
  runtimeName: string;
  stability: string;
  supportLevel: string;
  cliAvailable: boolean;
  version: string | null;
  recommended?: boolean;
  capabilities: Array<{ key: string; supported: boolean; status: string; strategy: string }>;
  providers: Array<{ id: string; label: string }>;
  channels: Array<{ id: string; label: string; kind: string }>;
  workspaceFiles: string[];
  hasScheduler: boolean;
  hasMemory: boolean;
  hasSandbox: boolean;
  hasGateway: boolean;
}

export interface IntegrationStatus {
  adapters?: AdapterStatusSummary[];
  openClaw: {
    installed: boolean;
    cliAvailable: boolean;
    agentConfigured: boolean;
    modelConfigured: boolean;
    authConfigured: boolean;
    ready: boolean;
    needsSetup: boolean;
    needsAuth: boolean;
    lastError: string | null;
    version: string | null;
    latestVersion: string | null;
    defaultModel: string | null;
    context?: {
      agentId: string;
      workspaceDir: string;
      stateDir: string;
      agentDir: string;
      agentName?: string;
    };
  };
  whatsapp: {
    installed: boolean;
    dbExists: boolean;
    authenticated?: boolean;
    authInProgress?: boolean;
    syncing?: boolean;
    qrText?: string;
    lastError?: string | null;
    wacliAvailable?: boolean;
  };
  email: {
    installed: boolean;
    available: boolean;
    backend?: "apple-mail" | "outlook" | "mock" | "unsupported";
    accounts: Array<{
      id: string;
      email: string;
      displayName: string;
      default: boolean;
    }>;
    selectedAccountsValid: boolean;
    enabled?: boolean;
    message: string | null;
  };
  calendar: {
    installed: boolean;
    available: boolean;
    needsPermission: boolean;
    backend?: "apple-calendar" | "outlook" | "mock" | "unsupported";
    calendars: Array<{
      id: string;
      title: string;
      writable: boolean;
    }>;
    selectedCalendarValid: boolean;
    enabled?: boolean;
    message: string | null;
  };
  contacts: {
    installed: boolean;
    available: boolean;
    needsPermission: boolean;
    backend?: "apple-contacts" | "outlook" | "mock" | "unsupported";
    contactCount: number;
    enabled?: boolean;
    message: string | null;
  };
  transcription: { dbExists: boolean };
  telegram: {
    enabled: boolean;
    botConnected: boolean;
    botUsername?: string;
    webhookUrl?: string;
    lastError?: string | null;
  };
  slack: {
    enabled: boolean;
    botConnected: boolean;
    botUsername?: string;
    teamName?: string;
    lastError?: string | null;
  };
}

export interface HotTopicSuggestion {
  id: string;
  title: string;
  heat: number;
  summary: string;
}

export interface ChatBootstrapPayload {
  greeting?: string;
  suggestedTopics?: string[];
  hotTopicSuggestions?: HotTopicSuggestion[];
  contextShortLabels?: Record<string, string>;
  expertSupportUrl?: string | null;
  profileLocation?: string | null;
  models?: Array<{
    id: string;
    label: string;
    available?: boolean;
  }>;
}

export interface AiAuthProviderInfo {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: string | null;
  enabledForAgent?: boolean;
}

export interface AiAuthStatus {
  cliAvailable: boolean;
  defaultModel?: string;
  providers: Record<string, AiAuthProviderInfo>;
}

export interface AppBootstrapData {
  config: UserConfig;
  localSettings: ClawJSLocalSettings;
  profileSections: ProfileSection[];
  toolStatus: IntegrationStatus;
  chat: ChatBootstrapPayload;
  sessions: SessionSummary[];
  sessionMessages: Record<string, Message[]>;
  activeSessionId: string | null;
  aiAuth: AiAuthStatus | null;
}

let bootstrapPromise: Promise<AppBootstrapData> | null = null;
let cachedBootstrap: AppBootstrapData | null = null;

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return res.json() as Promise<T>;
}

export function getCachedAppBootstrap(): AppBootstrapData | null {
  return cachedBootstrap;
}

export function setCachedAppBootstrap(next: AppBootstrapData): AppBootstrapData {
  cachedBootstrap = next;
  return next;
}

export async function loadAppBootstrap(): Promise<AppBootstrapData> {
  if (cachedBootstrap) return cachedBootstrap;
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    const [config, localSettings, profile, toolStatus, chat, sessionsResponse, aiAuth] = await Promise.all([
      fetchJson<UserConfig>("/api/config"),
      fetchJson<ClawJSLocalSettings>("/api/config/local"),
      fetchJson<{ sections?: ProfileSection[] }>("/api/config/profile"),
      fetchJson<IntegrationStatus>("/api/integrations/status"),
      fetchJson<ChatBootstrapPayload>("/api/chat"),
      fetchJson<{ sessions?: SessionSummary[] }>("/api/chat/sessions"),
      fetchJson<AiAuthStatus>("/api/integrations/auth").catch(() => null),
    ]);

    const sessions = sortSessions(Array.isArray(sessionsResponse.sessions) ? sessionsResponse.sessions : []);
    const sessionEntries = await Promise.all(sessions.map(async (session) => {
      try {
        const sessionResponse = await fetchJson<{ session?: { messages?: Message[] } }>(
          `/api/chat/sessions/${session.sessionId}`
        );
        return [
          session.sessionId,
          Array.isArray(sessionResponse.session?.messages) ? sessionResponse.session.messages : [],
        ] as const;
      } catch {
        return [session.sessionId, []] as const;
      }
    }));
    const sessionMessages = Object.fromEntries(sessionEntries);

    return setCachedAppBootstrap({
      config,
      localSettings,
      profileSections: Array.isArray(profile.sections) ? profile.sections : [],
      toolStatus,
      chat,
      sessions,
      sessionMessages,
      activeSessionId: null,
      aiAuth: aiAuth ?? null,
    });
  })();

  try {
    return await bootstrapPromise;
  } finally {
    bootstrapPromise = null;
  }
}
