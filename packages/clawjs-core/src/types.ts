export type CapabilityName =
  | "runtime"
  | "workspace"
  | "orchestration"
  | "templates"
  | "file_sync"
  | "providers"
  | "models"
  | "auth"
  | "conversations"
  | "watchers"
  | "compat"
  | "doctor"
  | "cli"
  | "scheduler"
  | "memory"
  | "skills"
  | "channels"
  | "sandbox"
  | "plugins"
  | "tasks"
  | "notes"
  | "people"
  | "inbox"
  | "events"
  | "workspace_search"
  | "workspace_context"
  | "workspace_ui";

export type CapabilityStatus =
  | "unknown"
  | "unsupported"
  | "unavailable"
  | "detected"
  | "installing"
  | "installed"
  | "configuring"
  | "ready"
  | "degraded"
  | "repairable"
  | "error";

export type FileMutationMode =
  | "seed_if_missing"
  | "replace_full"
  | "prepend"
  | "append"
  | "insert_before_anchor"
  | "insert_after_anchor"
  | "managed_block";

export type KnownRuntimeAdapterId =
  | "demo"
  | "openclaw"
  | "zeroclaw"
  | "picoclaw"
  | "nanobot"
  | "nanoclaw"
  | "nullclaw"
  | "ironclaw"
  | "nemoclaw"
  | "hermes";
export type RuntimeAdapterId = KnownRuntimeAdapterId | (string & {});
export type RuntimeAdapterStability = "stable" | "experimental" | "demo";
export type RuntimeAdapterSupportLevel = "production" | "experimental" | "demo";
export type RuntimeFileSeedPolicy = "seed_if_missing" | "never";
export type RuntimeCapabilityKey =
  | "runtime"
  | "workspace"
  | "auth"
  | "models"
  | "conversation_cli"
  | "conversation_gateway"
  | "streaming"
  | "scheduler"
  | "memory"
  | "skills"
  | "channels"
  | "sandbox"
  | "plugins"
  | "doctor"
  | "compat";
export type RuntimeCapabilityStrategy = "native" | "cli" | "gateway" | "config" | "derived" | "hosted" | "bridge" | "unsupported";

export interface CapabilityState {
  name: CapabilityName;
  status: CapabilityStatus;
  checkedAt?: string;
  lastError?: string | null;
  progressPhase?: string | null;
  recommendedActions?: string[];
  diagnostics?: Record<string, unknown>;
}

export interface RuntimeCapabilitySupport {
  supported: boolean;
  status: CapabilityStatus;
  strategy: RuntimeCapabilityStrategy;
  diagnostics?: Record<string, unknown>;
  limitations?: string[];
}

export type RuntimeCapabilityMap = Record<RuntimeCapabilityKey, RuntimeCapabilitySupport> &
  Record<string, RuntimeCapabilitySupport>;

export interface RuntimeInfo {
  adapter: RuntimeAdapterId;
  runtimeName: string;
  version: string | null;
  capabilities: Record<string, boolean>;
  capabilityMap: RuntimeCapabilityMap;
  installed?: boolean;
}

export interface RuntimeFileDescriptor {
  key: string;
  path: string;
  required: boolean;
  visibleToUser: boolean;
  managedByRuntime?: boolean;
  seedPolicy?: RuntimeFileSeedPolicy;
}

export interface RuntimeLocations {
  homeDir?: string;
  configPath?: string;
  workspacePath?: string;
  authStorePath?: string;
  gatewayConfigPath?: string;
}

export interface RuntimeWorkspaceContract {
  files: RuntimeFileDescriptor[];
}

export interface ProjectResourceRef {
  id: string;
  label?: string;
  uri?: string;
  mode?: "allow" | "deny";
  metadata?: Record<string, unknown>;
}

export interface ProjectSecretRef {
  id: string;
  label?: string;
  secretName?: string;
  mode?: "allow" | "deny";
  metadata?: Record<string, unknown>;
}

export interface EffectiveAccessPolicy {
  resources: ProjectResourceRef[];
  secrets: ProjectSecretRef[];
}

export interface Project {
  projectId: string;
  displayName: string;
  description?: string;
  instructions?: string;
  resourceRefs?: ProjectResourceRef[];
  secretRefs?: ProjectSecretRef[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAgentAssignment {
  projectId: string;
  agentId: string;
  workspaceId: string;
  runtimeAgentId: string;
  displayName?: string;
  instructions?: string;
  effectiveAccessPolicy?: EffectiveAccessPolicy;
  createdAt: string;
  updatedAt: string;
}

/**
 * A workspace is the isolated ClawJS context.
 * `agentId` identifies the agent operating inside that workspace and is not
 * conceptually the same field even when examples use the same string value.
 */
export interface WorkspaceConfig {
  appId: string;
  workspaceId: string;
  agentId: string;
  rootDir: string;
  projectId?: string;
  logicalAgentId?: string;
  runtimeAgentId?: string;
  materializationVersion?: number;
}

export interface ClawManifest {
  schemaVersion: number;
  appId: string;
  workspaceId: string;
  agentId: string;
  runtimeAdapter: string;
  rootDir: string;
  createdAt: string;
  updatedAt: string;
  templatePackPath?: string;
  projectId?: string;
  logicalAgentId?: string;
  runtimeAgentId?: string;
  materializationVersion?: number;
}

export interface CompatSnapshot {
  schemaVersion: number;
  runtimeAdapter: string;
  runtimeVersion: string | null;
  probedAt: string;
  capabilities: Record<string, boolean>;
  capabilityMap?: RuntimeCapabilityMap;
  diagnostics?: Record<string, unknown>;
}

export interface CapabilityReport {
  schemaVersion: number;
  generatedAt: string;
  runtimeAdapter: string;
  runtimeVersion: string | null;
  degraded: boolean;
  capabilities: Record<string, boolean>;
  capabilityMap?: RuntimeCapabilityMap;
  issues: string[];
  diagnostics?: Record<string, unknown>;
}

export interface WorkspaceStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  appId: string;
  workspaceId: string;
  agentId: string;
  rootDir: string;
  manifestPresent: boolean;
  missingFiles: string[];
  missingDirectories: string[];
  projectId?: string;
  logicalAgentId?: string;
  runtimeAgentId?: string;
  materializationVersion?: number;
}

export interface ProviderStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  providers: Record<string, ProviderAuthSummary>;
  missingProvidersInUse?: string[];
}

export interface SchedulerStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  schedulers: SchedulerDescriptor[];
}

export interface MemoryStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  memory: MemoryDescriptor[];
}

export interface SkillsStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  skills: SkillDescriptor[];
}

export interface ChannelsStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  channels: ChannelDescriptor[];
  details?: Record<string, unknown>;
}

export interface TelegramStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  connected: boolean;
  apiBaseUrl?: string;
  secretName?: string;
  maskedCredential?: string | null;
  botProfile?: TelegramBotProfile | null;
  transport: TelegramTransportStatus;
  commands: TelegramCommand[];
  recentErrors: string[];
  knownChats: TelegramChatSummary[];
}

export type IntentDomain =
  | "runtime"
  | "models"
  | "providers"
  | "channels"
  | "skills"
  | "plugins"
  | "files"
  | "conversations"
  | "speech";

export type ObservedDomain =
  | "runtime"
  | "workspace"
  | "models"
  | "providers"
  | "channels"
  | "skills"
  | "plugins"
  | "memory"
  | "scheduler"
  | "conversations";

export type FeatureOwnership = "sdk-owned" | "runtime-owned" | "mirrored";
export type ConversationPolicy = "managed" | "mirror" | "native";

export interface RuntimeIntentState {
  schemaVersion: number;
  updatedAt: string;
  adapter: RuntimeAdapterId;
  locations?: Partial<RuntimeLocations>;
}

export interface ModelsIntentState {
  schemaVersion: number;
  updatedAt: string;
  defaultModel: string | null;
  logicalDefaults?: Record<string, string>;
}

export interface ProviderIntentConfig {
  enabled?: boolean;
  preferredAuthMode?: "oauth" | "token" | "api_key" | "env" | "secret_ref" | null;
  secretRef?: string | null;
  profileId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ProvidersIntentState {
  schemaVersion: number;
  updatedAt: string;
  providers: Record<string, ProviderIntentConfig>;
}

export interface ChannelIntentConfig {
  enabled?: boolean;
  kind?: ChannelDescriptor["kind"];
  provider?: string;
  secretRef?: string | null;
  mode?: string | null;
  config?: Record<string, unknown>;
}

export interface ChannelsIntentState {
  schemaVersion: number;
  updatedAt: string;
  channels: Record<string, ChannelIntentConfig>;
}

export interface DesiredSkillRecord {
  id: string;
  enabled: boolean;
  source?: string;
  installRef?: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface SkillsIntentState {
  schemaVersion: number;
  updatedAt: string;
  skills: DesiredSkillRecord[];
}

export interface PluginIntentConfig {
  enabled?: boolean;
  packageSpec?: string;
  config?: Record<string, unknown>;
}

export interface PluginsIntentState {
  schemaVersion: number;
  updatedAt: string;
  plugins: Record<string, PluginIntentConfig>;
  slots?: Record<string, string | null>;
}

export interface FilesIntentState {
  schemaVersion: number;
  updatedAt: string;
  values: Record<string, unknown>;
}

export interface ConversationsIntentState {
  schemaVersion: number;
  updatedAt: string;
  policy?: ConversationPolicy | null;
}

export interface SpeechIntentState {
  schemaVersion: number;
  updatedAt: string;
  tts?: Record<string, unknown>;
  stt?: Record<string, unknown>;
}

export interface RuntimeObservedState {
  schemaVersion: number;
  updatedAt: string;
  runtime: RuntimeInfo & {
    installed?: boolean;
    cliAvailable?: boolean;
    gatewayAvailable?: boolean;
    diagnostics?: Record<string, unknown>;
  };
}

export interface ModelsObservedState {
  schemaVersion: number;
  updatedAt: string;
  catalog: ModelCatalog;
  defaultModel: DefaultModelRef | null;
}

export interface PluginsObservedState {
  schemaVersion: number;
  updatedAt: string;
  plugins: Record<string, {
    installed: boolean;
    enabled: boolean;
    loaded?: boolean;
    status?: string | null;
    version?: string | null;
    error?: string | null;
  }>;
  slots?: Record<string, string | null>;
  diagnostics?: string[];
}

export interface ConversationsObservedState {
  schemaVersion: number;
  updatedAt: string;
  policy: ConversationPolicy;
  sessionCount: number;
  runtimePath?: string | null;
}

export interface RuntimeFeatureDescriptor {
  featureId: string;
  ownership: FeatureOwnership;
  supported: boolean;
  conversationPolicy?: ConversationPolicy;
  limitations?: string[];
}

export interface AuditEvent {
  timestamp: string;
  event: string;
  capability?: CapabilityName;
  detail?: Record<string, unknown>;
}

export type WorkspaceDomain =
  | "tasks"
  | "notes"
  | "people"
  | "inbox"
  | "events";

export type WorkspaceSearchStrategy =
  | "auto"
  | "keyword"
  | "semantic"
  | "hybrid";

export type LinkedEntityDomain =
  | "task"
  | "note"
  | "person"
  | "inbox_thread"
  | "inbox_message"
  | "event";

export interface LinkedEntityRef {
  domain: LinkedEntityDomain;
  id: string;
  label?: string;
  relationship?: string;
}

export interface WorkspaceEntitySource {
  kind: "local" | "channel" | "imported" | "derived";
  channel?: string;
  externalId?: string;
}

export interface WorkspaceRecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
  source: WorkspaceEntitySource;
  links?: LinkedEntityRef[];
  metadata?: Record<string, unknown>;
}

export interface TaskChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface TaskRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  labels: string[];
  assigneePersonId?: string;
  watcherPersonIds: string[];
  dueAt?: string;
  scheduledEventId?: string;
  parentTaskId?: string;
  childTaskIds: string[];
  checklist: TaskChecklistItem[];
}

export interface NoteBlock {
  id: string;
  type: "paragraph" | "heading" | "bullet_list" | "checklist" | "quote" | "code";
  text: string;
}

export interface NoteRecord extends WorkspaceRecordBase {
  title: string;
  blocks: NoteBlock[];
  tags: string[];
  summary?: string;
  attachments?: Attachment[];
  linkedEntityIds: string[];
  searchText: string;
}

export interface PersonIdentity {
  channel: string;
  handle: string;
  externalId?: string;
  label?: string;
}

export interface PersonRecord extends WorkspaceRecordBase {
  displayName: string;
  kind: "human" | "agent" | "org";
  identities: PersonIdentity[];
  emails: string[];
  phones: string[];
  handles: string[];
  role?: string;
  organization?: string;
}

export interface InboxReplyTarget {
  channel: string;
  threadId?: string;
  messageId?: string;
  address?: string;
}

export interface InboxThreadRecord extends WorkspaceRecordBase {
  channel: string;
  subject?: string;
  externalThreadId?: string;
  participantPersonIds: string[];
  status: "unread" | "read" | "archived";
  replyTarget?: InboxReplyTarget;
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  latestMessageAt?: string;
  preview?: string;
}

export interface InboxMessageRecord extends WorkspaceRecordBase {
  threadId: string;
  channel: string;
  externalThreadId?: string;
  externalMessageId?: string;
  participantPersonIds: string[];
  direction: "inbound" | "outbound" | "system";
  status: "unread" | "read" | "archived" | "draft" | "sent" | "failed";
  replyTarget?: InboxReplyTarget;
  attachments?: Attachment[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  content: string;
}

export interface EventReminder {
  id: string;
  minutesBeforeStart: number;
  channel?: string;
}

export interface EventRecord extends WorkspaceRecordBase {
  title: string;
  description?: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  attendeePersonIds: string[];
  linkedTaskIds: string[];
  linkedNoteIds: string[];
  reminders: EventReminder[];
}

export interface WorkspaceSearchQuery {
  query: string;
  domains?: WorkspaceDomain[];
  strategy?: WorkspaceSearchStrategy;
  limit?: number;
  includeArchived?: boolean;
}

export interface WorkspaceSearchResult {
  domain: WorkspaceDomain;
  id: string;
  title: string;
  snippet: string;
  score: number;
  strategy: Exclude<WorkspaceSearchStrategy, "auto">;
  matchedFields: string[];
  links?: LinkedEntityRef[];
  updatedAt?: string;
}

export interface WorkspaceSurfaceDescriptor {
  id: WorkspaceDomain;
  title: string;
  route: string;
  icon?: string;
  badgeId?: string;
  order: number;
}

export interface WorkspaceBadgeSummary {
  id: string;
  value: number;
  label: string;
}

export interface WorkspaceContextRequest {
  query?: string;
  domains?: WorkspaceDomain[];
  strategy?: Exclude<WorkspaceSearchStrategy, "semantic"> | "semantic";
  limit?: number;
  includeDoneTasks?: boolean;
  sessionId?: string;
  threadId?: string;
}

export interface WorkspaceContextBundle {
  request: WorkspaceContextRequest;
  generatedAt: string;
  blocks: PromptContextBlock[];
  results: WorkspaceSearchResult[];
}

export interface WorkspaceToolDescriptor {
  id: string;
  title: string;
  description: string;
  domain: WorkspaceDomain | "workspace";
}

export interface ProviderAuthSummary {
  provider: string;
  hasAuth: boolean;
  hasSubscription: boolean;
  hasApiKey: boolean;
  hasProfileApiKey: boolean;
  hasEnvKey: boolean;
  authType: "oauth" | "token" | "api_key" | "env" | null;
  maskedCredential?: string | null;
}

export interface AuthProfileSummary {
  profileId: string;
  provider: string;
  authType: "oauth" | "token" | "api_key" | "env";
  credentialSource: "runtime" | "config" | "store" | "env";
  maskedCredential?: string | null;
}

export interface CredentialSource {
  kind: "runtime" | "config" | "store" | "env";
  key?: string;
  location?: string;
}

export interface ProviderAlias {
  alias: string;
  canonicalProvider: string;
}

export interface ProviderDescriptor {
  id: string;
  label: string;
  local?: boolean;
  aliases?: ProviderAlias[];
  envVars?: string[];
  auth?: {
    supportsOAuth?: boolean;
    supportsToken?: boolean;
    supportsApiKey?: boolean;
    supportsEnv?: boolean;
  };
  credentialSources?: CredentialSource[];
}

export interface ProviderCatalog {
  providers: ProviderDescriptor[];
}

export interface ModelSummary {
  id: string;
  modelId?: string;
  provider: string;
  label: string;
  available?: boolean;
  isDefault?: boolean;
}

export interface ModelDescriptor extends ModelSummary {
  ref?: DefaultModelRef;
  source?: "runtime" | "config" | "workspace" | "derived";
}

export interface ModelCatalog {
  models: ModelDescriptor[];
  defaultModel?: DefaultModelRef | null;
}

export interface DefaultModelRef {
  provider?: string;
  modelId: string;
  label?: string;
}

export interface AuthState {
  providers: Record<string, ProviderAuthSummary>;
  diagnostics?: Record<string, unknown>;
}

export interface ConversationTransport {
  kind: "cli" | "gateway" | "hybrid";
  streaming: boolean;
  gatewayKind?: "openai-chat-completions" | "sse" | "ws";
}

export interface SchedulerDescriptor {
  id: string;
  label: string;
  enabled: boolean;
  status: "idle" | "running" | "paused" | "unknown";
  kind?: "cron" | "routine" | "job" | "daemon" | "workflow";
}

export interface MemoryDescriptor {
  id: string;
  label: string;
  kind: "file" | "store" | "index" | "session" | "knowledge";
  path?: string;
  summary?: string;
  updatedAt?: string;
}

export interface SkillDescriptor {
  id: string;
  label: string;
  enabled: boolean;
  scope?: "workspace" | "runtime" | "global";
  path?: string;
}

export interface SkillSourceCapabilities {
  search: boolean;
  install: boolean;
  resolveExact: boolean;
}

export interface SkillSourceDescriptor {
  id: string;
  label: string;
  status: "ready" | "degraded" | "unsupported";
  capabilities: SkillSourceCapabilities;
  summary?: string;
  warnings?: string[];
}

export interface SkillCatalogEntry {
  source: string;
  slug: string;
  label: string;
  summary?: string;
  installRef: string;
  homepage?: string;
}

export interface SkillSearchResult {
  query: string;
  entries: SkillCatalogEntry[];
  sources: SkillSourceDescriptor[];
  omittedSources?: Array<{
    source: string;
    reason: string;
  }>;
  warnings?: string[];
}

export interface SkillInstallResult {
  source: string;
  slug: string;
  label: string;
  installRef: string;
  homepage?: string;
  installedPaths?: string[];
  runtimeVisibility: "runtime" | "external" | "unknown";
  warnings?: string[];
}

export interface ChannelDescriptor {
  id: string;
  label: string;
  kind: "chat" | "email" | "webhook" | "voice" | "social" | "unknown";
  status: "connected" | "disconnected" | "configured" | "degraded" | "unknown";
  endpoint?: string;
  provider?: string;
  lastSyncAt?: string;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TelegramBotProfile {
  id: string;
  isBot: boolean;
  username?: string;
  firstName: string;
  canJoinGroups?: boolean;
  canReadAllGroupMessages?: boolean;
  supportsInlineQueries?: boolean;
}

export interface TelegramWebhookStatus {
  url?: string;
  hasCustomCertificate?: boolean;
  pendingUpdateCount?: number;
  ipAddress?: string;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  lastSynchronizationErrorDate?: number;
  maxConnections?: number;
  allowedUpdates?: string[];
  secretTokenConfigured?: boolean;
}

export interface TelegramTransportStatus {
  mode: "webhook" | "polling" | "disabled";
  active: boolean;
  webhook?: TelegramWebhookStatus | null;
  lastSyncAt?: string;
  lastUpdateId?: number;
  pendingUpdateCount?: number;
  pollerPid?: number | null;
}

export interface TelegramChatSummary {
  id: string;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  isForum?: boolean;
  inviteLink?: string;
  lastSeenAt?: string;
}

export interface TelegramMemberSummary {
  userId: string;
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  username?: string;
  firstName?: string;
  lastName?: string;
  isBot?: boolean;
  canBeEdited?: boolean;
  permissions?: Record<string, boolean>;
}

export interface TelegramUpdateEnvelope {
  updateId: number;
  type: "message" | "edited_message" | "callback_query" | "my_chat_member" | "chat_member" | "unknown";
  chatId?: string;
  messageId?: number;
  chatType?: string;
  receivedAt: string;
  raw?: Record<string, unknown>;
}

export interface TelegramCommand {
  command: string;
  description: string;
}

// ── Slack types ──────────────────────────────────────────────────────

export interface SlackBotProfile {
  id: string;
  name: string;
  teamId: string;
  teamName?: string;
  botUserId?: string;
  appId?: string;
  icons?: Record<string, string>;
}

export interface SlackChannelSummary {
  id: string;
  name: string;
  type: "channel" | "group" | "im" | "mpim";
  topic?: string;
  purpose?: string;
  memberCount?: number;
  isArchived?: boolean;
  isMember?: boolean;
  lastMessageAt?: string;
}

export interface SlackTransportStatus {
  mode: "socket" | "events-api" | "disabled";
  active: boolean;
  eventsUrl?: string | null;
  lastSyncAt?: string;
  lastError?: string | null;
}

export interface SlackStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  connected: boolean;
  secretName?: string;
  maskedCredential?: string | null;
  botProfile?: SlackBotProfile | null;
  transport: SlackTransportStatus;
  recentErrors: string[];
  knownChannels: SlackChannelSummary[];
}

// ── WhatsApp bot types ───────────────────────────────────────────────

export interface WhatsAppBotProfile {
  phoneNumber: string;
  displayName: string;
  platform: "business-api" | "wacli-bridge";
  verified?: boolean;
}

export interface WhatsAppTransportStatus {
  mode: "wacli" | "business-api" | "disabled";
  active: boolean;
  authenticated?: boolean;
  lastSyncAt?: string;
  lastError?: string | null;
  qrText?: string | null;
}

export interface WhatsAppStateSnapshot {
  schemaVersion: number;
  updatedAt: string;
  connected: boolean;
  secretName?: string;
  maskedCredential?: string | null;
  botProfile?: WhatsAppBotProfile | null;
  transport: WhatsAppTransportStatus;
  recentErrors: string[];
  canSendMessages: boolean;
}

export interface Attachment {
  name: string;
  mimeType: string;
  data?: string;
  preview?: string;
}

export interface ContextChip {
  type: string;
  id: string;
  label: string;
  emoji?: string;
}

export interface PromptContextBlock {
  title: string;
  content: string;
  id?: string;
}

export interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  createdAt: number;
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

export interface SessionRecord extends SessionSummary {
  messages: Message[];
}

export type ConversationSearchStrategy = "auto" | "local" | "openclaw-memory";
export type ConversationSearchField = "title" | "preview" | "message" | "memory";

export interface ConversationSearchInput {
  query: string;
  strategy?: ConversationSearchStrategy;
  limit?: number;
  includeMessages?: boolean;
  fallbackToLocal?: boolean;
  minScore?: number;
}

export interface ConversationSearchResult extends SessionSummary {
  snippet: string;
  score: number;
  strategy: Exclude<ConversationSearchStrategy, "auto">;
  matchedFields: ConversationSearchField[];
  sourcePath?: string;
  startLine?: number;
  endLine?: number;
}

export interface StreamChunk {
  sessionId: string;
  messageId?: string;
  delta: string;
  done: boolean;
}

export interface ProgressEvent {
  capability: CapabilityName;
  phase: string;
  message?: string;
  percent?: number;
  timestamp: string;
}

export interface TemplateMutation {
  targetFile: string;
  mode: FileMutationMode;
  content?: string;
  anchor?: string;
  blockId?: string;
  visibleToUser?: boolean;
  required?: boolean;
}

export interface TemplatePack {
  schemaVersion: number;
  id: string;
  name: string;
  mutations: TemplateMutation[];
}

export interface BindingDefinition {
  id: string;
  targetFile: string;
  mode: Extract<FileMutationMode, "managed_block" | "insert_before_anchor" | "insert_after_anchor" | "append" | "prepend">;
  blockId?: string;
  anchor?: string;
  required?: boolean;
  visibleToUser?: boolean;
  settingsPath: string;
}

export interface OrchestrationReadiness {
  overallStatus: CapabilityStatus;
  runtimeReady: boolean;
  workspaceReady: boolean;
  authReady: boolean;
  modelReady: boolean;
  fileSyncReady: boolean;
  recommendedActions: string[];
}
