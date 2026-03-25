/**
 * User configuration loader.
 * The source of truth lives in the OpenClaw workspace, with legacy project-config
 * files only used as a one-time migration source.
 */
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { normalizeTtsConfig } from "@clawjs/node";
import { defaultLocale, resolveLocale, type Locale } from "./i18n/messages.ts";
import { getClawJSLocalSettings } from "./local-settings.ts";
import {
  normalizeClawJSTranscriptionDbPath,
  resolveHomePath,
  resolveClawJSWorkspaceDir,
} from "./openclaw-agent.ts";

// ---- Interface ----

export interface ContextFileConfig {
  file: string;
  label: string;
  shortLabel: string;
  lastUpdated: string;
  staleAfterDays: number;
  relevanceKeywords: string[];
  relevanceChatPatterns: string[];
  promptHeader: string;
}

export interface AssistantPersonaConfig {
  name: string;
  gender: string;
  apparentAge?: "young" | "middle-aged" | "senior";
  language?: string;
}

export interface AssistantConfig {
  guidanceStyle?: "guiding" | "reflective" | "balanced";
  emotionalTone?: "warm" | "direct" | "balanced";
  depthLevel?: "surface" | "moderate" | "deep";
  exerciseFrequency?: "never" | "sometimes" | "frequent";
  metaphorUse?: "low" | "moderate" | "frequent";
  responseLength?: "brief" | "moderate" | "extended";
  formalityLevel?: "informal" | "neutral" | "formal";
  humorUse?: "never" | "occasional" | "frequent";
  progressSpeed?: "patient" | "moderate" | "direct";
  confrontationLevel?: "gentle" | "moderate" | "confrontational";
  userAutonomy?: "active-guidance" | "collaborative" | "user-led";
  crisisProtocol?: string;
  aiReminders?: "never" | "start" | "periodically";
  referralSuggestions?: boolean;
  sessionDuration?: "15min" | "30min" | "45min" | "unlimited";
  sessionStructure?: "free" | "semi-structured" | "structured";
  postSessionSummary?: boolean;
  interSessionFollowUp?: boolean;
  roles: Array<{ title: string; description: string }>;
  greeting: string;
  suggestedTopics: string[];
  focusTopics: string[];
  neverMention: string[];
  additionalGuidelines: string[];
  expertSupportUrl?: string;
}

export interface UserConfig {
  schemaVersion: number;
  locale: Locale;
  displayName: string;
  profileNameKey: string;
  profileBasics?: {
    age: string;
    gender: string;
    location: string;
    occupation: string;
  };
  assistantPersona?: AssistantPersonaConfig;
  dataSources: {
    wacliDbPath: string;
    transcriptionDbPath: string;
    activityStoreDbPath: string;
  };
  transcription?: {
    provider: "local" | "groq" | "openai";
    apiKey?: string;
    model?: string;
  };
  tts?: {
    enabled?: boolean;
    autoRead?: boolean;
    provider?: "local" | "openai" | "elevenlabs" | "deepgram";
    apiKey?: string;
    voice?: string;
    model?: string;
    speed?: number;
    stability?: number;
    similarityBoost?: number;
  };
  emailAccounts: string[];
  calendarAccounts: string[];
  contactsEnabled?: boolean;
  closeRelationMatchers: { patterns: string[] };
  workRelationMatchers: { patterns: string[] };
  excludedChats: string[];
  excludeGroups: boolean;
  anonymizeContacts?: boolean;
  whatsappAutoTranscribe?: boolean;
  telegram?: {
    enabled?: boolean;
    botToken?: string;
    botName?: string;
    botUsername?: string;
    allowedChatIds?: string[];
    syncMessages?: boolean;
  };
  slack?: {
    enabled?: boolean;
    botToken?: string;
    teamName?: string;
    botUsername?: string;
    allowedChannelIds?: string[];
    syncMessages?: boolean;
  };
  whatsappBot?: {
    enabled?: boolean;
    mode?: "wacli" | "business-api";
    phoneNumberId?: string;
    businessApiToken?: string;
  };
  imageGeneration?: {
    enabled?: boolean;
    defaultBackendId?: string;
      model?: string;
      metadata?: Record<string, string>;
  };
  priorityContacts: { patterns: string[]; exactNames: string[] };
  profileFile: string;
  contextFiles: Record<string, ContextFileConfig>;
  chat: AssistantConfig;
  assistant?: AssistantConfig;
}

export const CONFIG_SECRET_PLACEHOLDER = "••••••••";

function isConfiguredSecret(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function redactSecretValue(value: unknown): string {
  return isConfiguredSecret(value) ? CONFIG_SECRET_PLACEHOLDER : "";
}

function stripPersistedIntegrationSecrets(config: UserConfig): UserConfig {
  return {
    ...config,
    telegram: config.telegram
      ? {
          ...config.telegram,
          botToken: "",
        }
      : config.telegram,
    slack: config.slack
      ? {
          ...config.slack,
          botToken: "",
        }
      : config.slack,
  };
}

function withMergedSecretPlaceholders(input: UserConfig, existing: UserConfig): UserConfig {
  return {
    ...input,
    transcription: input.transcription
      ? {
          ...input.transcription,
          apiKey: input.transcription.apiKey === CONFIG_SECRET_PLACEHOLDER
            ? existing.transcription?.apiKey
            : input.transcription.apiKey,
        }
      : input.transcription,
    tts: input.tts
      ? {
          ...input.tts,
          apiKey: input.tts.apiKey === CONFIG_SECRET_PLACEHOLDER
            ? existing.tts?.apiKey
            : input.tts.apiKey,
        }
      : input.tts,
    whatsappBot: input.whatsappBot
      ? {
          ...input.whatsappBot,
          businessApiToken: input.whatsappBot.businessApiToken === CONFIG_SECRET_PLACEHOLDER
            ? existing.whatsappBot?.businessApiToken
            : input.whatsappBot.businessApiToken,
        }
      : input.whatsappBot,
  };
}

export function redactUserConfigForClient(config: UserConfig): UserConfig {
  return {
    ...config,
    transcription: config.transcription
      ? {
          ...config.transcription,
          apiKey: redactSecretValue(config.transcription.apiKey),
        }
      : config.transcription,
    tts: config.tts
      ? {
          ...config.tts,
          apiKey: redactSecretValue(config.tts.apiKey),
        }
      : config.tts,
    telegram: config.telegram
      ? {
          ...config.telegram,
          botToken: "",
        }
      : config.telegram,
    slack: config.slack
      ? {
          ...config.slack,
          botToken: "",
        }
      : config.slack,
    whatsappBot: config.whatsappBot
      ? {
          ...config.whatsappBot,
          businessApiToken: redactSecretValue(config.whatsappBot.businessApiToken),
        }
      : config.whatsappBot,
  };
}

// ---- Cached loader ----

let _configCache: { data: UserConfig; ts: number } | null = null;
const CONFIG_CACHE_MS = 5_000;
let _workspaceConfigEnsured = false;

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values.filter((value): value is string => typeof value === "string");
}

function normalizeAssistantConfig(input?: Partial<AssistantConfig> | null): AssistantConfig {
  return {
    ...input,
    roles: Array.isArray(input?.roles)
      ? input.roles.filter((role): role is { title: string; description: string } => (
        !!role && typeof role.title === "string" && typeof role.description === "string"
      ))
      : [],
    greeting: typeof input?.greeting === "string" ? input.greeting : "",
    suggestedTopics: normalizeStringArray(input?.suggestedTopics),
    focusTopics: normalizeStringArray(input?.focusTopics),
    neverMention: normalizeStringArray(input?.neverMention),
    additionalGuidelines: normalizeStringArray(input?.additionalGuidelines),
  };
}

function normalizeTtsSection(config: UserConfig): UserConfig {
  if (!config.tts) return config;
  return {
    ...config,
    tts: normalizeTtsConfig(config.tts),
  };
}

function normalizeAssistantPersona(input?: Partial<AssistantPersonaConfig> | null): AssistantPersonaConfig | undefined {
  if (!input || typeof input !== "object") return undefined;
  const name = typeof input.name === "string" ? input.name : "";
  const gender = typeof input.gender === "string" ? input.gender : "";
  const apparentAge = input.apparentAge;
  const language = typeof input.language === "string" && input.language.trim() ? input.language : undefined;

  if (!name && !gender && !apparentAge && !language) return undefined;

  return {
    name,
    gender,
    ...(apparentAge ? { apparentAge } : {}),
    ...(language ? { language } : {}),
  };
}

function withAssistantAliases(config: UserConfig): UserConfig {
  const assistant = normalizeAssistantConfig(config.assistant ?? config.chat);
  const assistantPersona = normalizeAssistantPersona(config.assistantPersona);

  return {
    ...config,
    chat: assistant,
    assistant,
    ...(assistantPersona ? { assistantPersona } : {}),
  };
}

function buildBlankUserConfig(): UserConfig {
  return withAssistantAliases({
    schemaVersion: 1,
    locale: defaultLocale,
    displayName: "",
    profileNameKey: "",
    dataSources: {
      wacliDbPath: "",
      transcriptionDbPath: "",
      activityStoreDbPath: path.join(resolveClawJSWorkspaceDir(), "data", "activity-store.sqlite"),
    },
    emailAccounts: [],
    calendarAccounts: [],
    closeRelationMatchers: { patterns: [] },
    workRelationMatchers: { patterns: [] },
    excludedChats: [],
    excludeGroups: false,
    priorityContacts: { patterns: [], exactNames: [] },
    profileFile: "profile.md",
    contextFiles: {},
    chat: {
      roles: [],
      greeting: "",
      suggestedTopics: [],
      focusTopics: [],
      neverMention: [],
      additionalGuidelines: [],
    },
  } as UserConfig);
}

function projectConfigDir(): string {
  return path.join(process.cwd(), "config");
}

function resolveFlexiblePath(rawPath: string): string {
  if (!rawPath.trim()) return rawPath;
  const homeResolved = resolveHomePath(rawPath);
  if (path.isAbsolute(homeResolved)) return homeResolved;
  return path.join(process.cwd(), homeResolved);
}

export function getClawJSConfigDir(): string {
  const configured = process.env.CLAWJS_LEGACY_CONFIG_DIR?.trim();
  if (configured) return resolveFlexiblePath(configured);
  return path.join(resolveClawJSWorkspaceDir(), "config");
}

export function getClawJSUserConfigPath(): string {
  return path.join(getClawJSConfigDir(), "user-config.json");
}

export function getClawJSProfileSectionsDir(): string {
  return path.join(getClawJSConfigDir(), "profile");
}

export function getClawJSContextFilesDir(): string {
  return path.join(getClawJSConfigDir(), "context-files");
}

function workspaceDataDir(): string {
  return path.join(resolveClawJSWorkspaceDir(), "data");
}

function migrateDirectoryContentsIfMissing(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      migrateDirectoryContentsIfMissing(sourcePath, targetPath);
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function migrateFileIfMissing(sourcePath: string, targetPath: string): void {
  if (fs.existsSync(targetPath) || !fs.existsSync(sourcePath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function moveFileIfMissing(sourcePath: string, targetPath: string): void {
  if (!fs.existsSync(sourcePath) || fs.existsSync(targetPath)) return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.renameSync(sourcePath, targetPath);
}

function migrateFocusTopicsToHotTopics(config: UserConfig): void {
  const hotTopicsPath = path.join(getClawJSConfigDir(), "hot-topics.json");
  if (fs.existsSync(hotTopicsPath)) return;

  // Seed from focusTopics (legacy) or suggestedTopics (onboarding selections)
  const focusTopics = config.chat?.focusTopics;
  const suggestedTopics = config.chat?.suggestedTopics;

  const sourceTopics = Array.isArray(focusTopics) && focusTopics.length > 0
    ? focusTopics
    : Array.isArray(suggestedTopics) && suggestedTopics.length > 0
      ? suggestedTopics
      : [];

  if (sourceTopics.length === 0) return;

  const tag = Array.isArray(focusTopics) && focusTopics.length > 0
    ? "migrated-from-focus-topics"
    : "onboarding";

  const now = new Date().toISOString();
  const topics = sourceTopics
    .filter((t: string) => t?.trim())
    .map((t: string) => ({
      id: crypto.randomUUID().slice(0, 8),
      title: t.trim(),
      summary: "",
      status: "active" as const,
      heat: 60,
      lastDiscussedAt: now,
      firstDetectedAt: now,
      sessionCount: 0,
      linkedPersonaIds: [],
      tags: [tag],
      assistantNotes: "",
    }));

  if (topics.length > 0) {
    fs.writeFileSync(hotTopicsPath, JSON.stringify({ version: 1, updatedAt: now, topics }, null, 2) + "\n");
  }
}

function ensureWorkspaceConfigLayout(): void {
  if (_workspaceConfigEnsured) return;

  const workspaceConfigDir = getClawJSConfigDir();
  const legacyConfigDir = projectConfigDir();
  fs.mkdirSync(workspaceConfigDir, { recursive: true });
  fs.mkdirSync(getClawJSProfileSectionsDir(), { recursive: true });
  fs.mkdirSync(getClawJSContextFilesDir(), { recursive: true });
  fs.mkdirSync(workspaceDataDir(), { recursive: true });
  fs.mkdirSync(path.join(workspaceConfigDir, "contacts"), { recursive: true });

  migrateFileIfMissing(
    path.join(legacyConfigDir, "user-config.json"),
    getClawJSUserConfigPath()
  );
  migrateFileIfMissing(
    path.join(legacyConfigDir, "user-config.example.json"),
    getClawJSUserConfigPath()
  );
  migrateFileIfMissing(
    path.join(legacyConfigDir, "profile.md"),
    path.join(workspaceConfigDir, "profile.md")
  );
  migrateFileIfMissing(
    path.join(legacyConfigDir, "profile.example.md"),
    path.join(workspaceConfigDir, "profile.md")
  );
  migrateDirectoryContentsIfMissing(
    path.join(legacyConfigDir, "profile"),
    getClawJSProfileSectionsDir()
  );
  migrateDirectoryContentsIfMissing(
    path.join(legacyConfigDir, "context-files"),
    getClawJSContextFilesDir()
  );
  migrateFileIfMissing(
    path.join(legacyConfigDir, "context-amendments.jsonl"),
    path.join(workspaceConfigDir, "context-amendments.jsonl")
  );

  if (!fs.existsSync(path.join(getClawJSContextFilesDir(), "relationships-notes.md"))) {
    fs.writeFileSync(
      path.join(getClawJSContextFilesDir(), "relationships-notes.md"),
      "Context file not configured yet.\n\nAdd notes here to customize the workspace context.\n"
    );
  }

  const configPath = getClawJSUserConfigPath();

  // Fresh install: no config file exists and no legacy file to migrate from.
  // Write a minimal default so the app can boot into onboarding.
  if (!fs.existsSync(configPath)) {
    const defaultConfig = buildBlankUserConfig();
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2) + "\n", { mode: 0o600 });

    // Also create an empty profile.md so loadProfile() doesn't crash
    const profilePath = path.join(workspaceConfigDir, "profile.md");
    if (!fs.existsSync(profilePath)) {
      fs.writeFileSync(profilePath, "");
    }
  }

  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<UserConfig> & { locale?: string };
  const migratedConfig = normalizeTtsSection(withAssistantAliases({
    ...parsed,
    assistantPersona: normalizeAssistantPersona(parsed.assistantPersona),
    profileFile: typeof parsed.profileFile === "string" && parsed.profileFile.trim()
      ? parsed.profileFile
      : "profile.md",
    dataSources: {
      wacliDbPath: typeof parsed.dataSources?.wacliDbPath === "string" ? parsed.dataSources.wacliDbPath : "",
      transcriptionDbPath: typeof parsed.dataSources?.transcriptionDbPath === "string"
        ? normalizeClawJSTranscriptionDbPath(parsed.dataSources.transcriptionDbPath)
        : normalizeClawJSTranscriptionDbPath(""),
      activityStoreDbPath: typeof parsed.dataSources?.activityStoreDbPath === "string"
        && parsed.dataSources.activityStoreDbPath.trim()
        ? parsed.dataSources.activityStoreDbPath
        : path.join(resolveClawJSWorkspaceDir(), "data", "activity-store.sqlite"),
    },
    chat: normalizeAssistantConfig((parsed as Partial<UserConfig>).assistant ?? parsed.chat),
  } as UserConfig));

  fs.writeFileSync(configPath, JSON.stringify(migratedConfig, null, 2) + "\n", { mode: 0o600 });

  // Migrate focusTopics to hot-topics.json if hot-topics.json doesn't exist yet
  migrateFocusTopicsToHotTopics(migratedConfig);

  _workspaceConfigEnsured = true;
}

function readUserConfigFromDisk(): UserConfig {
  // If the config file was deleted (e.g. workspace wiped while server runs),
  // reset the flag so ensureWorkspaceConfigLayout re-creates it.
  if (_workspaceConfigEnsured && !fs.existsSync(getClawJSUserConfigPath())) {
    _workspaceConfigEnsured = false;
  }
  ensureWorkspaceConfigLayout();
  const raw = fs.readFileSync(getClawJSUserConfigPath(), "utf-8");
  const parsed = JSON.parse(raw) as Partial<UserConfig> & { locale?: string; calendarAccount?: string };
  const localSettings = getClawJSLocalSettings();

  // Migrate legacy calendarAccount (string) → calendarAccounts (string[])
  if (typeof (parsed as Record<string, unknown>).calendarAccount === "string" && !Array.isArray(parsed.calendarAccounts)) {
    const legacy = (parsed as Record<string, unknown>).calendarAccount as string;
    parsed.calendarAccounts = legacy ? [legacy] : [];
    delete (parsed as Record<string, unknown>).calendarAccount;
  }
  const normalizedTranscriptionDbPath = typeof parsed.dataSources?.transcriptionDbPath === "string"
    ? normalizeClawJSTranscriptionDbPath(parsed.dataSources.transcriptionDbPath)
    : parsed.dataSources?.transcriptionDbPath;

  const normalizedConfig = normalizeTtsSection(withAssistantAliases({
    ...parsed,
    assistantPersona: normalizeAssistantPersona(parsed.assistantPersona),
    dataSources: {
      ...parsed.dataSources,
      ...(typeof normalizedTranscriptionDbPath === "string"
        ? { transcriptionDbPath: normalizedTranscriptionDbPath }
        : {}),
    },
    locale: resolveLocale(localSettings.locale || parsed.locale || defaultLocale),
    chat: normalizeAssistantConfig((parsed as Partial<UserConfig>).assistant ?? parsed.chat),
  } as UserConfig));
  return normalizedConfig;
}

export function getUserConfig(): UserConfig {
  if (_configCache && Date.now() - _configCache.ts < CONFIG_CACHE_MS) {
    return _configCache.data;
  }
  const data = readUserConfigFromDisk();
  _configCache = { data, ts: Date.now() };
  return data;
}

export function clearConfigCache(): void {
  _configCache = null;
  _workspaceConfigEnsured = false;
}

// ---- Path resolution ----

/** Resolves ~ to HOME and relative paths to project root */
export function resolvePath(p: string): string {
  return resolveFlexiblePath(p);
}

// ---- Helpers ----

/** Load the user's profile markdown */
export function loadProfile(): string {
  const config = getUserConfig();
  const profilePath = path.join(getClawJSConfigDir(), config.profileFile);
  return fs.readFileSync(profilePath, "utf-8");
}

/** Load a context file by id */
export function loadContextFileContent(fileId: string): string | null {
  const config = getUserConfig();
  const fileConfig = config.contextFiles[fileId];
  if (!fileConfig) return null;
  const filePath = path.join(getClawJSContextFilesDir(), fileConfig.file);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Get the amendments file path */
export function contextAmendmentsPath(): string {
  return path.join(getClawJSConfigDir(), "context-amendments.jsonl");
}

/** Get the context-files directory path */
export function contextFilesDir(): string {
  return getClawJSContextFilesDir();
}

/** Save updated config (for settings page) */
export function saveUserConfig(config: UserConfig): void {
  ensureWorkspaceConfigLayout();
  const configPath = getClawJSUserConfigPath();
  const existing = fs.existsSync(configPath) ? readUserConfigFromDisk() : buildBlankUserConfig();
  const merged = withMergedSecretPlaceholders(config, existing);
  const normalized = withAssistantAliases({
    ...merged,
    locale: resolveLocale(merged.locale),
  });
  const normalizedWithTts = stripPersistedIntegrationSecrets(normalizeTtsSection(normalized));
  fs.writeFileSync(configPath, JSON.stringify(normalizedWithTts, null, 2) + "\n", { mode: 0o600 });
  clearConfigCache();
}
