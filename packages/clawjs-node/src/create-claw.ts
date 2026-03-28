import fs from "fs";
import path from "path";

import type {
  AuthState,
  BindingDefinition,
  ChannelDescriptor,
  ClawManifest,
  ConversationPolicy,
  ConversationSearchInput,
  ConversationSearchResult,
  ConversationTransport,
  DefaultModelRef,
  IntentDomain,
  MemoryDescriptor,
  ModelCatalog,
  ModelDescriptor,
  RuntimeFeatureDescriptor,
  ObservedDomain,
  PromptContextBlock,
  ProviderDescriptor,
  ProviderCatalog,
  ProviderAuthSummary,
  RuntimeCapabilitySupport,
  RuntimeAdapterId,
  RuntimeFileDescriptor,
  SchedulerDescriptor,
  SkillCatalogEntry,
  SkillDescriptor,
  SkillInstallResult,
  SkillSearchResult,
  SkillSourceDescriptor,
  SlackChannelSummary,
  TelegramChatSummary,
  TelegramCommand,
  TelegramMemberSummary,
  TelegramUpdateEnvelope,
  WorkspaceConfig,
} from "@clawjs/core";
import {
  createTtsPlaybackPlan,
  segmentTextForTts,
  stripMarkdownForTts,
  type TtsPlaybackPlan,
} from "@clawjs/core";

import { WorkspaceAuditLog } from "./host/audit.ts";
import { NodeFileSystemHost } from "./host/filesystem.ts";
import { NodeProcessHost } from "./host/process.ts";
import { applyTemplatePack, type ApplyTemplatePackOptions } from "./files/template-pack.ts";
import { listManagedBlockProblems } from "./files/managed-blocks.ts";
import { syncBinding } from "./bindings/sync.ts";
import { renderSettingsTemplate } from "./bindings/render.ts";
import { updateBindingSettings } from "./bindings/update.ts";
import {
  readBindingStore,
  readSettingsSchemaRecord,
  readSettingsValuesRecord,
  resolveBindingsPath,
  resolveSettingsSchemaPath,
  resolveSettingsValuesPath,
  validateSettingsUpdate,
  writeBindingStore,
  writeSettingsSchemaRecord,
  writeSettingsValuesRecord,
} from "./bindings/store.ts";
import { readWorkspaceManifest, resolveManifestPath } from "./workspace/manifest.ts";
import { buildOrchestrationSnapshot } from "./orchestration.ts";
import { readCompatSnapshot, writeCompatSnapshot, resolveCompatSnapshotPath } from "./compat/store.ts";
import { buildCompatDriftReport } from "./compat/drift.ts";
import {
  readCapabilityReport,
  readChannelsStateSnapshot,
  readMemoryStateSnapshot,
  readProviderStateSnapshot,
  readSchedulerStateSnapshot,
  readSkillsStateSnapshot,
  readSlackStateSnapshot,
  readTelegramStateSnapshot,
  readWhatsAppStateSnapshot,
  readWorkspaceStateSnapshot,
  resolveCapabilityReportPath,
  resolveChannelsStatePath,
  resolveMemoryStatePath,
  resolveProviderStatePath,
  resolveSchedulerStatePath,
  resolveSkillsStatePath,
  resolveTelegramStatePath,
  resolveWorkspaceStatePath,
  writeCapabilityReport,
  writeChannelsStateSnapshot,
  writeMemoryStateSnapshot,
  writeProviderStateSnapshot,
  writeSchedulerStateSnapshot,
  writeSkillsStateSnapshot,
  writeWorkspaceStateSnapshot,
} from "./state/store.ts";
import { watchWorkspaceFile } from "./watch/index.ts";
import { watchConversationTranscript } from "./watch/transcript.ts";
import { ClawEventBus, type ClawEvent, type EventListener } from "./watch/events.ts";
import { watchProviderStatus, watchRuntimeStatus, type PollWatchOptions } from "./watch/status.ts";
import { ConversationStore } from "./conversations/store.ts";
import { streamRuntimeConversation, streamRuntimeConversationEvents, type ConversationStreamEvent } from "./conversations/stream.ts";
import { generateRuntimeConversationTitle } from "./conversations/title.ts";
import { createWorkspaceDataStore, type WorkspaceDataStore } from "./data/store.ts";
import { generateRuntimeText, type GenerateTextInput, type GenerateTextResult } from "./inference/generate-text.ts";
import {
  createGenerationStore,
  type CreateGenerationInput,
  type GenerationBackendDescriptor,
  type GenerationListOptions,
  type GenerationRecord,
  type RegisterCommandGenerationBackendInput,
} from "./generations/store.ts";
import {
  attachWorkspace,
  buildWorkspaceResetPlan,
  initializeWorkspace,
  inspectManagedWorkspaceFile,
  inspectWorkspaceFile,
  listManagedFiles,
  previewWorkspaceFile,
  readWorkspaceFile,
  repairWorkspace,
  resetWorkspace,
  resolveRuntimeFilePath,
  validateWorkspace,
  writeWorkspaceFile,
  writeWorkspaceFilePreservingManagedBlocks,
  type PreserveManagedBlocksWriteOptions,
} from "./workspace/manager.ts";
import { buildCombinedDoctorReport } from "./doctor/run.ts";
import {
  getRuntimeAdapter,
  getOpenClawGatewayStatus,
  restartOpenClawGateway,
  startOpenClawGateway,
  stopOpenClawGateway,
  waitForOpenClawGateway,
  callOpenClawGateway,
  discoverOpenClawAppContext,
  detachOpenClawAppContext,
  runOpenClawMemorySearch,
  type OpenClawAppContext,
  resolveOpenClawContext,
  type DiscoverOpenClawAppContextOptions,
  type DetachOpenClawAppContextOptions,
  type OpenClawRuntimeContext,
  type OpenClawGatewayStatus,
  type AuthDiagnostics,
  type AuthLoginPlan,
  type AuthLoginProgressEvent,
  type AuthLoginResult,
  type RuntimeAdapterOptions,
  type RuntimeCommandSpec,
  type RuntimeProgressEvent,
  type RuntimeProgressPlan,
  type RuntimeProgressSink,
  type RuntimeProbeStatus,
  type SaveApiKeyResult,
} from "./runtime/index.ts";
import { withOpenClawCommandEnv, withOpenClawCommandRunner } from "./runtime/openclaw-command.ts";
import {
  disableManagedOpenClawPlugins,
  doctorOpenClawPlugins,
  enableManagedOpenClawPlugins,
  ensureOpenClawPluginBridge,
  getOpenClawPluginBridgeStatus,
  installManagedOpenClawPlugins,
  listOpenClawHooks,
  listOpenClawPlugins,
  resolveOpenClawPluginBridgePolicy,
  updateManagedOpenClawPlugins,
  type OpenClawPluginBridgeMode,
  type OpenClawManagedPluginTarget,
} from "./runtime/plugins.ts";
import {
  getSkillSource,
  listSkillSources,
  normalizeInstallRef,
  resolveSkillSourceFromRef,
  type SkillSourceAdapter,
} from "./skills/index.ts";
import { createTelegramService, type TelegramConnectBotInput, type TelegramSendMediaInput, type TelegramSendMessageInput, type TelegramStatusResult, type TelegramWebhookConfigInput, type TelegramSyncUpdatesOptions, type TelegramBanOrRestrictInput, type TelegramInviteLinkOptions } from "./telegram/index.ts";
import { createSlackService, type SlackConnectBotInput, type SlackSendMessageInput, type SlackStatusResult } from "./slack/index.ts";
import { createWhatsAppService, type WhatsAppConnectInput, type WhatsAppSendMessageInput, type WhatsAppStatusResult } from "./whatsapp/index.ts";
import { doctorKeychain, ensureHttpSecretReference, ensureTelegramBotSecretReference, listSecrets, describeSecret, type EnsureSecretReferenceInput, type EnsureSecretReferenceResult, type SecretDoctorResult, type SecretProxyMetadata } from "./secrets/index.ts";
import { mergeManagedBlocks, type MergeManagedBlocksOptions } from "./files/managed-blocks.ts";
import {
  synthesize,
  listTtsProviders,
  getTtsCatalog,
  normalizeTtsConfig,
  type TtsCatalog,
  type TtsProviderConfig,
  type TtsSynthesizeInput,
  type TtsSynthesizeResult,
  type TtsProvider,
} from "./tts/index.ts";
import {
  patchIntentDomain,
  readAllIntentDomains,
  readIntentDomain,
  resolveIntentDomainPath,
  writeIntentDomain,
} from "./intents/store.ts";
import {
  readAllObservedDomains,
  readObservedDomain,
  resolveObservedDomainPath,
  writeObservedDomain,
} from "./observed/store.ts";

export interface CreateClawOptions {
  runtime: {
    adapter: RuntimeAdapterId;
    binaryPath?: string;
    agentDir?: string;
    homeDir?: string;
    configPath?: string;
    workspacePath?: string;
    authStorePath?: string;
    gateway?: {
      url?: string;
      token?: string;
      port?: number;
      configPath?: string;
    };
    pluginBridge?: {
      mode?: OpenClawPluginBridgeMode;
      packageSpec?: string;
      contextEnginePackageSpec?: string;
      installSource?: "npm";
      enableContextEngine?: boolean;
    };
    env?: NodeJS.ProcessEnv;
  };
  workspace: WorkspaceConfig;
  templates?: {
    pack?: string;
  };
}

export interface ClawInstance {
  runtime: {
    context: () => OpenClawRuntimeContext | null;
    status: () => Promise<RuntimeProbeStatus>;
    gateway: {
      status: () => Promise<OpenClawGatewayStatus>;
      start: () => Promise<void>;
      stop: () => Promise<void>;
      restart: () => Promise<void>;
      waitUntilReady: (options?: { timeoutMs?: number; intervalMs?: number }) => Promise<OpenClawGatewayStatus>;
      call: (method: string, params?: Record<string, unknown>, options?: { timeoutMs?: number }) => Promise<unknown>;
    };
    plugins: {
      status: () => Promise<{
        supported: boolean;
        mode: OpenClawPluginBridgeMode;
        installSource: "npm";
        configPath?: string;
        diagnostics: string[];
        plugins: object[];
        basePlugin: object;
        contextPlugin: object;
      }>;
      list: () => Promise<{
        workspaceDir?: string;
        plugins: object[];
        diagnostics: Array<{ level?: string; message?: string } | string>;
      }>;
      doctor: () => Promise<{
        ok: boolean;
        output: string;
        issues: string[];
      }>;
      install: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      enable: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      disable: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      update: (target?: OpenClawManagedPluginTarget) => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      ensure: () => Promise<{
        changed: boolean;
        restartedGateway: boolean;
        actions: string[];
        status: object;
      }>;
      clawjs: {
        status: () => Promise<unknown>;
        events: {
          list: (input?: { limit?: number; kind?: string; name?: string; sessionKey?: string; runId?: string }) => Promise<unknown>;
        };
        sessions: {
          inspect: (input: { sessionKey: string }) => Promise<unknown>;
        };
        subagent: {
          run: (input: {
            sessionKey: string;
            message: string;
            extraSystemPrompt?: string;
            lane?: string;
            deliver?: boolean;
            idempotencyKey?: string;
          }) => Promise<unknown>;
          wait: (input: { runId: string; timeoutMs?: number }) => Promise<unknown>;
          messages: (input: { sessionKey: string; limit?: number }) => Promise<unknown>;
        };
        hooks: {
          status: () => Promise<unknown>;
          list: () => Promise<unknown>;
        };
        context: {
          status: () => Promise<unknown>;
        };
        doctor: () => Promise<unknown>;
      };
    };
    install: (installer?: "npm" | "pnpm", onProgress?: RuntimeProgressSink) => Promise<void>;
    uninstall: (installer?: "npm" | "pnpm", onProgress?: RuntimeProgressSink) => Promise<void>;
    repair: (onProgress?: RuntimeProgressSink) => Promise<void>;
    setupWorkspace: (onProgress?: RuntimeProgressSink) => Promise<void>;
    installCommand: (installer?: "npm" | "pnpm") => RuntimeCommandSpec;
    uninstallCommand: (installer?: "npm" | "pnpm") => RuntimeCommandSpec;
    repairCommand: () => RuntimeCommandSpec;
    setupWorkspaceCommand: () => RuntimeCommandSpec;
      installPlan: (installer?: "npm" | "pnpm") => RuntimeProgressPlan;
      uninstallPlan: (installer?: "npm" | "pnpm") => RuntimeProgressPlan;
      repairPlan: () => RuntimeProgressPlan;
      setupWorkspacePlan: () => RuntimeProgressPlan;
      discoverContext: (options?: Omit<DiscoverOpenClawAppContextOptions, "configPath" | "stateDir" | "workspaceDir" | "agentDir" | "conversationsDir" | "env">) => OpenClawAppContext | null;
      detachWorkspace: (options?: Omit<DetachOpenClawAppContextOptions, "configPath" | "stateDir" | "workspaceDir" | "agentDir" | "conversationsDir" | "env">) => Promise<Awaited<ReturnType<typeof detachOpenClawAppContext>> | null>;
    };
  workspace: {
    init: () => Promise<void>;
    attach: () => Promise<ClawManifest | null>;
    validate: () => Promise<ReturnType<typeof validateWorkspace>>;
    repair: () => Promise<ReturnType<typeof repairWorkspace>>;
    previewReset: (options?: Parameters<typeof buildWorkspaceResetPlan>[1]) => Promise<ReturnType<typeof buildWorkspaceResetPlan>>;
    reset: (options?: Parameters<typeof resetWorkspace>[1]) => Promise<ReturnType<typeof resetWorkspace>>;
    listManagedFiles: () => Promise<string[]>;
    canonicalPaths: () => Record<string, string>;
    inspect: () => Promise<{
      manifestPath: string;
      compatSnapshotPath: string;
      capabilityReportPath: string;
      bindingsPath: string;
      settingsSchemaPath: string;
      settingsValuesPath: string;
      workspaceStatePath: string;
      providerStatePath: string;
      schedulerStatePath: string;
      memoryStatePath: string;
      skillsStatePath: string;
      channelsStatePath: string;
      telegramStatePath: string;
      intentPaths: Record<IntentDomain, string>;
      observedPaths: Record<ObservedDomain, string>;
      manifest: ReturnType<typeof readWorkspaceManifest>;
      compatSnapshot: ReturnType<typeof readCompatSnapshot>;
      capabilityReport: ReturnType<typeof readCapabilityReport>;
      workspaceState: ReturnType<typeof readWorkspaceStateSnapshot>;
      providerState: ReturnType<typeof readProviderStateSnapshot>;
      schedulerState: ReturnType<typeof readSchedulerStateSnapshot>;
      memoryState: ReturnType<typeof readMemoryStateSnapshot>;
      skillsState: ReturnType<typeof readSkillsStateSnapshot>;
      channelsState: ReturnType<typeof readChannelsStateSnapshot>;
      telegramState: ReturnType<typeof readTelegramStateSnapshot>;
      slackState: ReturnType<typeof readSlackStateSnapshot>;
      whatsappState: ReturnType<typeof readWhatsAppStateSnapshot>;
      intents: ReturnType<typeof readAllIntentDomains>;
      observed: ReturnType<typeof readAllObservedDomains>;
    }>;
  };
  intent: {
    get: (domain?: IntentDomain) => unknown;
    set: (domain: IntentDomain, value: Record<string, unknown>) => unknown;
    patch: (domain: IntentDomain, patch: Record<string, unknown>) => unknown;
    plan: (options?: { domains?: IntentDomain[]; dryRun?: boolean }) => Promise<{
      generatedAt: string;
      domains: IntentDomain[];
      dryRun: boolean;
      actions: Array<{
        domain: IntentDomain;
        featureId: string;
        ownership: RuntimeFeatureDescriptor["ownership"];
        supported: boolean;
        needsApply: boolean;
        message: string;
      }>;
    }>;
    apply: (options?: { domains?: IntentDomain[]; dryRun?: boolean }) => Promise<{
      appliedAt: string;
      domains: IntentDomain[];
      dryRun: boolean;
      actions: Array<{
        domain: IntentDomain;
        featureId: string;
        ownership: RuntimeFeatureDescriptor["ownership"];
        supported: boolean;
        status: "planned" | "applied" | "skipped" | "unsupported";
        message: string;
      }>;
    }>;
    diff: (options?: { domains?: IntentDomain[] }) => Promise<{
      generatedAt: string;
      domains: IntentDomain[];
      drifted: boolean;
      issues: Array<{
        domain: IntentDomain;
        path: string;
        message: string;
        expected?: unknown;
        actual?: unknown;
      }>;
    }>;
  };
  observed: {
    read: (domain?: ObservedDomain) => unknown;
    refresh: (options?: { domains?: ObservedDomain[] }) => Promise<unknown>;
  };
  features: {
    describe: () => RuntimeFeatureDescriptor[];
  };
  files: {
    applyTemplatePack: (templatePackPath?: string, options?: Omit<ApplyTemplatePackOptions, "workspaceDir">) => Promise<ReturnType<typeof applyTemplatePack>>;
    diffBinding: <TSettings>(binding: BindingDefinition, settings: TSettings, render: (settings: TSettings) => string) => ReturnType<typeof syncBinding<TSettings>>;
    syncBinding: <TSettings>(binding: BindingDefinition, settings: TSettings, render: (settings: TSettings) => string) => ReturnType<typeof syncBinding<TSettings>>;
    readBindingStore: () => ReturnType<typeof readBindingStore>;
    writeBindingStore: (bindings: BindingDefinition[]) => ReturnType<typeof writeBindingStore>;
    readSettingsSchema: () => ReturnType<typeof readSettingsSchemaRecord>;
    writeSettingsSchema: (settingsSchema: Record<string, unknown>) => ReturnType<typeof writeSettingsSchemaRecord>;
    readSettingsValues: () => ReturnType<typeof readSettingsValuesRecord>;
    writeSettingsValues: (values: Record<string, unknown>) => ReturnType<typeof writeSettingsValuesRecord>;
    validateSettings: (values: Record<string, unknown>) => ReturnType<typeof validateSettingsUpdate>;
    renderTemplate: (template: string, values: Record<string, unknown>) => string;
    updateSettings: (
      values: Record<string, unknown>,
      options: {
        autoSync?: boolean;
        renderers?: Record<string, (settings: Record<string, unknown>) => string>;
        reenableOptionalBindings?: string[];
      },
    ) => ReturnType<typeof updateBindingSettings>;
    readWorkspaceFile: (relativePath: string) => ReturnType<typeof readWorkspaceFile>;
    writeWorkspaceFile: (relativePath: string, content: string) => ReturnType<typeof writeWorkspaceFile>;
    writeWorkspaceFilePreservingManagedBlocks: (
      relativePath: string,
      content: string,
      options?: PreserveManagedBlocksWriteOptions,
    ) => ReturnType<typeof writeWorkspaceFilePreservingManagedBlocks>;
    previewWorkspaceFile: (relativePath: string, content: string) => ReturnType<typeof previewWorkspaceFile>;
    inspectWorkspaceFile: (relativePath: string) => ReturnType<typeof inspectWorkspaceFile>;
    inspectManagedBlock: (relativePath: string, blockId: string) => ReturnType<typeof inspectManagedWorkspaceFile>;
    mergeManagedBlocks: (originalContent: string, editedContent: string, options?: MergeManagedBlocksOptions) => string;
  };
  compat: {
    refresh: () => Promise<ReturnType<typeof writeCompatSnapshot>>;
    read: () => ReturnType<typeof readCompatSnapshot>;
  };
  doctor: {
    run: () => Promise<ReturnType<typeof buildCombinedDoctorReport>>;
  };
  models: {
    list: () => Promise<ModelDescriptor[]>;
    catalog: () => Promise<ModelCatalog>;
    getDefault: () => Promise<DefaultModelRef | null>;
    setDefault: (model: string) => Promise<string>;
  };
  providers: {
    list: () => Promise<ProviderDescriptor[]>;
    catalog: () => Promise<ProviderCatalog>;
    authState: () => Promise<AuthState>;
  };
  auth: {
    status: () => Promise<Record<string, ProviderAuthSummary>>;
    diagnostics: (provider?: string) => AuthDiagnostics;
    prepareLogin: (provider: string) => Promise<AuthLoginPlan>;
    login: (provider: string, options?: {
      setDefault?: boolean;
      env?: NodeJS.ProcessEnv;
      onProgress?: (event: AuthLoginProgressEvent) => void;
    }) => Promise<AuthLoginResult>;
    setApiKey: (provider: string, key: string, profileId?: string) => {
      profileId: string;
      provider: string;
      authType: string;
      maskedCredential?: string | null;
    };
    saveApiKey: (
      provider: string,
      key: string,
      options?: {
        profileId?: string;
        runtimeCommand?: RuntimeCommandSpec;
      },
    ) => Promise<SaveApiKeyResult>;
    removeProvider: (provider: string) => number;
  };
  scheduler: {
    list: () => Promise<SchedulerDescriptor[]>;
    run: (id: string) => Promise<void>;
    enable: (id: string) => Promise<void>;
    disable: (id: string) => Promise<void>;
  };
  memory: {
    list: () => Promise<MemoryDescriptor[]>;
    search: (query: string) => Promise<MemoryDescriptor[]>;
  };
  skills: {
    list: () => Promise<SkillDescriptor[]>;
    sync: () => Promise<SkillDescriptor[]>;
    sources: () => Promise<SkillSourceDescriptor[]>;
    search: (query: string, options?: { source?: string; limit?: number }) => Promise<SkillSearchResult>;
    install: (ref: string, options?: { source?: string }) => Promise<SkillInstallResult & { syncedSkills?: SkillDescriptor[] }>;
  };
  generations: {
    backends: () => GenerationBackendDescriptor[];
    registerCommandBackend: (input: RegisterCommandGenerationBackendInput) => GenerationBackendDescriptor;
    removeBackend: (id: string) => boolean;
    create: (input: CreateGenerationInput) => Promise<GenerationRecord>;
    list: (options?: GenerationListOptions) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  image: {
    backends: () => GenerationBackendDescriptor[];
    generate: (input: Omit<CreateGenerationInput, "kind">) => Promise<GenerationRecord>;
    list: (options?: Omit<GenerationListOptions, "kind">) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  audio: {
    backends: () => GenerationBackendDescriptor[];
    generate: (input: Omit<CreateGenerationInput, "kind">) => Promise<GenerationRecord>;
    list: (options?: Omit<GenerationListOptions, "kind">) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  video: {
    backends: () => GenerationBackendDescriptor[];
    generate: (input: Omit<CreateGenerationInput, "kind">) => Promise<GenerationRecord>;
    list: (options?: Omit<GenerationListOptions, "kind">) => GenerationRecord[];
    get: (id: string) => GenerationRecord | null;
    remove: (id: string) => boolean;
  };
  tts: {
    synthesize: (input: TtsSynthesizeInput) => Promise<TtsSynthesizeResult>;
    config: () => TtsProviderConfig;
    setConfig: (input?: TtsProviderConfig | null) => TtsProviderConfig;
    providers: () => ReturnType<typeof listTtsProviders>;
    catalog: () => TtsCatalog;
    normalizeConfig: (input?: TtsProviderConfig | null) => TtsProviderConfig;
    stripMarkdown: (text: string) => string;
    segmentText: (text: string, options?: { maxSegmentLength?: number }) => string[];
    createPlaybackPlan: (input: { text: string; maxSegmentLength?: number }) => TtsPlaybackPlan;
  };
  channels: {
    list: () => Promise<ChannelDescriptor[]>;
  };
  telegram: {
    provisionSecretReference: (input: { secretName: string; apiBaseUrl?: string; notes?: string; readOnly?: boolean }) => Promise<EnsureSecretReferenceResult>;
    connectBot: (input: TelegramConnectBotInput) => Promise<TelegramStatusResult>;
    status: () => Promise<TelegramStatusResult>;
    configureWebhook: (input: TelegramWebhookConfigInput) => Promise<TelegramStatusResult>;
    disableWebhook: (options?: { dropPendingUpdates?: boolean }) => Promise<TelegramStatusResult>;
    startPolling: (options?: TelegramSyncUpdatesOptions & { dropPendingUpdates?: boolean }) => Promise<TelegramStatusResult>;
    stopPolling: () => Promise<TelegramStatusResult>;
    setCommands: (commands: TelegramCommand[]) => Promise<TelegramCommand[]>;
    getCommands: () => Promise<TelegramCommand[]>;
    sendMessage: (input: TelegramSendMessageInput) => Promise<Record<string, unknown>>;
    sendMedia: (input: TelegramSendMediaInput) => Promise<Record<string, unknown>>;
    listChats: (query?: string) => Promise<TelegramChatSummary[]>;
    getChat: (chatId: string | number) => Promise<TelegramChatSummary>;
    getChatAdministrators: (chatId: string | number) => Promise<TelegramMemberSummary[]>;
    getChatMember: (chatId: string | number, userId: string | number) => Promise<TelegramMemberSummary>;
    setChatPermissions: (chatId: string | number, permissions: Record<string, boolean>) => Promise<boolean>;
    banOrRestrictMember: (input: TelegramBanOrRestrictInput) => Promise<boolean>;
    createInviteLink: (chatId: string | number, options?: TelegramInviteLinkOptions) => Promise<Record<string, unknown>>;
    revokeInviteLink: (chatId: string | number, inviteLink: string) => Promise<Record<string, unknown>>;
    syncUpdates: (options?: TelegramSyncUpdatesOptions) => Promise<TelegramUpdateEnvelope[]>;
    ingestUpdate: (update: Record<string, unknown>) => Promise<TelegramUpdateEnvelope | null>;
  };
  slack: {
    connectBot: (input: SlackConnectBotInput) => Promise<SlackStatusResult>;
    status: () => Promise<SlackStatusResult>;
    sendMessage: (input: SlackSendMessageInput) => Promise<Record<string, unknown>>;
    listChannels: (query?: string) => Promise<SlackChannelSummary[]>;
    getChannel: (channelId: string) => Promise<SlackChannelSummary>;
  };
  whatsapp: {
    connect: (input: WhatsAppConnectInput) => Promise<WhatsAppStatusResult>;
    status: () => Promise<WhatsAppStatusResult>;
    sendMessage: (input: WhatsAppSendMessageInput) => Promise<Record<string, unknown>>;
    disconnect: () => Promise<WhatsAppStatusResult>;
  };
  inference: {
    generateText: (input: GenerateTextInput) => Promise<GenerateTextResult>;
  };
  secrets: {
    list: (search?: string) => Promise<SecretProxyMetadata[]>;
    describe: (name: string) => Promise<SecretProxyMetadata | null>;
    doctorKeychain: () => Promise<SecretDoctorResult>;
    ensureHttpReference: (input: EnsureSecretReferenceInput) => Promise<EnsureSecretReferenceResult>;
    ensureTelegramBotReference: (input: { name: string; apiBaseUrl?: string; notes?: string; readOnly?: boolean }) => Promise<EnsureSecretReferenceResult>;
  };
  conversations: {
    createSession: (title?: string) => ReturnType<ConversationStore["createSession"]>;
    appendMessage: ConversationStore["appendMessage"];
    listSessions: ConversationStore["listSessions"];
    searchSessions: (input: ConversationSearchInput) => Promise<ConversationSearchResult[]>;
    getSession: ConversationStore["getSession"];
    updateSessionTitle: ConversationStore["updateSessionTitle"];
    generateTitle: (input: {
      sessionId: string;
      transport?: "auto" | "gateway" | "cli";
    }) => Promise<string>;
    streamAssistantReplyEvents: (input: {
      sessionId: string;
      systemPrompt?: string;
      contextBlocks?: PromptContextBlock[];
      transport?: "auto" | "gateway" | "cli";
      chunkSize?: number;
      gatewayRetries?: number;
      signal?: AbortSignal;
    }) => AsyncGenerator<ConversationStreamEvent>;
    streamAssistantReply: (input: {
      sessionId: string;
      systemPrompt?: string;
      contextBlocks?: PromptContextBlock[];
      transport?: "auto" | "gateway" | "cli";
      chunkSize?: number;
      gatewayRetries?: number;
      signal?: AbortSignal;
    }) => AsyncGenerator<{ sessionId: string; messageId?: string; delta: string; done: boolean }>;
  };
  data: WorkspaceDataStore;
  orchestration: {
    snapshot: () => Promise<ReturnType<typeof buildOrchestrationSnapshot>>;
  };
  watch: {
    file: (
      fileName: string,
      callback: Parameters<typeof watchWorkspaceFile>[2],
      options?: Parameters<typeof watchWorkspaceFile>[3],
    ) => ReturnType<typeof watchWorkspaceFile>;
    transcript: (
      sessionId: string,
      callback: Parameters<typeof watchConversationTranscript>[2],
      options?: Parameters<typeof watchConversationTranscript>[3],
    ) => ReturnType<typeof watchConversationTranscript>;
    runtimeStatus: (
      callback: (status: RuntimeProbeStatus) => void,
      options?: PollWatchOptions,
    ) => ReturnType<typeof watchRuntimeStatus>;
    providerStatus: (
      callback: (providers: Record<string, ProviderAuthSummary>) => void,
      options?: PollWatchOptions,
    ) => ReturnType<typeof watchProviderStatus>;
    events: (type: string, listener: EventListener) => () => void;
    eventsIterator: (type?: string) => AsyncIterable<ClawEvent>;
  };
}

export interface ClawFactory {
  (options: CreateClawOptions): Promise<ClawInstance>;
  create: (options: CreateClawOptions) => Promise<ClawInstance>;
}

function buildCanonicalPathMap(workspaceDir: string, runtimeFiles: RuntimeFileDescriptor[]): Record<string, string> {
  return Object.fromEntries(
    runtimeFiles.map((descriptor) => [descriptor.key, resolveRuntimeFilePath(workspaceDir, descriptor.path)]),
  );
}

function extractSessionIdFromSourcePath(sourcePath?: string): string | null {
  const trimmed = sourcePath?.trim();
  if (!trimmed) return null;
  const fileName = path.basename(trimmed);
  if (!fileName.endsWith(".jsonl")) return null;
  return fileName.slice(0, -".jsonl".length) || null;
}

export async function createClaw(options: CreateClawOptions): Promise<ClawInstance> {
  const filesystem = new NodeFileSystemHost();
  const baseProcessHost = new NodeProcessHost();
  const audit = new WorkspaceAuditLog(filesystem);
  const workspaceDir = options.workspace.rootDir;
  const conversationStore = new ConversationStore(workspaceDir, { filesystem });
  const dataStore = createWorkspaceDataStore(workspaceDir, filesystem);
  const adapter = getRuntimeAdapter(options.runtime.adapter);
  const runtimeEnv = adapter.id === "openclaw"
    ? withOpenClawCommandEnv(options.runtime.env, {
        binaryPath: options.runtime.binaryPath,
        homeDir: options.runtime.homeDir,
        configPath: options.runtime.configPath,
      })
    : options.runtime.env;
  const processHost = adapter.id === "openclaw"
    ? withOpenClawCommandRunner(baseProcessHost, {
        binaryPath: options.runtime.binaryPath,
        homeDir: options.runtime.homeDir,
        configPath: options.runtime.configPath,
        env: runtimeEnv,
      })
    : baseProcessHost;
  const generationStore = createGenerationStore({
    workspaceDir,
    runtimeAdapter: options.runtime.adapter,
    filesystem,
    processHost,
    dataStore,
    env: runtimeEnv,
  });
  const eventBus = new ClawEventBus();
  const runtimeOptions: RuntimeAdapterOptions = {
    adapter: adapter.id,
    binaryPath: options.runtime.binaryPath,
    agentId: options.workspace.agentId,
    agentDir: options.runtime.agentDir,
    homeDir: options.runtime.homeDir,
    configPath: options.runtime.configPath,
    workspacePath: options.runtime.workspacePath ?? workspaceDir,
    authStorePath: options.runtime.authStorePath,
    gateway: options.runtime.gateway,
    env: runtimeEnv,
  };
  const resolvedLocations = adapter.resolveLocations(runtimeOptions);
  const resolvedRuntimeOptions: RuntimeAdapterOptions = {
    ...runtimeOptions,
    homeDir: runtimeOptions.homeDir ?? resolvedLocations.homeDir,
    configPath: runtimeOptions.configPath ?? resolvedLocations.configPath,
    workspacePath: runtimeOptions.workspacePath ?? resolvedLocations.workspacePath,
    authStorePath: runtimeOptions.authStorePath ?? resolvedLocations.authStorePath,
    gateway: {
      ...options.runtime.gateway,
      configPath: options.runtime.gateway?.configPath ?? resolvedLocations.gatewayConfigPath,
    },
  };
  const pluginBridgePolicy = resolveOpenClawPluginBridgePolicy(adapter.id, options.runtime.pluginBridge);
  const conversationAdapter = adapter.createConversationAdapter(resolvedRuntimeOptions);
  const runtimeContext = adapter.id === "openclaw"
    ? resolveOpenClawContext({
        agentId: options.workspace.agentId,
        configPath: resolvedRuntimeOptions.gateway?.configPath ?? resolvedRuntimeOptions.configPath,
        stateDir: resolvedRuntimeOptions.homeDir,
        workspaceDir,
        agentDir: resolvedRuntimeOptions.agentDir,
        env: resolvedRuntimeOptions.env,
        ...(resolvedRuntimeOptions.gateway ?? {}),
      })
    : null;
  const telegram = createTelegramService({
    workspaceDir,
    dataStore,
    conversationStore,
    runner: processHost,
    env: resolvedRuntimeOptions.env,
    filesystem,
  });
  const slack = createSlackService({
    workspaceDir,
    dataStore,
    conversationStore,
    runner: processHost,
    env: resolvedRuntimeOptions.env,
    filesystem,
  });
  const whatsapp = createWhatsAppService({
    workspaceDir,
    dataStore,
    conversationStore,
    runner: processHost,
    env: resolvedRuntimeOptions.env,
    filesystem,
  });

  function registerGenerationBackend(input: RegisterCommandGenerationBackendInput): GenerationBackendDescriptor {
    const backend = generationStore.registerCommandBackend(input);
    appendAuditEvent("generations.backend_registered", "file_sync", {
      backendId: backend.id,
      supportedKinds: backend.supportedKinds.join(","),
    });
    eventBus.emit("generations.backend_registered", {
      backendId: backend.id,
      supportedKinds: backend.supportedKinds,
    });
    return backend;
  }

  function removeGenerationBackend(id: string): boolean {
    const removed = generationStore.removeBackend(id);
    if (removed) {
      appendAuditEvent("generations.backend_removed", "file_sync", { backendId: id });
      eventBus.emit("generations.backend_removed", { backendId: id });
    }
    return removed;
  }

  async function createGenerationRecord(input: CreateGenerationInput): Promise<GenerationRecord> {
    const record = await generationStore.create(input);
    appendAuditEvent("generations.created", "file_sync", {
      generationId: record.id,
      kind: record.kind,
      backendId: record.backendId,
      status: record.status,
    });
    eventBus.emit("generations.created", {
      generationId: record.id,
      kind: record.kind,
      backendId: record.backendId,
      status: record.status,
    });
    return record;
  }

  function removeGenerationRecord(id: string): boolean {
    const removed = generationStore.remove(id);
    if (removed) {
      appendAuditEvent("generations.removed", "file_sync", { generationId: id });
      eventBus.emit("generations.removed", { generationId: id });
    }
    return removed;
  }

  function createTypedGenerationFacade(kind: "image" | "audio" | "video") {
    return {
      backends: () => generationStore.listBackends().filter((backend) => backend.supportedKinds.includes(kind)),
      generate: (input: Omit<CreateGenerationInput, "kind">) => createGenerationRecord({ ...input, kind }),
      list: (options: Omit<GenerationListOptions, "kind"> = {}) => generationStore.list({ ...options, kind }),
      get: (id: string) => {
        const record = generationStore.get(id);
        return record?.kind === kind ? record : null;
      },
      remove: (id: string) => {
        const record = generationStore.get(id);
        if (!record || record.kind !== kind) return false;
        return removeGenerationRecord(id);
      },
    };
  }

  function gatewayConfigOptions() {
    return {
      configPath: runtimeContext?.configPath ?? resolvedRuntimeOptions.gateway?.configPath ?? resolvedRuntimeOptions.configPath,
      env: resolvedRuntimeOptions.env,
      ...(resolvedRuntimeOptions.gateway ?? {}),
    };
  }

  function assertOpenClawGatewaySupport(): void {
    if (adapter.id !== "openclaw") {
      throw new Error(`runtime.gateway is only supported for the openclaw adapter, received ${adapter.id}`);
    }
  }

  function appendAuditEvent(event: string, capability: Parameters<WorkspaceAuditLog["append"]>[1]["capability"], detail?: Record<string, unknown>) {
    audit.append(workspaceDir, {
      timestamp: new Date().toISOString(),
      event,
      capability,
      detail,
    });
  }

  function listWorkspaceSkillPaths(): string[] {
    const skillsDir = path.join(workspaceDir, "skills");
    try {
      return fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => path.join(skillsDir, entry.name))
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  }

  function diffWorkspaceSkillPaths(before: string[], after: string[]): string[] {
    const beforeSet = new Set(before);
    return after.filter((entry) => !beforeSet.has(entry));
  }

  async function readSkillSources(): Promise<SkillSourceDescriptor[]> {
    return Promise.all(
      listSkillSources().map((source) => source.status({
        runner: processHost,
        workspaceDir,
        env: resolvedRuntimeOptions.env,
      }))
    );
  }

  async function resolveReadySkillSource(sourceId: string): Promise<SkillSourceAdapter> {
    return getSkillSource(sourceId);
  }

  async function searchSkillCatalog(query: string, options: { source?: string; limit?: number } = {}): Promise<SkillSearchResult> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return {
        query: trimmedQuery,
        entries: [],
        sources: await readSkillSources(),
        warnings: ["Query is empty."],
      };
    }

    const descriptors = await readSkillSources();
    const requestedSource = options.source?.trim();
    const omittedSources: Array<{ source: string; reason: string }> = [];
    const warnings: string[] = [];
    const entries: SkillCatalogEntry[] = [];

    const targets = requestedSource
      ? descriptors.filter((descriptor) => descriptor.id === requestedSource)
      : descriptors;

    if (requestedSource && targets.length === 0) {
      throw new Error(`Unsupported skill source: ${requestedSource}`);
    }

    for (const descriptor of targets) {
      const source = getSkillSource(descriptor.id);

      if (source.search && descriptor.capabilities.search) {
        try {
          const result = await source.search(trimmedQuery, { limit: options.limit }, {
            runner: processHost,
            workspaceDir,
            env: resolvedRuntimeOptions.env,
          });
          entries.push(...result.entries);
          warnings.push(...(result.warnings ?? []));
        } catch (error) {
          omittedSources.push({
            source: descriptor.id,
            reason: error instanceof Error ? error.message : "Search failed.",
          });
        }
        continue;
      }

      if (requestedSource && source.resolveExact && descriptor.capabilities.resolveExact) {
        try {
          const resolved = await source.resolveExact(trimmedQuery, {
            runner: processHost,
            workspaceDir,
            env: resolvedRuntimeOptions.env,
          });
          if (resolved) {
            entries.push(resolved);
          } else {
            omittedSources.push({
              source: descriptor.id,
              reason: "This source supports exact refs only in v1.",
            });
          }
        } catch (error) {
          omittedSources.push({
            source: descriptor.id,
            reason: error instanceof Error ? error.message : "Exact resolution failed.",
          });
        }
        continue;
      }

      omittedSources.push({
        source: descriptor.id,
        reason: "General text search is not supported for this source in v1.",
      });
    }

    return {
      query: trimmedQuery,
      entries,
      sources: descriptors,
      ...(omittedSources.length > 0 ? { omittedSources } : {}),
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  async function installSkillFromSource(ref: string, options: { source?: string } = {}): Promise<SkillInstallResult & { syncedSkills?: SkillDescriptor[] }> {
    const normalizedRef = normalizeInstallRef(ref);
    if (!normalizedRef) {
      throw new Error("Skill ref is required.");
    }

    const sourceId = options.source?.trim() || resolveSkillSourceFromRef(ref)?.id;
    if (!sourceId) {
      throw new Error("Unable to infer a skill source from the ref. Pass { source } explicitly.");
    }

    const source = await resolveReadySkillSource(sourceId);
    const beforePaths = listWorkspaceSkillPaths();
    const result = await source.install(normalizedRef, {
      runner: processHost,
      workspaceDir,
      env: resolvedRuntimeOptions.env,
    });
    const afterPaths = listWorkspaceSkillPaths();
    const detectedPaths = diffWorkspaceSkillPaths(beforePaths, afterPaths);
    const installedPaths = result.installedPaths && result.installedPaths.length > 0
      ? result.installedPaths
      : detectedPaths;

    let runtimeVisibility = result.runtimeVisibility;
    if (installedPaths.length > 0) {
      runtimeVisibility = "runtime";
    }

    const finalResult: SkillInstallResult & { syncedSkills?: SkillDescriptor[] } = {
      ...result,
      runtimeVisibility,
      ...(installedPaths.length > 0 ? { installedPaths } : {}),
    };

    if (runtimeVisibility === "runtime" || runtimeVisibility === "unknown") {
      const syncedSkills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
      persistSkillsState(syncedSkills);
      appendAuditEvent("skills.synced", "skills", { count: syncedSkills.length, runtimeAdapter: adapter.id });
      eventBus.emit("skills.synced", { count: syncedSkills.length, runtimeAdapter: adapter.id });
      finalResult.syncedSkills = syncedSkills;
      if (syncedSkills.length > 0 && runtimeVisibility === "unknown") {
        finalResult.runtimeVisibility = "runtime";
      }
    }

    appendAuditEvent("skills.installed", "skills", {
      source: finalResult.source,
      slug: finalResult.slug,
      runtimeVisibility: finalResult.runtimeVisibility,
      runtimeAdapter: adapter.id,
    });
    eventBus.emit("skills.installed", {
      source: finalResult.source,
      slug: finalResult.slug,
      runtimeVisibility: finalResult.runtimeVisibility,
      runtimeAdapter: adapter.id,
    });

    return finalResult;
  }

  async function readProviderAuth(): Promise<Record<string, ProviderAuthSummary>> {
    try {
      return await adapter.getProviderAuth(processHost, resolvedRuntimeOptions);
    } catch {
      return {};
    }
  }

  async function readDefaultModel(): Promise<DefaultModelRef | null> {
    try {
      return await adapter.getDefaultModel(processHost, resolvedRuntimeOptions);
    } catch {
      return null;
    }
  }

  async function readProviderCatalog(): Promise<ProviderCatalog> {
    try {
      return await adapter.getProviderCatalog(processHost, resolvedRuntimeOptions);
    } catch {
      return { providers: [] };
    }
  }

  function resolveRequestedAuthProvider(provider: string): string {
    const requested = provider.trim();
    if (!requested) return requested;
    const diagnostics = adapter.diagnostics(requested, resolvedRuntimeOptions) as AuthDiagnostics & {
      resolvedOauthProvider?: string | null;
    };
    return diagnostics.resolvedOauthProvider?.trim() || requested;
  }

  async function prepareAuthLogin(provider: string): Promise<AuthLoginPlan> {
    const requestedProvider = provider.trim();
    const resolvedProvider = resolveRequestedAuthProvider(requestedProvider);

    if (typeof adapter.prepareLogin === "function") {
      const prepared = await adapter.prepareLogin(requestedProvider, processHost, resolvedRuntimeOptions).catch(() => null);
      if (prepared) {
        return prepared;
      }
    }

    const summaries = await readProviderAuth();
    const current = summaries[resolvedProvider] ?? summaries[requestedProvider];
    if (current?.hasAuth && current.hasSubscription) {
      return {
        requestedProvider,
        provider: current.provider,
        status: "reused",
        hasExistingAuth: true,
        launchMode: "none",
        message: "Existing provider auth is already available.",
      };
    }

    return {
      requestedProvider,
      provider: resolvedProvider,
      status: "launch_required",
      hasExistingAuth: false,
      launchMode: adapter.id === "openclaw" ? "browser" : "unknown",
      message: "Interactive sign-in is required.",
    };
  }

  async function readModelCatalog(): Promise<ModelCatalog> {
    try {
      return await adapter.getModelCatalog(processHost, resolvedRuntimeOptions);
    } catch {
      return { models: [], defaultModel: null };
    }
  }

  async function readAuthState(): Promise<AuthState> {
    try {
      return await adapter.getAuthState(processHost, resolvedRuntimeOptions);
    } catch {
      return { providers: {} };
    }
  }

  async function readSchedulers(): Promise<SchedulerDescriptor[]> {
    try {
      return await adapter.listSchedulers(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readMemory(): Promise<MemoryDescriptor[]> {
    try {
      return await adapter.listMemory(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readSkills(): Promise<SkillDescriptor[]> {
    try {
      return await adapter.listSkills(processHost, resolvedRuntimeOptions);
    } catch {
      return [];
    }
  }

  async function readChannels(): Promise<ChannelDescriptor[]> {
    const telegramChannel = telegram.channel();
    const slackChannel = slack.channel();
    const whatsappChannel = whatsapp.channel();
    try {
      const channels = await adapter.listChannels(processHost, resolvedRuntimeOptions);
      const runtimeChannelMap = new Map(channels.map((channel) => [channel.id, channel]));
      const filtered = channels.filter((channel) => channel.id !== "telegram" && channel.id !== "slack" && channel.id !== "whatsapp");
      const result = [...filtered];
      const shouldUseLocalTelegram = telegramChannel.status !== "disconnected" || !!readTelegramStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalTelegram) {
        result.push(telegramChannel);
      } else if (runtimeChannelMap.has("telegram")) {
        result.push(runtimeChannelMap.get("telegram")!);
      }
      const shouldUseLocalSlack = slackChannel.status !== "disconnected" || !!readSlackStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalSlack) {
        result.push(slackChannel);
      } else if (runtimeChannelMap.has("slack")) {
        result.push(runtimeChannelMap.get("slack")!);
      }
      const shouldUseLocalWhatsApp = whatsappChannel.status !== "disconnected" || !!readWhatsAppStateSnapshot(workspaceDir, filesystem);
      if (shouldUseLocalWhatsApp) {
        result.push(whatsappChannel);
      } else if (runtimeChannelMap.has("whatsapp")) {
        result.push(runtimeChannelMap.get("whatsapp")!);
      }
      return result;
    } catch {
      const result: ChannelDescriptor[] = [];
      if (telegramChannel.status !== "disconnected" || readTelegramStateSnapshot(workspaceDir, filesystem)) {
        result.push(telegramChannel);
      }
      if (slackChannel.status !== "disconnected" || readSlackStateSnapshot(workspaceDir, filesystem)) {
        result.push(slackChannel);
      }
      if (whatsappChannel.status !== "disconnected" || readWhatsAppStateSnapshot(workspaceDir, filesystem)) {
        result.push(whatsappChannel);
      }
      return result;
    }
  }

  function searchSessionsLocally(input: ConversationSearchInput): ConversationSearchResult[] {
    return conversationStore.searchSessions(input.query, {
      limit: input.limit,
      includeMessages: input.includeMessages,
    });
  }

  async function searchSessionsWithOpenClawMemory(input: ConversationSearchInput): Promise<ConversationSearchResult[]> {
    const hits = await runOpenClawMemorySearch(input.query, processHost, {
      agentId: options.workspace.agentId,
      limit: input.limit,
      minScore: input.minScore,
      env: resolvedRuntimeOptions.env,
    });

    const bestHitBySession = new Map<string, ConversationSearchResult>();
    for (const hit of hits) {
      const sessionId = extractSessionIdFromSourcePath(hit.path);
      if (!sessionId) continue;
      const session = conversationStore.getSession(sessionId);
      if (!session) continue;

      const candidate: ConversationSearchResult = {
        sessionId: session.sessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messageCount: session.messageCount,
        preview: session.preview,
        snippet: hit.text,
        score: hit.score ?? 0,
        strategy: "openclaw-memory",
        matchedFields: ["memory"],
        ...(hit.path ? { sourcePath: hit.path } : {}),
        ...(typeof hit.startLine === "number" ? { startLine: hit.startLine } : {}),
        ...(typeof hit.endLine === "number" ? { endLine: hit.endLine } : {}),
      };

      const existing = bestHitBySession.get(sessionId);
      if (!existing || candidate.score > existing.score) {
        bestHitBySession.set(sessionId, candidate);
      }
    }

    return [...bestHitBySession.values()]
      .sort((left, right) => (
        right.score - left.score
        || right.updatedAt - left.updatedAt
        || right.createdAt - left.createdAt
        || right.sessionId.localeCompare(left.sessionId)
      ))
      .slice(0, Math.max(1, input.limit ?? 20));
  }

  async function searchConversationSessions(input: ConversationSearchInput): Promise<ConversationSearchResult[]> {
    const normalizedInput: ConversationSearchInput = {
      strategy: "auto",
      includeMessages: true,
      fallbackToLocal: true,
      limit: 20,
      ...input,
      query: input.query.trim(),
    };

    if (!normalizedInput.query) {
      return [];
    }

    const strategy = normalizedInput.strategy ?? "auto";
    if (strategy === "local") {
      return searchSessionsLocally(normalizedInput);
    }

    if (strategy === "openclaw-memory" || strategy === "auto") {
      const canUseOpenClawMemory = adapter.id === "openclaw";
      if (canUseOpenClawMemory) {
        try {
          const results = await searchSessionsWithOpenClawMemory(normalizedInput);
          if (results.length > 0 || normalizedInput.fallbackToLocal === false) {
            return results;
          }
        } catch (error) {
          if (strategy === "openclaw-memory" && normalizedInput.fallbackToLocal === false) {
            throw error;
          }
        }
      } else if (strategy === "openclaw-memory" && normalizedInput.fallbackToLocal === false) {
        throw new Error(`openclaw-memory search requires the openclaw adapter, received ${adapter.id}`);
      }
    }

    return searchSessionsLocally(normalizedInput);
  }

  function persistWorkspaceState(validation: ReturnType<typeof validateWorkspace>) {
    return writeWorkspaceStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      appId: options.workspace.appId,
      workspaceId: options.workspace.workspaceId,
      agentId: options.workspace.agentId,
      rootDir: workspaceDir,
      manifestPresent: !!validation.manifest,
      missingFiles: validation.missingFiles,
      missingDirectories: validation.missingDirectories,
    }, filesystem);
  }

  function persistProviderState(providers: Record<string, ProviderAuthSummary>, missingProvidersInUse: string[] = []) {
    return writeProviderStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      providers,
      ...(missingProvidersInUse.length > 0 ? { missingProvidersInUse } : {}),
    }, filesystem);
  }

  function persistSchedulerState(schedulers: SchedulerDescriptor[]) {
    return writeSchedulerStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      schedulers,
    }, filesystem);
  }

  function persistMemoryState(memory: MemoryDescriptor[]) {
    return writeMemoryStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      memory,
    }, filesystem);
  }

  function persistSkillsState(skills: SkillDescriptor[]) {
    return writeSkillsStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      skills,
    }, filesystem);
  }

  function persistChannelsState(channels: ChannelDescriptor[]) {
    const current = readChannelsStateSnapshot(workspaceDir, filesystem);
    return writeChannelsStateSnapshot(workspaceDir, {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      channels,
      ...(current?.details ? { details: current.details } : {}),
    }, filesystem);
  }

  function patchTelegramChannelIntent(
    patch: {
      enabled?: boolean;
      secretRef?: string;
      config?: Record<string, unknown>;
    },
  ) {
    const current = readIntent("channels") as {
      channels?: Record<string, {
        enabled?: boolean;
        secretRef?: string;
        config?: Record<string, unknown>;
      }>;
    };
    const existingChannels = current.channels ?? {};
    const existingTelegram = existingChannels.telegram ?? {};
    const existingConfig = existingTelegram.config ?? {};
    return patchIntent("channels", {
      channels: {
        ...existingChannels,
        telegram: {
          ...existingTelegram,
          ...patch,
          config: {
            ...existingConfig,
            ...(patch.config ?? {}),
          },
        },
      },
    });
  }

  function patchSkillIntentEntry(entry: {
    id: string;
    enabled: boolean;
    installRef?: string;
    source?: string;
    label?: string;
  }) {
    const current = readIntent("skills") as {
      skills?: Array<Record<string, unknown>>;
    };
    const existing = Array.isArray(current.skills) ? current.skills : [];
    return patchIntent("skills", {
      skills: [
        ...existing.filter((skill) => skill.id !== entry.id),
        entry,
      ],
    });
  }

  function patchManagedPluginIntent(target: OpenClawManagedPluginTarget, enabled: boolean) {
    const current = readIntent("plugins") as {
      plugins?: Record<string, Record<string, unknown>>;
    };
    const existingPlugins = current.plugins ?? {};
    const ids = target === "context"
      ? ["clawjs-context"]
      : target === "all"
        ? ["clawjs", "clawjs-context"]
        : ["clawjs"];
    const nextPlugins = { ...existingPlugins };
    for (const pluginId of ids) {
      nextPlugins[pluginId] = {
        ...(nextPlugins[pluginId] ?? {}),
        enabled,
      };
    }
    return patchIntent("plugins", { plugins: nextPlugins });
  }

  function patchProviderIntent(
    provider: string,
    patch: {
      enabled?: boolean;
      preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
      secretRef?: string | null;
      profileId?: string | null;
      metadata?: Record<string, unknown>;
    },
  ) {
    const current = readIntent("providers") as {
      providers?: Record<string, {
        enabled?: boolean;
        preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
        secretRef?: string | null;
        profileId?: string | null;
        metadata?: Record<string, unknown>;
      }>;
    };
    const existingProviders = current.providers ?? {};
    const existingProvider = existingProviders[provider] ?? {};
    return patchIntent("providers", {
      providers: {
        ...existingProviders,
        [provider]: {
          ...existingProvider,
          ...patch,
          ...(patch.metadata
            ? {
              metadata: {
                ...(existingProvider.metadata ?? {}),
                ...patch.metadata,
              },
            }
            : {}),
        },
      },
    });
  }

  function readSpeechConfig(): TtsProviderConfig {
    const current = readIntent("speech") as {
      tts?: TtsProviderConfig | null;
    };
    return normalizeTtsConfig(current.tts);
  }

  function writeSpeechConfig(input?: TtsProviderConfig | null): TtsProviderConfig {
    const normalized = normalizeTtsConfig(input);
    patchIntent("speech", { tts: normalized });
    return normalized;
  }

  function resolveTtsInput(input: TtsSynthesizeInput): TtsSynthesizeInput {
    const defaults = readSpeechConfig();
    return {
      ...input,
      provider: input.provider ?? defaults.provider,
      apiKey: input.apiKey ?? defaults.apiKey,
      voice: input.voice ?? defaults.voice,
      model: input.model ?? defaults.model,
      speed: input.speed ?? defaults.speed,
      stability: input.stability ?? defaults.stability,
      similarityBoost: input.similarityBoost ?? defaults.similarityBoost,
    };
  }

  async function refreshChannelSnapshots() {
    persistChannelsState(await readChannels());
  }

  async function ensureWorkspaceInitialized(): Promise<void> {
    initializeWorkspace(options.workspace, adapter.id, filesystem, options.templates?.pack, adapter.workspaceFiles);
    persistWorkspaceState(validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles));
    appendAuditEvent("workspace.initialized", "workspace", {
      workspaceId: options.workspace.workspaceId,
      runtimeAdapter: adapter.id,
    });
    eventBus.emit("workspace.initialized", {
      workspaceId: options.workspace.workspaceId,
      rootDir: workspaceDir,
      runtimeAdapter: adapter.id,
    });
  }

  function handleRuntimeProgress(onProgress?: RuntimeProgressSink): RuntimeProgressSink {
    return (event: RuntimeProgressEvent) => {
      appendAuditEvent("runtime.progress", event.capability, {
        operation: event.operation,
        phase: event.phase,
        status: event.status,
        percent: event.percent,
      });
      eventBus.emit("runtime.progress", event);
      onProgress?.(event);
    };
  }

  function emitAuthProgress(
    phase: string,
    status: "start" | "complete" | "error",
    provider: string,
    detail?: Record<string, unknown>,
  ): void {
    const payload = {
      phase,
      status,
      provider,
      timestamp: new Date().toISOString(),
      ...(detail ?? {}),
    };
    appendAuditEvent("auth.progress", "auth", payload);
    eventBus.emit("auth.progress", payload);
  }

  function emitAuthLoginProgress(
    event: AuthLoginProgressEvent,
    onProgress?: (event: AuthLoginProgressEvent) => void,
  ): void {
    emitAuthProgress(event.phase, event.status, event.provider, {
      ...(event.step ? { step: event.step } : {}),
      ...(event.result ? { result: event.result } : {}),
      ...(event.launchMode ? { launchMode: event.launchMode } : {}),
      ...(typeof event.pid === "number" ? { pid: event.pid } : {}),
      ...(event.command ? { command: event.command } : {}),
      ...(event.args ? { args: event.args } : {}),
      ...(event.message ? { message: event.message } : {}),
      ...(event.error ? { error: event.error } : {}),
    });
    onProgress?.(event);
  }

  function openClawContextDefaults() {
    return {
      agentId: options.workspace.agentId,
      configPath: resolvedRuntimeOptions.gateway?.configPath ?? resolvedRuntimeOptions.configPath,
      stateDir: resolvedRuntimeOptions.homeDir,
      workspaceDir,
      agentDir: resolvedRuntimeOptions.agentDir,
      conversationsDir: runtimeContext?.conversationsDir,
      env: resolvedRuntimeOptions.env,
      ...(resolvedRuntimeOptions.gateway ?? {}),
    };
  }

  function assertOpenClawPluginBridgeSupport(): void {
    if (adapter.id !== "openclaw") {
      throw new Error(`runtime.plugins is only supported for the openclaw adapter, received ${adapter.id}`);
    }
  }

  async function pluginBridgeStatus() {
    return getOpenClawPluginBridgeStatus(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
  }

  async function augmentRuntimeStatusWithPluginBridge(status: RuntimeProbeStatus): Promise<RuntimeProbeStatus> {
    if (adapter.id !== "openclaw") return status;

    const bridgeStatus = await pluginBridgeStatus();
    const pluginDiagnostics = [...bridgeStatus.diagnostics];

    if (!bridgeStatus.supported) {
      return {
        ...status,
        capabilityMap: {
          ...status.capabilityMap,
          plugins: {
            supported: false,
            status: "unsupported",
            strategy: "unsupported",
            diagnostics: {
              mode: bridgeStatus.mode,
              diagnostics: pluginDiagnostics,
            },
          },
        },
      };
    }

    let pluginCapabilityStatus: RuntimeCapabilitySupport["status"] = bridgeStatus.basePlugin.loaded ? "ready" : "degraded";
    if (pluginBridgePolicy.mode === "off") {
      pluginCapabilityStatus = bridgeStatus.basePlugin.loaded ? "ready" : "detected";
    } else if (pluginBridgePolicy.mode === "detect-only") {
      pluginCapabilityStatus = bridgeStatus.basePlugin.loaded ? "ready" : "degraded";
    } else if (!bridgeStatus.basePlugin.installed || !bridgeStatus.basePlugin.enabled) {
      pluginCapabilityStatus = "degraded";
    }

    return {
      ...status,
      capabilityMap: {
        ...status.capabilityMap,
        plugins: {
          supported: true,
          status: pluginCapabilityStatus,
          strategy: "native",
          diagnostics: {
            mode: bridgeStatus.mode,
            bridgePackage: bridgeStatus.basePlugin.packageSpec,
            basePluginInstalled: bridgeStatus.basePlugin.installed,
            basePluginEnabled: bridgeStatus.basePlugin.enabled,
            basePluginLoaded: bridgeStatus.basePlugin.loaded,
            contextPluginInstalled: bridgeStatus.contextPlugin.installed,
            contextPluginEnabled: bridgeStatus.contextPlugin.enabled,
            contextSelected: bridgeStatus.contextPlugin.selected,
            contextEngineId: bridgeStatus.contextPlugin.selectedEngineId,
            diagnostics: pluginDiagnostics,
          },
        },
      },
    };
  }

  async function ensureManagedPluginBridgeIfNeeded() {
    if (pluginBridgePolicy.mode !== "managed") return null;
    return ensureOpenClawPluginBridge(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
  }

  async function callManagedClawJsBridge(method: string, params: Record<string, unknown> = {}, callOptions: { timeoutMs?: number } = {}) {
    assertOpenClawPluginBridgeSupport();
    if (pluginBridgePolicy.mode === "managed") {
      await ensureManagedPluginBridgeIfNeeded();
    }
    return callOpenClawGateway(method, params, {
      runner: processHost,
      ...gatewayConfigOptions(),
      ...callOptions,
    });
  }

  function describeFeatures(): RuntimeFeatureDescriptor[] {
    return adapter.describeFeatures(resolvedRuntimeOptions);
  }

  function defaultConversationPolicy(): ConversationPolicy {
    return describeFeatures().find((feature) => feature.featureId === "conversations")?.conversationPolicy ?? "managed";
  }

  function featureForDomain(domain: IntentDomain): RuntimeFeatureDescriptor {
    return describeFeatures().find((feature) => feature.featureId === domain) ?? {
      featureId: domain,
      ownership: "mirrored",
      supported: false,
    };
  }

  function defaultIntentState(domain: IntentDomain): Record<string, unknown> {
    switch (domain) {
      case "runtime":
        return {
          adapter: adapter.id,
          locations: resolvedLocations,
        };
      case "models":
        return {
          defaultModel: null,
          logicalDefaults: {},
        };
      case "providers":
        return { providers: {} };
      case "channels":
        return { channels: {} };
      case "skills":
        return { skills: [] };
      case "plugins":
        return { plugins: {}, slots: {} };
      case "files":
        return { values: {} };
      case "conversations":
        return { policy: defaultConversationPolicy() };
      case "speech":
        return { tts: {}, stt: {} };
    }
  }

  function readIntent(domain?: IntentDomain): unknown {
    if (!domain) {
      return readAllIntentDomains(workspaceDir, filesystem);
    }
    return readIntentDomain(workspaceDir, domain, filesystem) ?? {
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      ...defaultIntentState(domain),
    };
  }

  function writeIntent(domain: IntentDomain, value: Record<string, unknown>): unknown {
    return writeIntentDomain(workspaceDir, domain, {
      ...value,
    }, filesystem);
  }

  function patchIntent(domain: IntentDomain, value: Record<string, unknown>): unknown {
    return patchIntentDomain(workspaceDir, domain, value, defaultIntentState(domain), filesystem);
  }

  async function refreshObservedDomain(domain: ObservedDomain): Promise<unknown> {
    switch (domain) {
      case "runtime": {
        const status = await augmentRuntimeStatusWithPluginBridge(await adapter.getStatus(processHost, resolvedRuntimeOptions));
        return writeObservedDomain(workspaceDir, "runtime", {
          runtime: {
            ...status,
            diagnostics: status.diagnostics,
          },
        }, filesystem);
      }
      case "workspace": {
        const validation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        return persistWorkspaceState(validation);
      }
      case "models": {
        const catalog = await readModelCatalog();
        const defaultModel = await readDefaultModel();
        return writeObservedDomain(workspaceDir, "models", {
          catalog,
          defaultModel,
        }, filesystem);
      }
      case "providers": {
        const providers = await readProviderAuth();
        return persistProviderState(providers, []);
      }
      case "channels": {
        const channels = await readChannels();
        return persistChannelsState(channels);
      }
      case "skills": {
        const skills = await readSkills();
        return persistSkillsState(skills);
      }
      case "memory": {
        const memory = await readMemory();
        return persistMemoryState(memory);
      }
      case "scheduler": {
        const schedulers = await readSchedulers();
        return persistSchedulerState(schedulers);
      }
      case "plugins": {
        if (adapter.id === "openclaw") {
          const status = await pluginBridgeStatus();
          return writeObservedDomain(workspaceDir, "plugins", {
            plugins: {
              [status.basePlugin.id]: {
                installed: status.basePlugin.installed,
                enabled: status.basePlugin.enabled,
                loaded: status.basePlugin.loaded,
                status: status.basePlugin.status,
                version: status.basePlugin.version,
                error: status.basePlugin.error,
              },
              [status.contextPlugin.id]: {
                installed: status.contextPlugin.installed,
                enabled: status.contextPlugin.enabled,
                loaded: status.contextPlugin.loaded,
                status: status.contextPlugin.status,
                version: status.contextPlugin.version,
                error: status.contextPlugin.error,
              },
            },
            slots: {
              contextEngine: status.contextPlugin.selectedEngineId,
            },
            diagnostics: status.diagnostics,
          }, filesystem);
        }
        return writeObservedDomain(workspaceDir, "plugins", {
          plugins: {},
          slots: {},
          diagnostics: [],
        }, filesystem);
      }
      case "conversations": {
        return writeObservedDomain(workspaceDir, "conversations", {
          policy: defaultConversationPolicy(),
          sessionCount: conversationStore.listSessions().length,
          runtimePath: runtimeContext?.conversationsDir ?? null,
        }, filesystem);
      }
    }
  }

  async function refreshObserved(options: { domains?: ObservedDomain[] } = {}): Promise<Record<string, unknown>> {
    const domains = options.domains ?? ["runtime", "workspace", "models", "providers", "channels", "skills", "plugins", "memory", "scheduler", "conversations"];
    const result: Record<string, unknown> = {};
    for (const domain of domains) {
      result[domain] = await refreshObservedDomain(domain);
    }
    return result;
  }

  async function diffIntent(options: { domains?: IntentDomain[] } = {}) {
    const domains = options.domains ?? ["runtime", "models", "providers", "channels", "skills", "plugins", "files", "conversations", "speech"];
    const issues: Array<{ domain: IntentDomain; path: string; message: string; expected?: unknown; actual?: unknown }> = [];

    for (const domain of domains) {
      const intent = readIntent(domain) as Record<string, unknown>;
      switch (domain) {
        case "runtime": {
          const observed = readObservedDomain(workspaceDir, "runtime", filesystem) as { runtime?: { adapter?: string } } | null;
          const expected = intent.adapter;
          const actual = observed?.runtime?.adapter ?? adapter.id;
          if (expected && expected !== actual) {
            issues.push({ domain, path: "adapter", message: "Selected runtime adapter does not match observed runtime.", expected, actual });
          }
          break;
        }
        case "models": {
          const observed = readObservedDomain(workspaceDir, "models", filesystem) as { defaultModel?: { modelId?: string | null } | null } | null;
          const expected = intent.defaultModel ?? null;
          const actual = observed?.defaultModel?.modelId ?? null;
          if (expected !== actual) {
            issues.push({ domain, path: "defaultModel", message: "Default model intent differs from observed runtime model.", expected, actual });
          }
          break;
        }
        case "providers": {
          const observed = readProviderStateSnapshot(workspaceDir, filesystem);
          const providers = (intent.providers ?? {}) as Record<string, {
            enabled?: boolean;
            preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
            secretRef?: string | null;
            profileId?: string | null;
          }>;
          for (const [provider, config] of Object.entries(providers)) {
            const actual = observed?.providers?.[provider];
            if (config.enabled === false) {
              if (actual?.hasAuth) {
                issues.push({ domain, path: `providers.${provider}.enabled`, message: `Provider ${provider} is disabled in intent but still has observed auth.`, expected: false, actual: true });
              }
              continue;
            }
            if (!actual?.hasAuth) {
              issues.push({ domain, path: `providers.${provider}`, message: `Provider ${provider} is desired but has no observed auth.` });
            }
            if (config.preferredAuthMode && config.preferredAuthMode !== "secret_ref" && actual?.authType && config.preferredAuthMode !== actual.authType) {
              issues.push({
                domain,
                path: `providers.${provider}.preferredAuthMode`,
                message: `Provider ${provider} auth mode differs from observed auth mode.`,
                expected: config.preferredAuthMode,
                actual: actual.authType,
              });
            }
            if (config.secretRef && !actual?.hasAuth) {
              issues.push({
                domain,
                path: `providers.${provider}.secretRef`,
                message: `Provider ${provider} declares a secret reference but no observed auth has been materialized.`,
                expected: config.secretRef,
              });
            }
            if (config.profileId) {
              const diagnostics = adapter.diagnostics(provider, resolvedRuntimeOptions) as { profiles?: Array<{ profileId?: string }> };
              const actualProfileIds = Array.isArray(diagnostics.profiles)
                ? diagnostics.profiles
                  .map((entry) => entry.profileId)
                  .filter((entry): entry is string => typeof entry === "string")
                : [];
              if (actualProfileIds.length > 0 && !actualProfileIds.includes(config.profileId)) {
                issues.push({
                  domain,
                  path: `providers.${provider}.profileId`,
                  message: `Provider ${provider} expects profile ${config.profileId} but it is not present in runtime diagnostics.`,
                  expected: config.profileId,
                  actual: actualProfileIds,
                });
              }
            }
          }
          break;
        }
        case "channels": {
          const observed = readChannelsStateSnapshot(workspaceDir, filesystem);
          const channels = (intent.channels ?? {}) as Record<string, { enabled?: boolean }>;
          for (const [channelId, config] of Object.entries(channels)) {
            if (!config.enabled) continue;
            const channel = observed?.channels.find((entry) => entry.id === channelId);
            if (!channel || channel.status === "disconnected") {
              issues.push({ domain, path: `channels.${channelId}`, message: `Channel ${channelId} is enabled in intent but not connected/configured.` });
            }
          }
          break;
        }
        case "skills": {
          const observed = readSkillsStateSnapshot(workspaceDir, filesystem);
          const skills = Array.isArray(intent.skills) ? intent.skills as Array<{ id: string; enabled: boolean }> : [];
          for (const skill of skills.filter((entry) => entry.enabled)) {
            if (!observed?.skills.some((entry) => entry.id === skill.id)) {
              issues.push({ domain, path: `skills.${skill.id}`, message: `Skill ${skill.id} is desired but not observed.` });
            }
          }
          break;
        }
        case "plugins": {
          const observed = readObservedDomain(workspaceDir, "plugins", filesystem) as { plugins?: Record<string, { enabled?: boolean; installed?: boolean }> } | null;
          const plugins = (intent.plugins ?? {}) as Record<string, { enabled?: boolean }>;
          for (const [pluginId, config] of Object.entries(plugins)) {
            const actual = observed?.plugins?.[pluginId];
            if (config.enabled === true && (!actual?.installed || !actual.enabled)) {
              issues.push({ domain, path: `plugins.${pluginId}`, message: `Plugin ${pluginId} is enabled in intent but not active in observed state.` });
            }
            if (config.enabled === false && actual?.enabled) {
              issues.push({ domain, path: `plugins.${pluginId}`, message: `Plugin ${pluginId} is disabled in intent but still enabled in observed state.` });
            }
          }
          break;
        }
        case "conversations": {
          const observed = readObservedDomain(workspaceDir, "conversations", filesystem) as { policy?: ConversationPolicy } | null;
          const expected = (intent.policy as ConversationPolicy | undefined) ?? defaultConversationPolicy();
          const actual = observed?.policy ?? defaultConversationPolicy();
          if (expected !== actual) {
            issues.push({ domain, path: "policy", message: "Conversation policy differs from observed policy.", expected, actual });
          }
          break;
        }
        case "speech": {
          const actual = (intent.tts ?? {}) as TtsProviderConfig | null;
          const expected = normalizeTtsConfig(actual);
          if (JSON.stringify(actual ?? {}) !== JSON.stringify(expected)) {
            issues.push({
              domain,
              path: "tts",
              message: "Speech intent is not normalized.",
              expected,
              actual,
            });
          }
          break;
        }
        default:
          break;
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      domains,
      drifted: issues.length > 0,
      issues,
    };
  }

  async function applyIntent(options: { domains?: IntentDomain[]; dryRun?: boolean } = {}) {
    const domains = options.domains ?? ["runtime", "models", "providers", "channels", "skills", "plugins", "files", "conversations", "speech"];
    const dryRun = options.dryRun === true;
    const actions: Array<{
      domain: IntentDomain;
      featureId: string;
      ownership: RuntimeFeatureDescriptor["ownership"];
      supported: boolean;
      status: "planned" | "applied" | "skipped" | "unsupported";
      message: string;
    }> = [];

    for (const domain of domains) {
      const feature = featureForDomain(domain);
      if (!feature.supported) {
        actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: false, status: "unsupported", message: `Feature ${domain} is unsupported for ${adapter.id}.` });
        continue;
      }

      const intent = readIntent(domain) as Record<string, unknown>;
      if (dryRun) {
        actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: true, status: "planned", message: `Planned apply for ${domain}.` });
        continue;
      }

      switch (domain) {
        case "runtime":
          patchIntent("runtime", {
            adapter: adapter.id,
            locations: resolvedLocations,
          });
          await refreshObservedDomain("runtime");
          break;
        case "models":
          if (typeof intent.defaultModel === "string" && intent.defaultModel.trim()) {
            await adapter.setDefaultModel(intent.defaultModel.trim(), processHost, resolvedRuntimeOptions);
          }
          await refreshObservedDomain("models");
          break;
        case "providers":
          for (const [provider, config] of Object.entries((intent.providers ?? {}) as Record<string, { enabled?: boolean }>)) {
            if (config.enabled === false) {
              adapter.removeProvider(provider, {
                ...resolvedRuntimeOptions,
              });
            }
          }
          await refreshObservedDomain("providers");
          break;
        case "channels": {
          const channels = (intent.channels ?? {}) as Record<string, { enabled?: boolean; secretRef?: string; config?: Record<string, unknown> }>;
          const telegramIntent = channels.telegram;
          if (telegramIntent?.enabled && telegramIntent.secretRef) {
            const config = telegramIntent.config ?? {};
            await telegram.connectBot({
              secretName: telegramIntent.secretRef,
              apiBaseUrl: typeof config.apiBaseUrl === "string" ? config.apiBaseUrl : undefined,
              webhookUrl: typeof config.webhookUrl === "string" ? config.webhookUrl : undefined,
              webhookSecretToken: typeof config.webhookSecretToken === "string" ? config.webhookSecretToken : undefined,
              allowedUpdates: Array.isArray(config.allowedUpdates) ? config.allowedUpdates.filter((value): value is string => typeof value === "string") : undefined,
              dropPendingUpdates: typeof config.dropPendingUpdates === "boolean" ? config.dropPendingUpdates : undefined,
            });
            if (Array.isArray(config.commands)) {
              await telegram.setCommands(config.commands as TelegramCommand[]);
            }
          }
          await refreshObservedDomain("channels");
          break;
        }
        case "skills": {
          const desired = Array.isArray(intent.skills) ? intent.skills as Array<{ id: string; enabled: boolean; installRef?: string; source?: string }> : [];
          const observed = readSkillsStateSnapshot(workspaceDir, filesystem);
          for (const skill of desired.filter((entry) => entry.enabled && entry.installRef && entry.source)) {
            if (!observed?.skills.some((entry) => entry.id === skill.id)) {
              await installSkillFromSource(skill.installRef!, { source: skill.source });
            }
          }
          await adapter.syncSkills(processHost, resolvedRuntimeOptions);
          await refreshObservedDomain("skills");
          break;
        }
        case "plugins":
          if (adapter.id === "openclaw") {
            const plugins = (intent.plugins ?? {}) as Record<string, { enabled?: boolean }>;
            const targets = Object.entries(plugins)
              .filter(([, config]) => config.enabled)
              .map(([pluginId]) => pluginId)
              .filter((pluginId): pluginId is "clawjs" | "clawjs-context" => pluginId === "clawjs" || pluginId === "clawjs-context");
            for (const target of targets) {
              await enableManagedOpenClawPlugins(target === "clawjs-context" ? "context" : "clawjs", processHost, resolvedRuntimeOptions, pluginBridgePolicy);
            }
            for (const [pluginId, config] of Object.entries(plugins)) {
              if (config.enabled !== false) continue;
              if (pluginId === "clawjs" || pluginId === "clawjs-context") {
                await disableManagedOpenClawPlugins(pluginId === "clawjs-context" ? "context" : "clawjs", processHost, resolvedRuntimeOptions, pluginBridgePolicy);
              }
            }
          }
          await refreshObservedDomain("plugins");
          break;
        case "files":
          break;
        case "conversations":
          await refreshObservedDomain("conversations");
          break;
        case "speech":
          writeSpeechConfig((intent.tts ?? {}) as TtsProviderConfig | null);
          break;
      }

      actions.push({ domain, featureId: feature.featureId, ownership: feature.ownership, supported: true, status: "applied", message: `Applied ${domain} intent.` });
    }

    return {
      appliedAt: new Date().toISOString(),
      domains,
      dryRun,
      actions,
    };
  }

  async function planIntent(options: { domains?: IntentDomain[]; dryRun?: boolean } = {}) {
    const diff = await diffIntent({ domains: options.domains });
    const domains = diff.domains;
    return {
      generatedAt: new Date().toISOString(),
      domains,
      dryRun: options.dryRun === true,
      actions: domains.map((domain) => {
        const feature = featureForDomain(domain);
        const relatedIssues = diff.issues.filter((issue) => issue.domain === domain);
        return {
          domain,
          featureId: feature.featureId,
          ownership: feature.ownership,
          supported: feature.supported,
          needsApply: relatedIssues.length > 0,
          message: relatedIssues[0]?.message ?? `No drift detected for ${domain}.`,
        };
      }),
    };
  }

  return {
    runtime: {
      context: () => runtimeContext,
      status: async () => {
        const baseStatus = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const status = await augmentRuntimeStatusWithPluginBridge(baseStatus);
        const telegramStatus = await telegram.status();
        const channelsSupport: RuntimeCapabilitySupport = telegramStatus.channel.status === "disconnected"
          ? status.capabilityMap.channels
          : {
            supported: true,
            status: telegramStatus.channel.status === "degraded" ? "degraded" : "ready",
            strategy: "bridge" as const,
            diagnostics: {
              provider: "telegram",
              mode: telegramStatus.transport.mode,
            },
          };
        return {
          ...status,
          capabilityMap: {
            ...status.capabilityMap,
            channels: channelsSupport,
          },
        };
      },
      gateway: {
        status: async () => {
          assertOpenClawGatewaySupport();
          return getOpenClawGatewayStatus(processHost, gatewayConfigOptions());
        },
        start: async () => {
          assertOpenClawGatewaySupport();
          await startOpenClawGateway(processHost, gatewayConfigOptions());
        },
        stop: async () => {
          assertOpenClawGatewaySupport();
          await stopOpenClawGateway(processHost, gatewayConfigOptions());
        },
        restart: async () => {
          assertOpenClawGatewaySupport();
          await restartOpenClawGateway(processHost, gatewayConfigOptions());
        },
        waitUntilReady: async (waitOptions = {}) => {
          assertOpenClawGatewaySupport();
          return waitForOpenClawGateway(processHost, {
            runner: processHost,
            ...gatewayConfigOptions(),
            ...waitOptions,
          });
        },
        call: async (method, params = {}, callOptions = {}) => {
          assertOpenClawGatewaySupport();
          return callOpenClawGateway(method, params, {
            runner: processHost,
            ...gatewayConfigOptions(),
            ...callOptions,
          });
        },
      },
      plugins: {
        status: async () => pluginBridgeStatus(),
        list: async () => {
          assertOpenClawPluginBridgeSupport();
          return listOpenClawPlugins(processHost, resolvedRuntimeOptions);
        },
        doctor: async () => {
          assertOpenClawPluginBridgeSupport();
          return doctorOpenClawPlugins(processHost, resolvedRuntimeOptions);
        },
        install: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await installManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        enable: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await enableManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        disable: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, false);
          const result = await disableManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        update: async (target = "clawjs") => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent(target, true);
          const result = await updateManagedOpenClawPlugins(target, processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        ensure: async () => {
          assertOpenClawPluginBridgeSupport();
          patchManagedPluginIntent("all", true);
          const result = await ensureOpenClawPluginBridge(processHost, resolvedRuntimeOptions, pluginBridgePolicy);
          await refreshObservedDomain("plugins");
          return result;
        },
        clawjs: {
          status: async () => callManagedClawJsBridge("clawjs.status"),
          events: {
            list: async (input = {}) => callManagedClawJsBridge("clawjs.events.list", input),
          },
          sessions: {
            inspect: async (input) => callManagedClawJsBridge("clawjs.sessions.inspect", input),
          },
          subagent: {
            run: async (input) => callManagedClawJsBridge("clawjs.subagent.run", input),
            wait: async (input) => callManagedClawJsBridge("clawjs.subagent.wait", input),
            messages: async (input) => callManagedClawJsBridge("clawjs.subagent.messages", input),
          },
          hooks: {
            status: async () => callManagedClawJsBridge("clawjs.hooks.status"),
            list: async () => {
              assertOpenClawPluginBridgeSupport();
              return listOpenClawHooks(processHost, resolvedRuntimeOptions);
            },
          },
          context: {
            status: async () => callManagedClawJsBridge("clawjs.context.status"),
          },
          doctor: async () => callManagedClawJsBridge("clawjs.doctor"),
        },
      },
      install: async (installer = "npm", onProgress) => {
        await adapter.install(processHost, installer, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.installed", "runtime", { installer, runtimeAdapter: adapter.id });
        eventBus.emit("runtime.installed", { installer, runtimeAdapter: adapter.id });
      },
      uninstall: async (installer = "npm", onProgress) => {
        await adapter.uninstall(processHost, installer, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.uninstalled", "runtime", { installer, runtimeAdapter: adapter.id });
        eventBus.emit("runtime.uninstalled", { installer, runtimeAdapter: adapter.id });
      },
      repair: async (onProgress) => {
        await adapter.repair(processHost, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.repaired", "runtime", { runtimeAdapter: adapter.id });
        eventBus.emit("runtime.repaired", { runtimeAdapter: adapter.id });
      },
      setupWorkspace: async (onProgress) => {
        await adapter.setupWorkspace({
          agentId: options.workspace.agentId,
          workspaceDir,
        }, processHost, handleRuntimeProgress(onProgress));
        appendAuditEvent("runtime.workspace_setup", "runtime", {
          agentId: options.workspace.agentId,
          workspaceDir,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("runtime.workspace_setup", {
          agentId: options.workspace.agentId,
          workspaceDir,
          runtimeAdapter: adapter.id,
        });
      },
      installCommand: (installer = "npm") => adapter.buildInstallCommand(installer),
      uninstallCommand: (installer = "npm") => adapter.buildUninstallCommand(installer),
      repairCommand: () => adapter.buildRepairCommand(),
      setupWorkspaceCommand: () => adapter.buildWorkspaceSetupCommand({
        agentId: options.workspace.agentId,
        workspaceDir,
      }),
      installPlan: (installer = "npm") => adapter.buildProgressPlan("install", undefined, installer),
      uninstallPlan: (installer = "npm") => adapter.buildProgressPlan("uninstall", undefined, installer),
      repairPlan: () => adapter.buildProgressPlan("repair"),
      setupWorkspacePlan: () => adapter.buildProgressPlan("setup", {
        agentId: options.workspace.agentId,
        workspaceDir,
      }),
      discoverContext: (discoverOptions = {}) => adapter.id === "openclaw"
        ? discoverOpenClawAppContext({
          ...openClawContextDefaults(),
          ...discoverOptions,
        })
        : null,
      detachWorkspace: async (detachOptions = {}) => adapter.id === "openclaw"
        ? detachOpenClawAppContext({
          ...openClawContextDefaults(),
          ...detachOptions,
        })
        : null,
    },
    workspace: {
      init: async () => {
        await ensureWorkspaceInitialized();
      },
      attach: async () => attachWorkspace(workspaceDir, filesystem),
      validate: async () => {
        const validation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        persistWorkspaceState(validation);
        return validation;
      },
      repair: async () => {
        const repaired = repairWorkspace(options.workspace, adapter.id, filesystem, options.templates?.pack, adapter.workspaceFiles);
        persistWorkspaceState(validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles));
        appendAuditEvent("workspace.repaired", "workspace", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotMigrated: repaired.compatSnapshotMigrated,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.repaired", {
          createdDirectories: repaired.createdDirectories.length,
          createdRuntimeFiles: repaired.createdRuntimeFiles.length,
          compatSnapshotMigrated: repaired.compatSnapshotMigrated,
          runtimeAdapter: adapter.id,
        });
        return repaired;
      },
      previewReset: async (resetOptions) => buildWorkspaceResetPlan(workspaceDir, resetOptions, filesystem, adapter.workspaceFiles),
      reset: async (resetOptions) => {
        const result = resetWorkspace(workspaceDir, resetOptions, filesystem, adapter.workspaceFiles);
        appendAuditEvent("workspace.reset", "workspace", {
          ...result.options,
          removedPaths: result.removedPaths.length,
          preservedPaths: result.preservedPaths.length,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("workspace.reset", {
          workspaceId: options.workspace.workspaceId,
          ...result.options,
          removedPaths: result.removedPaths.length,
          preservedPaths: result.preservedPaths.length,
          runtimeAdapter: adapter.id,
        });
        return result;
      },
      listManagedFiles: async () => listManagedFiles(workspaceDir, adapter.workspaceFiles),
      canonicalPaths: () => buildCanonicalPathMap(workspaceDir, adapter.workspaceFiles),
      inspect: async () => ({
        manifestPath: resolveManifestPath(workspaceDir),
        compatSnapshotPath: resolveCompatSnapshotPath(workspaceDir),
        capabilityReportPath: resolveCapabilityReportPath(workspaceDir),
        bindingsPath: resolveBindingsPath(workspaceDir),
        settingsSchemaPath: resolveSettingsSchemaPath(workspaceDir),
        settingsValuesPath: resolveSettingsValuesPath(workspaceDir),
        workspaceStatePath: resolveWorkspaceStatePath(workspaceDir),
        providerStatePath: resolveProviderStatePath(workspaceDir),
        schedulerStatePath: resolveSchedulerStatePath(workspaceDir),
        memoryStatePath: resolveMemoryStatePath(workspaceDir),
        skillsStatePath: resolveSkillsStatePath(workspaceDir),
        channelsStatePath: resolveChannelsStatePath(workspaceDir),
        telegramStatePath: resolveTelegramStatePath(workspaceDir),
        intentPaths: {
          runtime: resolveIntentDomainPath(workspaceDir, "runtime"),
          models: resolveIntentDomainPath(workspaceDir, "models"),
          providers: resolveIntentDomainPath(workspaceDir, "providers"),
          channels: resolveIntentDomainPath(workspaceDir, "channels"),
          skills: resolveIntentDomainPath(workspaceDir, "skills"),
          plugins: resolveIntentDomainPath(workspaceDir, "plugins"),
          files: resolveIntentDomainPath(workspaceDir, "files"),
          conversations: resolveIntentDomainPath(workspaceDir, "conversations"),
          speech: resolveIntentDomainPath(workspaceDir, "speech"),
        },
        observedPaths: {
          runtime: resolveObservedDomainPath(workspaceDir, "runtime"),
          workspace: resolveObservedDomainPath(workspaceDir, "workspace"),
          models: resolveObservedDomainPath(workspaceDir, "models"),
          providers: resolveObservedDomainPath(workspaceDir, "providers"),
          channels: resolveObservedDomainPath(workspaceDir, "channels"),
          skills: resolveObservedDomainPath(workspaceDir, "skills"),
          plugins: resolveObservedDomainPath(workspaceDir, "plugins"),
          memory: resolveObservedDomainPath(workspaceDir, "memory"),
          scheduler: resolveObservedDomainPath(workspaceDir, "scheduler"),
          conversations: resolveObservedDomainPath(workspaceDir, "conversations"),
        },
        manifest: readWorkspaceManifest(workspaceDir, filesystem),
        compatSnapshot: readCompatSnapshot(workspaceDir, filesystem),
        capabilityReport: readCapabilityReport(workspaceDir, filesystem),
        workspaceState: readWorkspaceStateSnapshot(workspaceDir, filesystem),
        providerState: readProviderStateSnapshot(workspaceDir, filesystem),
        schedulerState: readSchedulerStateSnapshot(workspaceDir, filesystem),
        memoryState: readMemoryStateSnapshot(workspaceDir, filesystem),
        skillsState: readSkillsStateSnapshot(workspaceDir, filesystem),
        channelsState: readChannelsStateSnapshot(workspaceDir, filesystem),
        telegramState: readTelegramStateSnapshot(workspaceDir, filesystem),
        slackState: readSlackStateSnapshot(workspaceDir, filesystem),
        whatsappState: readWhatsAppStateSnapshot(workspaceDir, filesystem),
        intents: readAllIntentDomains(workspaceDir, filesystem),
        observed: readAllObservedDomains(workspaceDir, filesystem),
      }),
    },
    intent: {
      get: (domain) => readIntent(domain),
      set: (domain, value) => writeIntent(domain, value),
      patch: (domain, patch) => patchIntent(domain, patch),
      plan: async (planOptions) => planIntent(planOptions),
      apply: async (applyOptions) => applyIntent(applyOptions),
      diff: async (diffOptions) => diffIntent(diffOptions),
    },
    observed: {
      read: (domain) => domain
        ? readObservedDomain(workspaceDir, domain, filesystem)
        : readAllObservedDomains(workspaceDir, filesystem),
      refresh: async (refreshOptions) => refreshObserved(refreshOptions),
    },
    features: {
      describe: () => describeFeatures(),
    },
    files: {
      applyTemplatePack: async (templatePackPath = options.templates?.pack, applyOptions = {}) => {
        if (!templatePackPath) {
          throw new Error("templatePackPath is required");
        }
        const backupDir = path.join(workspaceDir, ".clawjs", "backups");
        const result = applyTemplatePack(templatePackPath, {
          workspaceDir,
          backupDir,
          filesystem,
          ...applyOptions,
        });
        appendAuditEvent("files.template_pack_applied", "templates", { templatePackPath, changes: result.filter((entry) => entry.changed).length });
        eventBus.emit("files.template_pack_applied", {
          templatePackPath,
          changedCount: result.filter((entry) => entry.changed).length,
        });
        return result;
      },
      diffBinding: (binding, settings, render) => syncBinding({
        workspaceDir,
        binding,
        settings,
        render,
        filesystem,
        dryRun: true,
      }),
      syncBinding: (binding, settings, render) => {
        const result = syncBinding({
          workspaceDir,
          binding,
          settings,
          render,
          filesystem,
          backupDir: path.join(workspaceDir, ".clawjs", "backups"),
        });
        appendAuditEvent("files.binding_synced", "file_sync", {
          bindingId: binding.id,
          filePath: result.filePath,
          changed: result.changed,
        });
        eventBus.emit("files.binding_synced", {
          bindingId: binding.id,
          filePath: result.filePath,
          changed: result.changed,
        });
        return result;
      },
      readBindingStore: () => readBindingStore(workspaceDir, filesystem),
      writeBindingStore: (bindings) => writeBindingStore(workspaceDir, bindings, filesystem),
      readSettingsSchema: () => readSettingsSchemaRecord(workspaceDir, filesystem),
      writeSettingsSchema: (settingsSchema) => writeSettingsSchemaRecord(workspaceDir, settingsSchema, filesystem),
      readSettingsValues: () => readSettingsValuesRecord(workspaceDir, filesystem),
      writeSettingsValues: (values) => writeSettingsValuesRecord(workspaceDir, values, filesystem),
      validateSettings: (values) => validateSettingsUpdate(readSettingsSchemaRecord(workspaceDir, filesystem).settingsSchema, values),
      renderTemplate: (template, values) => renderSettingsTemplate(template, values),
      updateSettings: (values, updateOptions) => {
        const result = updateBindingSettings({
          workspaceDir,
          bindings: readBindingStore(workspaceDir, filesystem).bindings,
          settingsSchema: readSettingsSchemaRecord(workspaceDir, filesystem).settingsSchema,
          values,
          renderers: updateOptions.renderers ?? {},
          autoSync: updateOptions.autoSync,
          reenableOptionalBindings: updateOptions.reenableOptionalBindings,
          filesystem,
        });
        appendAuditEvent("files.settings_updated", "file_sync", {
          autoSync: !!updateOptions.autoSync,
          syncCount: result.syncResults.length,
        });
        eventBus.emit("files.settings_updated", {
          autoSync: !!updateOptions.autoSync,
          syncCount: result.syncResults.length,
        });
        return result;
      },
      readWorkspaceFile: (relativePath) => readWorkspaceFile(workspaceDir, relativePath, filesystem),
      writeWorkspaceFile: (relativePath, content) => {
        const result = writeWorkspaceFile(workspaceDir, relativePath, content, filesystem);
        appendAuditEvent("files.workspace_written", "file_sync", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
        });
        eventBus.emit("files.workspace_written", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
        });
        return result;
      },
      writeWorkspaceFilePreservingManagedBlocks: (relativePath, content, preserveOptions = {}) => {
        const result = writeWorkspaceFilePreservingManagedBlocks(workspaceDir, relativePath, content, preserveOptions, filesystem);
        appendAuditEvent("files.workspace_written", "file_sync", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
          preservedManagedBlocks: true,
        });
        eventBus.emit("files.workspace_written", {
          relativePath,
          filePath: result.filePath,
          changed: result.changed,
          preservedManagedBlocks: true,
        });
        return result;
      },
      previewWorkspaceFile: (relativePath, content) => previewWorkspaceFile(workspaceDir, relativePath, content, filesystem),
      inspectWorkspaceFile: (relativePath) => inspectWorkspaceFile(workspaceDir, relativePath, filesystem),
      inspectManagedBlock: (relativePath, blockId) => inspectManagedWorkspaceFile(workspaceDir, relativePath, blockId, filesystem),
      mergeManagedBlocks: (originalContent, editedContent, mergeOptions = {}) => mergeManagedBlocks(originalContent, editedContent, mergeOptions),
    },
    compat: {
      refresh: async () => {
        const status = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const compat = adapter.buildCompatReport(status);
        const snapshot = writeCompatSnapshot(workspaceDir, status, compat, filesystem);
        writeCapabilityReport(workspaceDir, {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          runtimeAdapter: compat.runtimeAdapter,
          runtimeVersion: compat.runtimeVersion,
          degraded: compat.degraded,
          capabilities: compat.capabilities,
          capabilityMap: compat.capabilityMap,
          issues: compat.issues,
          ...(compat.diagnostics ? { diagnostics: compat.diagnostics } : {}),
        }, filesystem);
        persistSchedulerState(await readSchedulers());
        persistMemoryState(await readMemory());
        persistSkillsState(await readSkills());
        persistChannelsState(await readChannels());
        appendAuditEvent("compat.refreshed", "compat", {
          degraded: compat.degraded,
          issueCount: compat.issues.length,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("compat.refreshed", {
          degraded: compat.degraded,
          issueCount: compat.issues.length,
          runtimeAdapter: adapter.id,
        });
        return snapshot;
      },
      read: () => readCompatSnapshot(workspaceDir, filesystem),
    },
    doctor: {
      run: async () => {
        const baseStatus = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const status = await augmentRuntimeStatusWithPluginBridge(baseStatus);
        const compat = adapter.buildCompatReport(status);
        const runtimeDoctor = adapter.buildDoctorReport(status);
        if (adapter.id === "openclaw") {
          const bridgeStatus = await pluginBridgeStatus();
          if (pluginBridgePolicy.mode === "managed" && bridgeStatus.supported) {
            if (!bridgeStatus.basePlugin.installed) {
              runtimeDoctor.issues.push("Managed ClawJS OpenClaw plugin is not installed.");
              runtimeDoctor.suggestedRepairs.push(`Install ${bridgeStatus.basePlugin.packageSpec} or call runtime.plugins.ensure().`);
            } else if (!bridgeStatus.basePlugin.enabled) {
              runtimeDoctor.issues.push("Managed ClawJS OpenClaw plugin is installed but disabled.");
              runtimeDoctor.suggestedRepairs.push("Enable the `clawjs` OpenClaw plugin or call runtime.plugins.ensure().");
            }
            if (pluginBridgePolicy.enableContextEngine && bridgeStatus.contextPlugin.selectedEngineId !== "clawjs-context") {
              runtimeDoctor.issues.push("Managed ClawJS context engine is not selected in plugins.slots.contextEngine.");
              runtimeDoctor.suggestedRepairs.push("Select `clawjs-context` in plugins.slots.contextEngine or call runtime.plugins.ensure().");
            }
          }
        }
        const workspace = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        const compatSnapshot = readCompatSnapshot(workspaceDir, filesystem);
        const compatDrift = buildCompatDriftReport(compatSnapshot, status, compat);
        const providerSummaries = await readProviderAuth();
        const schedulers = await readSchedulers();
        const memory = await readMemory();
        const skills = await readSkills();
        const channels = await readChannels();
        persistWorkspaceState(workspace);
        persistProviderState(providerSummaries, []);
        persistSchedulerState(schedulers);
        persistMemoryState(memory);
        persistSkillsState(skills);
        persistChannelsState(channels);
        const managedBlockProblems = Array.from(new Set(
          listManagedFiles(workspaceDir, adapter.workspaceFiles)
            .flatMap((filePath) => listManagedBlockProblems(filesystem.tryReadText(filePath)).map((problem) => ({
              ...problem,
              message: `${path.basename(filePath)}: ${problem.message}`,
            }))),
        ));
        return buildCombinedDoctorReport({
          runtime: status,
          compat,
          runtimeDoctor,
          workspace,
          compatSnapshot,
          compatDrift,
          managedBlockProblems,
          missingProvidersInUse: [],
          providerSummaries,
        });
      },
    },
    models: {
      list: async () => {
        try {
          return await adapter.listModels(processHost, resolvedRuntimeOptions);
        } catch {
          return [];
        }
      },
      catalog: async () => readModelCatalog(),
      getDefault: async () => readDefaultModel(),
      setDefault: async (model) => {
        patchIntent("models", {
          defaultModel: model,
        });
        const result = await applyIntent({ domains: ["models"] });
        const modelId = await readDefaultModel();
        appendAuditEvent("models.default_set", "models", { modelId, runtimeAdapter: adapter.id });
        eventBus.emit("models.default_set", { modelId, runtimeAdapter: adapter.id });
        if (result.actions.some((action) => action.domain === "models" && action.status === "unsupported")) {
          throw new Error(`Model intents are unsupported for adapter ${adapter.id}`);
        }
        return modelId?.modelId ?? model;
      },
    },
    providers: {
      list: async () => (await readProviderCatalog()).providers,
      catalog: async () => readProviderCatalog(),
      authState: async () => {
        const state = await readAuthState();
        persistProviderState(state.providers, []);
        return state;
      },
    },
    auth: {
      status: async () => {
        const summaries = await readProviderAuth();
        persistProviderState(summaries, []);
        return summaries;
      },
      diagnostics: (provider) => adapter.diagnostics(provider, resolvedRuntimeOptions),
      prepareLogin: async (provider) => prepareAuthLogin(provider),
      login: async (provider, loginOptions = {}) => {
        const requestedProvider = provider.trim();
        emitAuthLoginProgress({
          phase: "auth.login",
          status: "start",
          provider: requestedProvider,
          timestamp: new Date().toISOString(),
          step: "checking_existing_auth",
          message: "Checking whether an existing provider auth can be reused.",
        }, loginOptions.onProgress);
        try {
          const plan = await prepareAuthLogin(requestedProvider);
          if (plan.status === "reused") {
            patchProviderIntent(plan.provider, {
              enabled: true,
              preferredAuthMode: "oauth",
              metadata: {
                lastLoginStartedAt: new Date().toISOString(),
                lastLoginReuseAt: new Date().toISOString(),
              },
            });
            const reused: AuthLoginResult = {
              requestedProvider: plan.requestedProvider,
              provider: plan.provider,
              status: "reused",
              launchMode: "none",
              message: plan.message,
            };
            emitAuthLoginProgress({
              phase: "auth.login",
              status: "complete",
              provider: reused.provider,
              timestamp: new Date().toISOString(),
              step: "reused_existing_auth",
              result: reused.status,
              launchMode: reused.launchMode,
              message: reused.message,
            }, loginOptions.onProgress);
            return reused;
          }

          const launched = await adapter.login(requestedProvider, processHost, {
            ...resolvedRuntimeOptions,
            setDefault: loginOptions.setDefault,
            cwd: workspaceDir,
            env: loginOptions.env ?? resolvedRuntimeOptions.env,
          });
          patchProviderIntent(launched.provider, {
            enabled: true,
            preferredAuthMode: "oauth",
            metadata: {
              lastLoginStartedAt: new Date().toISOString(),
            },
          });
          appendAuditEvent("auth.login_started", "auth", {
            provider: launched.provider,
            pid: launched.pid,
            launchMode: launched.launchMode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.login_started", {
            provider: launched.provider,
            pid: launched.pid,
            launchMode: launched.launchMode,
            runtimeAdapter: adapter.id,
          });
          emitAuthLoginProgress({
            phase: "auth.login",
            status: "complete",
            provider: launched.provider,
            timestamp: new Date().toISOString(),
            step: "launching_interactive_flow",
            result: launched.status,
            launchMode: launched.launchMode,
            ...(typeof launched.pid === "number" ? { pid: launched.pid } : {}),
            ...(launched.command ? { command: launched.command } : {}),
            ...(launched.args ? { args: launched.args } : {}),
            ...(launched.message ? { message: launched.message } : {}),
          }, loginOptions.onProgress);
          return launched;
        } catch (error) {
          emitAuthLoginProgress({
            phase: "auth.login",
            status: "error",
            provider: requestedProvider,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : "login failed",
          }, loginOptions.onProgress);
          throw error;
        }
      },
      setApiKey: (provider, key, profileId) => {
        emitAuthProgress("auth.api_key.save", "start", provider);
        try {
          const summary = adapter.setApiKey(provider, key, {
            ...resolvedRuntimeOptions,
            ...(profileId ? { profileId } : {}),
          });
          patchProviderIntent(provider, {
            enabled: true,
            preferredAuthMode: "api_key",
            profileId: summary.profileId,
          });
          refreshObservedDomain("providers").catch(() => undefined);
          appendAuditEvent("auth.api_key_saved", "auth", {
            provider,
            profileId: summary.profileId,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.api_key_saved", {
            provider,
            profileId: summary.profileId,
            runtimeAdapter: adapter.id,
          });
          emitAuthProgress("auth.api_key.save", "complete", provider, {
            profileId: summary.profileId,
            mode: "store",
          });
          return summary;
        } catch (error) {
          emitAuthProgress("auth.api_key.save", "error", provider, {
            message: error instanceof Error ? error.message : "save failed",
          });
          throw error;
        }
      },
      saveApiKey: async (provider, key, saveOptions = {}) => {
        emitAuthProgress("auth.api_key.save", "start", provider);
        try {
          const persisted = await adapter.saveApiKey(provider, key, processHost, {
            ...resolvedRuntimeOptions,
            ...(saveOptions.profileId ? { profileId: saveOptions.profileId } : {}),
            ...(saveOptions.runtimeCommand ? { runtimeCommand: saveOptions.runtimeCommand } : {}),
          });
          patchProviderIntent(provider, {
            enabled: true,
            preferredAuthMode: "api_key",
            profileId: persisted.summary.profileId,
          });
          await refreshObservedDomain("providers");
          appendAuditEvent("auth.api_key_saved", "auth", {
            provider,
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.api_key_saved", {
            provider,
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
            runtimeAdapter: adapter.id,
          });
          emitAuthProgress("auth.api_key.save", "complete", provider, {
            profileId: persisted.summary.profileId,
            mode: persisted.mode,
          });
          return persisted;
        } catch (error) {
          emitAuthProgress("auth.api_key.save", "error", provider, {
            message: error instanceof Error ? error.message : "save failed",
          });
          throw error;
        }
      },
      removeProvider: (provider) => {
        emitAuthProgress("auth.remove", "start", provider);
        const removed = adapter.removeProvider(provider, resolvedRuntimeOptions);
        patchProviderIntent(provider, {
          enabled: false,
        });
        refreshObservedDomain("providers").catch(() => undefined);
        if (removed > 0) {
          appendAuditEvent("auth.provider_removed", "auth", {
            provider,
            removed,
            runtimeAdapter: adapter.id,
          });
          eventBus.emit("auth.provider_removed", {
            provider,
            removed,
            runtimeAdapter: adapter.id,
          });
        }
        emitAuthProgress("auth.remove", "complete", provider, { removed });
        return removed;
      },
    },
    scheduler: {
      list: async () => {
        const schedulers = await readSchedulers();
        persistSchedulerState(schedulers);
        return schedulers;
      },
      run: async (id) => {
        await adapter.runScheduler(id, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.run", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.run", { id, runtimeAdapter: adapter.id });
      },
      enable: async (id) => {
        await adapter.setSchedulerEnabled(id, true, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.enabled", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.enabled", { id, runtimeAdapter: adapter.id });
      },
      disable: async (id) => {
        await adapter.setSchedulerEnabled(id, false, processHost, resolvedRuntimeOptions);
        appendAuditEvent("scheduler.disabled", "scheduler", { id, runtimeAdapter: adapter.id });
        eventBus.emit("scheduler.disabled", { id, runtimeAdapter: adapter.id });
      },
    },
    memory: {
      list: async () => {
        const memory = await readMemory();
        persistMemoryState(memory);
        return memory;
      },
      search: async (query) => {
        const memory = await adapter.searchMemory(query, processHost, resolvedRuntimeOptions);
        persistMemoryState(memory);
        return memory;
      },
    },
    skills: {
      list: async () => {
        const skills = await readSkills();
        persistSkillsState(skills);
        return skills;
      },
      sync: async () => {
        const skills = await adapter.syncSkills(processHost, resolvedRuntimeOptions);
        persistSkillsState(skills);
        appendAuditEvent("skills.synced", "skills", { count: skills.length, runtimeAdapter: adapter.id });
        eventBus.emit("skills.synced", { count: skills.length, runtimeAdapter: adapter.id });
        return skills;
      },
      sources: async () => readSkillSources(),
      search: async (query, options = {}) => searchSkillCatalog(query, options),
      install: async (ref, options = {}) => {
        const result = await installSkillFromSource(ref, options);
        patchSkillIntentEntry({
          id: result.slug,
          enabled: true,
          installRef: result.installRef,
          source: result.source,
          label: result.label,
        });
        await refreshObservedDomain("skills");
        return result;
      },
    },
    generations: {
      backends: () => generationStore.listBackends(),
      registerCommandBackend: (input) => registerGenerationBackend(input),
      removeBackend: (id) => removeGenerationBackend(id),
      create: async (input) => createGenerationRecord(input),
      list: (query) => generationStore.list(query),
      get: (id) => generationStore.get(id),
      remove: (id) => removeGenerationRecord(id),
    },
    image: createTypedGenerationFacade("image"),
    audio: createTypedGenerationFacade("audio"),
    video: createTypedGenerationFacade("video"),
    tts: {
      synthesize: async (input) => {
        const resolvedInput = resolveTtsInput(input);
        const result = await synthesize(resolvedInput);
        appendAuditEvent("tts.synthesized", "channels", {
          provider: resolvedInput.provider ?? "local",
          textLength: resolvedInput.text.length,
        });
        eventBus.emit("tts.synthesized", {
          provider: resolvedInput.provider ?? "local",
          textLength: resolvedInput.text.length,
        });
        return result;
      },
      config: () => readSpeechConfig(),
      setConfig: (input) => writeSpeechConfig(input),
      providers: () => listTtsProviders(),
      catalog: () => getTtsCatalog(),
      normalizeConfig: (input) => normalizeTtsConfig(input),
      stripMarkdown: (text) => stripMarkdownForTts(text),
      segmentText: (text, options) => segmentTextForTts(text, options),
      createPlaybackPlan: (input) => createTtsPlaybackPlan(input),
    },
    channels: {
      list: async () => {
        const channels = await readChannels();
        persistChannelsState(channels);
        return channels;
      },
    },
    telegram: {
      provisionSecretReference: async (input) => ensureTelegramBotSecretReference(processHost, {
        name: input.secretName,
        apiBaseUrl: input.apiBaseUrl,
        notes: input.notes,
        readOnly: input.readOnly,
      }, { env: resolvedRuntimeOptions.env }),
      connectBot: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          secretRef: input.secretName,
          config: {
            ...(input.apiBaseUrl ? { apiBaseUrl: input.apiBaseUrl } : {}),
            ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
            ...(input.webhookSecretToken ? { webhookSecretToken: input.webhookSecretToken } : {}),
            ...(input.allowedUpdates ? { allowedUpdates: input.allowedUpdates } : {}),
            ...(typeof input.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.connectBot(input);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.connected", "channels", {
          secretName: input.secretName,
          mode: status.transport.mode,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("telegram.connected", {
          secretName: input.secretName,
          mode: status.transport.mode,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await telegram.status();
        await refreshChannelSnapshots();
        return status;
      },
      configureWebhook: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            webhookUrl: input.url,
            ...(input.secretToken ? { webhookSecretToken: input.secretToken } : {}),
            ...(input.allowedUpdates ? { allowedUpdates: input.allowedUpdates } : {}),
            ...(typeof input.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.configureWebhook(input);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.webhook_configured", "channels", {
          url: input.url,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("telegram.webhook_configured", {
          url: input.url,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      disableWebhook: async (input) => {
        patchTelegramChannelIntent({
          config: {
            webhookUrl: null,
            ...(typeof input?.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.disableWebhook(input);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.webhook_disabled", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.webhook_disabled", { runtimeAdapter: adapter.id });
        return status;
      },
      startPolling: async (input) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            polling: true,
            ...(typeof input?.limit === "number" ? { limit: input.limit } : {}),
            ...(typeof input?.timeoutSeconds === "number" ? { timeoutSeconds: input.timeoutSeconds } : {}),
            ...(typeof input?.dropPendingUpdates === "boolean" ? { dropPendingUpdates: input.dropPendingUpdates } : {}),
          },
        });
        const status = await telegram.startPolling(input);
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.polling_started", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.polling_started", { runtimeAdapter: adapter.id });
        return status;
      },
      stopPolling: async () => {
        patchTelegramChannelIntent({
          config: {
            polling: false,
          },
        });
        const status = await telegram.stopPolling();
        await refreshChannelSnapshots();
        appendAuditEvent("telegram.polling_stopped", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("telegram.polling_stopped", { runtimeAdapter: adapter.id });
        return status;
      },
      setCommands: async (commands) => {
        patchTelegramChannelIntent({
          enabled: true,
          config: {
            commands,
          },
        });
        const saved = await telegram.setCommands(commands);
        appendAuditEvent("telegram.commands_set", "channels", { count: saved.length, runtimeAdapter: adapter.id });
        eventBus.emit("telegram.commands_set", { count: saved.length, runtimeAdapter: adapter.id });
        return saved;
      },
      getCommands: () => telegram.getCommands(),
      sendMessage: (input) => telegram.sendMessage(input),
      sendMedia: (input) => telegram.sendMedia(input),
      listChats: (query) => telegram.listChats(query),
      getChat: (chatId) => telegram.getChat(chatId),
      getChatAdministrators: (chatId) => telegram.getChatAdministrators(chatId),
      getChatMember: (chatId, userId) => telegram.getChatMember(chatId, userId),
      setChatPermissions: (chatId, permissions) => telegram.setChatPermissions(chatId, permissions),
      banOrRestrictMember: (input) => telegram.banOrRestrictMember(input),
      createInviteLink: (chatId, options) => telegram.createInviteLink(chatId, options),
      revokeInviteLink: (chatId, inviteLink) => telegram.revokeInviteLink(chatId, inviteLink),
      syncUpdates: async (input) => {
        const updates = await telegram.syncUpdates(input);
        await refreshChannelSnapshots();
        if (updates.length > 0) {
          appendAuditEvent("telegram.updates_synced", "channels", { count: updates.length, runtimeAdapter: adapter.id });
          eventBus.emit("telegram.updates_synced", { count: updates.length, runtimeAdapter: adapter.id });
        }
        return updates;
      },
      ingestUpdate: async (update) => {
        const envelope = await telegram.ingestUpdate(update);
        await refreshChannelSnapshots();
        if (envelope) {
          appendAuditEvent("telegram.update_ingested", "channels", { updateId: envelope.updateId, type: envelope.type, runtimeAdapter: adapter.id });
          eventBus.emit("telegram.update_ingested", { updateId: envelope.updateId, type: envelope.type, runtimeAdapter: adapter.id });
        }
        return envelope;
      },
    },
    slack: {
      connectBot: async (input) => {
        const status = await slack.connectBot(input);
        await refreshChannelSnapshots();
        appendAuditEvent("slack.connected", "channels", {
          secretName: input.secretName,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("slack.connected", {
          secretName: input.secretName,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await slack.status();
        await refreshChannelSnapshots();
        return status;
      },
      sendMessage: (input) => slack.sendMessage(input),
      listChannels: (query) => slack.listChannels(query),
      getChannel: (channelId) => slack.getChannel(channelId),
    },
    whatsapp: {
      connect: async (input) => {
        const status = await whatsapp.connect(input);
        await refreshChannelSnapshots();
        appendAuditEvent("whatsapp.connected", "channels", {
          mode: input.mode,
          runtimeAdapter: adapter.id,
        });
        eventBus.emit("whatsapp.connected", {
          mode: input.mode,
          runtimeAdapter: adapter.id,
        });
        return status;
      },
      status: async () => {
        const status = await whatsapp.status();
        await refreshChannelSnapshots();
        return status;
      },
      sendMessage: (input) => whatsapp.sendMessage(input),
      disconnect: async () => {
        const status = await whatsapp.disconnect();
        await refreshChannelSnapshots();
        appendAuditEvent("whatsapp.disconnected", "channels", { runtimeAdapter: adapter.id });
        eventBus.emit("whatsapp.disconnected", { runtimeAdapter: adapter.id });
        return status;
      },
    },
    inference: {
      generateText: async (input) => generateRuntimeText({
        ...input,
        agentId: input.agentId ?? options.workspace.agentId,
      }, {
        fetchImpl: input.transport === "cli" ? undefined : globalThis.fetch,
        runner: input.transport === "gateway" ? undefined : processHost,
        conversationAdapter: input.transport === "cli"
          ? { ...conversationAdapter, gateway: null }
          : conversationAdapter,
      }),
    },
    secrets: {
      list: async (search) => listSecrets(processHost, { search, env: resolvedRuntimeOptions.env }),
      describe: async (name) => describeSecret(processHost, { name, env: resolvedRuntimeOptions.env }),
      doctorKeychain: async () => doctorKeychain(processHost, { env: resolvedRuntimeOptions.env }),
      ensureHttpReference: async (input) => ensureHttpSecretReference(processHost, input, { env: resolvedRuntimeOptions.env }),
      ensureTelegramBotReference: async (input) => ensureTelegramBotSecretReference(processHost, input, { env: resolvedRuntimeOptions.env }),
    },
    conversations: {
      createSession: (title) => {
        const session = conversationStore.createSession(title);
        appendAuditEvent("conversations.session_created", "conversations", {
          sessionId: session.sessionId,
          title: session.title,
        });
        eventBus.emit("conversations.session_created", {
          sessionId: session.sessionId,
          title: session.title,
        });
        return session;
      },
      appendMessage: (sessionId, message) => {
        const session = conversationStore.appendMessage(sessionId, message);
        appendAuditEvent("conversations.message_appended", "conversations", {
          sessionId,
          role: message.role,
        });
        eventBus.emit("conversations.message_appended", {
          sessionId,
          role: message.role,
        });
        return session;
      },
      listSessions: conversationStore.listSessions.bind(conversationStore),
      searchSessions: searchConversationSessions,
      getSession: conversationStore.getSession.bind(conversationStore),
      updateSessionTitle: (sessionId, title) => {
        const updated = conversationStore.updateSessionTitle(sessionId, title);
        if (updated) {
          appendAuditEvent("conversations.title_updated", "conversations", {
            sessionId,
            title,
          });
          eventBus.emit("conversations.title_updated", {
            sessionId,
            title,
          });
        }
        return updated;
      },
      generateTitle: async (input) => {
        const session = conversationStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        const title = await generateRuntimeConversationTitle({
          messages: session.messages,
          conversationAdapter: input.transport === "cli" ? { ...conversationAdapter, gateway: null } : conversationAdapter,
          ...(input.transport === "gateway" ? { runner: undefined } : { agentId: options.workspace.agentId, runner: processHost }),
          ...(input.transport === "cli" ? { fetchImpl: undefined } : { fetchImpl: globalThis.fetch }),
        });
        conversationStore.updateSessionTitle(input.sessionId, title);
        appendAuditEvent("conversations.title_generated", "conversations", {
          sessionId: input.sessionId,
          title,
        });
        eventBus.emit("conversations.title_generated", {
          sessionId: input.sessionId,
          title,
        });
        return title;
      },
      streamAssistantReplyEvents: async function* (input) {
        const session = conversationStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        if (!session.messages.some((message) => message.role === "user")) {
          throw new Error(`Session requires at least one user message: ${input.sessionId}`);
        }

        let fullText = "";
        let completed = false;
        let failed = false;

        for await (const event of streamRuntimeConversationEvents({
          sessionId: input.sessionId,
          agentId: options.workspace.agentId,
          systemPrompt: input.systemPrompt,
          contextBlocks: input.contextBlocks,
          messages: session.messages,
          transport: input.transport,
          chunkSize: input.chunkSize,
          gatewayRetries: input.gatewayRetries,
          signal: input.signal,
        }, {
          conversationAdapter,
          runner: processHost,
        })) {
          if (event.type === "chunk") {
            fullText += event.chunk.delta;
          }
          if (event.type === "done") {
            completed = true;
          }
          if (event.type === "error" || event.type === "aborted") {
            failed = true;
          }
          if (event.type === "title") {
            conversationStore.updateSessionTitle(input.sessionId, event.title);
            appendAuditEvent("conversations.title_suggested", "conversations", {
              sessionId: input.sessionId,
              title: event.title,
              source: event.source,
            });
            eventBus.emit("conversations.title_suggested", {
              sessionId: input.sessionId,
              title: event.title,
              source: event.source,
            });
          }
          yield event;
        }

        if (completed && !failed && fullText.trim()) {
          conversationStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: fullText.trim(),
          });
          appendAuditEvent("conversations.assistant_stream_persisted", "conversations", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
          eventBus.emit("conversations.assistant_stream_persisted", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
        }
      },
      streamAssistantReply: async function* (input) {
        const session = conversationStore.getSession(input.sessionId);
        if (!session) {
          throw new Error(`Session not found: ${input.sessionId}`);
        }
        if (!session.messages.some((message) => message.role === "user")) {
          throw new Error(`Session requires at least one user message: ${input.sessionId}`);
        }

        let fullText = "";

        for await (const chunk of streamRuntimeConversation({
          sessionId: input.sessionId,
          agentId: options.workspace.agentId,
          systemPrompt: input.systemPrompt,
          contextBlocks: input.contextBlocks,
          messages: session.messages,
          transport: input.transport,
          chunkSize: input.chunkSize,
          gatewayRetries: input.gatewayRetries,
          signal: input.signal,
        }, {
          conversationAdapter,
          runner: processHost,
        })) {
          if (!chunk.done) {
            fullText += chunk.delta;
          }
          yield chunk;
        }

        if (fullText.trim()) {
          conversationStore.appendMessage(input.sessionId, {
            role: "assistant",
            content: fullText.trim(),
          });
          appendAuditEvent("conversations.assistant_stream_persisted", "conversations", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
          eventBus.emit("conversations.assistant_stream_persisted", {
            sessionId: input.sessionId,
            length: fullText.trim().length,
          });
        }
      },
    },
    data: dataStore,
    orchestration: {
      snapshot: async () => {
        const status = await adapter.getStatus(processHost, resolvedRuntimeOptions);
        const compat = adapter.buildCompatReport(status);
        const doctor = adapter.buildDoctorReport(status);
        const manifest = readWorkspaceManifest(workspaceDir, filesystem);
        const workspaceValidation = validateWorkspace(workspaceDir, filesystem, adapter.workspaceFiles);
        const authSummaries = await readProviderAuth();
        const authReady = Object.values(authSummaries).some((summary) => summary.hasAuth);
        const modelReady = !!(await readDefaultModel());

        return buildOrchestrationSnapshot({
          runtime: status,
          compat,
          doctor,
          workspaceReady: !!manifest && workspaceValidation.ok,
          authReady,
          modelReady,
          fileSyncReady: !!options.templates?.pack,
        });
      },
    },
    watch: {
      file: (fileName, callback, watchOptions) => watchWorkspaceFile(workspaceDir, fileName, callback, watchOptions),
      transcript: (sessionId, callback, watchOptions) => watchConversationTranscript(workspaceDir, sessionId, callback, watchOptions),
      runtimeStatus: (callback, watchOptions) => watchRuntimeStatus(
        () => adapter.getStatus(processHost, resolvedRuntimeOptions),
        callback,
        watchOptions,
      ),
      providerStatus: (callback, watchOptions) => watchProviderStatus(
        async () => {
          const summaries = await readProviderAuth();
          persistProviderState(summaries, []);
          return summaries;
        },
        callback,
        watchOptions,
      ),
      events: (type, listener) => eventBus.on(type, listener),
      eventsIterator: (type = "*") => eventBus.iterate(type),
    },
  };
}

export const Claw: ClawFactory = Object.assign(
  async (options: CreateClawOptions) => createClaw(options),
  { create: createClaw },
);
