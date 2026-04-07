import { z } from "zod";

export const capabilityStatusSchema = z.enum([
  "unknown",
  "unsupported",
  "unavailable",
  "detected",
  "installing",
  "installed",
  "configuring",
  "ready",
  "degraded",
  "repairable",
  "error",
]);

export const runtimeCapabilityStrategySchema = z.enum([
  "native",
  "cli",
  "gateway",
  "config",
  "derived",
  "hosted",
  "bridge",
  "unsupported",
]);

export const runtimeCapabilitySupportSchema = z.object({
  supported: z.boolean(),
  status: capabilityStatusSchema,
  strategy: runtimeCapabilityStrategySchema,
  diagnostics: z.record(z.unknown()).optional(),
  limitations: z.array(z.string()).optional(),
});

export const manifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  appId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  runtimeAdapter: z.string().min(1),
  rootDir: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  templatePackPath: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  logicalAgentId: z.string().min(1).optional(),
  runtimeAgentId: z.string().min(1).optional(),
  materializationVersion: z.number().int().positive().optional(),
});

export const compatSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  runtimeAdapter: z.string().min(1),
  runtimeVersion: z.string().nullable(),
  probedAt: z.string().min(1),
  capabilities: z.record(z.boolean()),
  capabilityMap: z.record(runtimeCapabilitySupportSchema).optional(),
  diagnostics: z.record(z.unknown()).optional(),
});

export const capabilityReportSchema = z.object({
  schemaVersion: z.number().int().positive(),
  generatedAt: z.string().min(1),
  runtimeAdapter: z.string().min(1),
  runtimeVersion: z.string().nullable(),
  degraded: z.boolean(),
  capabilities: z.record(z.boolean()),
  capabilityMap: z.record(runtimeCapabilitySupportSchema).optional(),
  issues: z.array(z.string()),
  diagnostics: z.record(z.unknown()).optional(),
});

export const workspaceStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  appId: z.string().min(1),
  workspaceId: z.string().min(1),
  agentId: z.string().min(1),
  rootDir: z.string().min(1),
  manifestPresent: z.boolean(),
  missingFiles: z.array(z.string()),
  missingDirectories: z.array(z.string()),
  projectId: z.string().min(1).optional(),
  logicalAgentId: z.string().min(1).optional(),
  runtimeAgentId: z.string().min(1).optional(),
  materializationVersion: z.number().int().positive().optional(),
});

export const providerStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  providers: z.record(z.object({
    provider: z.string().min(1),
    hasAuth: z.boolean(),
    hasSubscription: z.boolean(),
    hasApiKey: z.boolean(),
    hasProfileApiKey: z.boolean(),
    hasEnvKey: z.boolean(),
    authType: z.enum(["oauth", "token", "api_key", "env"]).nullable(),
    maskedCredential: z.string().nullable().optional(),
  })),
  missingProvidersInUse: z.array(z.string()).optional(),
});

export const schedulerStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  schedulers: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    status: z.enum(["idle", "running", "paused", "unknown"]),
    kind: z.enum(["cron", "routine", "job", "daemon", "workflow"]).optional(),
  })),
});

export const memoryStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  memory: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["file", "store", "index", "session", "knowledge"]),
    path: z.string().min(1).optional(),
    summary: z.string().optional(),
    updatedAt: z.string().optional(),
  })),
});

export const skillsStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  skills: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    enabled: z.boolean(),
    scope: z.enum(["workspace", "runtime", "global"]).optional(),
    path: z.string().min(1).optional(),
  })),
});

export const skillSourceCapabilitiesSchema = z.object({
  search: z.boolean(),
  install: z.boolean(),
  resolveExact: z.boolean(),
});

export const skillSourceDescriptorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["ready", "degraded", "unsupported"]),
  capabilities: skillSourceCapabilitiesSchema,
  summary: z.string().min(1).optional(),
  warnings: z.array(z.string()).optional(),
});

export const skillCatalogEntrySchema = z.object({
  source: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  summary: z.string().optional(),
  installRef: z.string().min(1),
  homepage: z.string().min(1).optional(),
});

export const skillSearchResultSchema = z.object({
  query: z.string().min(1),
  entries: z.array(skillCatalogEntrySchema),
  sources: z.array(skillSourceDescriptorSchema),
  omittedSources: z.array(z.object({
    source: z.string().min(1),
    reason: z.string().min(1),
  })).optional(),
  warnings: z.array(z.string()).optional(),
});

export const skillInstallResultSchema = z.object({
  source: z.string().min(1),
  slug: z.string().min(1),
  label: z.string().min(1),
  installRef: z.string().min(1),
  homepage: z.string().min(1).optional(),
  installedPaths: z.array(z.string().min(1)).optional(),
  runtimeVisibility: z.enum(["runtime", "external", "unknown"]),
  warnings: z.array(z.string()).optional(),
});

export const channelsStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  channels: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    kind: z.enum(["chat", "email", "webhook", "voice", "social", "unknown"]),
    status: z.enum(["connected", "disconnected", "configured", "degraded", "unknown"]),
    endpoint: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    lastSyncAt: z.string().min(1).optional(),
    lastError: z.string().nullable().optional(),
    metadata: z.record(z.unknown()).optional(),
  })),
  details: z.record(z.unknown()).optional(),
});

export const telegramBotProfileSchema = z.object({
  id: z.string().min(1),
  isBot: z.boolean(),
  username: z.string().min(1).optional(),
  firstName: z.string().min(1),
  canJoinGroups: z.boolean().optional(),
  canReadAllGroupMessages: z.boolean().optional(),
  supportsInlineQueries: z.boolean().optional(),
});

export const telegramWebhookStatusSchema = z.object({
  url: z.string().min(1).optional(),
  hasCustomCertificate: z.boolean().optional(),
  pendingUpdateCount: z.number().int().nonnegative().optional(),
  ipAddress: z.string().min(1).optional(),
  lastErrorDate: z.number().int().nonnegative().optional(),
  lastErrorMessage: z.string().min(1).optional(),
  lastSynchronizationErrorDate: z.number().int().nonnegative().optional(),
  maxConnections: z.number().int().positive().optional(),
  allowedUpdates: z.array(z.string()).optional(),
  secretTokenConfigured: z.boolean().optional(),
});

export const telegramTransportStatusSchema = z.object({
  mode: z.enum(["webhook", "polling", "disabled"]),
  active: z.boolean(),
  webhook: telegramWebhookStatusSchema.nullable().optional(),
  lastSyncAt: z.string().min(1).optional(),
  lastUpdateId: z.number().int().nonnegative().optional(),
  pendingUpdateCount: z.number().int().nonnegative().optional(),
  pollerPid: z.number().int().positive().nullable().optional(),
});

export const telegramChatSummarySchema = z.object({
  id: z.string().min(1),
  type: z.enum(["private", "group", "supergroup", "channel"]),
  title: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isForum: z.boolean().optional(),
  inviteLink: z.string().min(1).optional(),
  lastSeenAt: z.string().min(1).optional(),
});

export const telegramMemberSummarySchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["creator", "administrator", "member", "restricted", "left", "kicked"]),
  username: z.string().min(1).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isBot: z.boolean().optional(),
  canBeEdited: z.boolean().optional(),
  permissions: z.record(z.boolean()).optional(),
});

export const telegramUpdateEnvelopeSchema = z.object({
  updateId: z.number().int().nonnegative(),
  type: z.enum(["message", "edited_message", "callback_query", "my_chat_member", "chat_member", "unknown"]),
  chatId: z.string().min(1).optional(),
  messageId: z.number().int().nonnegative().optional(),
  chatType: z.string().min(1).optional(),
  receivedAt: z.string().min(1),
  raw: z.record(z.unknown()).optional(),
});

export const telegramCommandSchema = z.object({
  command: z.string().min(1),
  description: z.string().min(1),
});

export const telegramStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  connected: z.boolean(),
  apiBaseUrl: z.string().min(1).optional(),
  secretName: z.string().min(1).optional(),
  maskedCredential: z.string().nullable().optional(),
  botProfile: telegramBotProfileSchema.nullable().optional(),
  transport: telegramTransportStatusSchema,
  commands: z.array(telegramCommandSchema),
  recentErrors: z.array(z.string()),
  knownChats: z.array(telegramChatSummarySchema),
});

// ── Slack schemas ────────────────────────────────────────────────────

export const slackBotProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  teamName: z.string().min(1).optional(),
  botUserId: z.string().min(1).optional(),
  appId: z.string().min(1).optional(),
  icons: z.record(z.string()).optional(),
});

export const slackChannelSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["channel", "group", "im", "mpim"]),
  topic: z.string().optional(),
  purpose: z.string().optional(),
  memberCount: z.number().int().nonnegative().optional(),
  isArchived: z.boolean().optional(),
  isMember: z.boolean().optional(),
  lastMessageAt: z.string().min(1).optional(),
});

export const slackTransportStatusSchema = z.object({
  mode: z.enum(["socket", "events-api", "disabled"]),
  active: z.boolean(),
  eventsUrl: z.string().nullable().optional(),
  lastSyncAt: z.string().min(1).optional(),
  lastError: z.string().nullable().optional(),
});

export const slackStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  connected: z.boolean(),
  secretName: z.string().min(1).optional(),
  maskedCredential: z.string().nullable().optional(),
  botProfile: slackBotProfileSchema.nullable().optional(),
  transport: slackTransportStatusSchema,
  recentErrors: z.array(z.string()),
  knownChannels: z.array(slackChannelSummarySchema),
});

// ── WhatsApp schemas ─────────────────────────────────────────────────

export const whatsappBotProfileSchema = z.object({
  phoneNumber: z.string().min(1),
  displayName: z.string().min(1),
  platform: z.enum(["business-api", "wacli-bridge"]),
  verified: z.boolean().optional(),
});

export const whatsappTransportStatusSchema = z.object({
  mode: z.enum(["wacli", "business-api", "disabled"]),
  active: z.boolean(),
  authenticated: z.boolean().optional(),
  lastSyncAt: z.string().min(1).optional(),
  lastError: z.string().nullable().optional(),
  qrText: z.string().nullable().optional(),
});

export const whatsappStateSnapshotSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: z.string().min(1),
  connected: z.boolean(),
  secretName: z.string().min(1).optional(),
  maskedCredential: z.string().nullable().optional(),
  botProfile: whatsappBotProfileSchema.nullable().optional(),
  transport: whatsappTransportStatusSchema,
  recentErrors: z.array(z.string()),
  canSendMessages: z.boolean(),
});

export const intentDomainSchema = z.enum([
  "runtime",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "files",
  "conversations",
  "speech",
]);

export const observedDomainSchema = z.enum([
  "runtime",
  "workspace",
  "models",
  "providers",
  "channels",
  "skills",
  "plugins",
  "memory",
  "scheduler",
  "conversations",
]);

export const featureOwnershipSchema = z.enum(["sdk-owned", "runtime-owned", "mirrored"]);
export const conversationPolicySchema = z.enum(["managed", "mirror", "native"]);

export const runtimeFeatureDescriptorSchema = z.object({
  featureId: z.string().min(1),
  ownership: featureOwnershipSchema,
  supported: z.boolean(),
  conversationPolicy: conversationPolicySchema.optional(),
  limitations: z.array(z.string()).optional(),
});

export const linkedEntityRefSchema = z.object({
  domain: z.enum(["task", "note", "person", "inbox_thread", "inbox_message", "event"]),
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
});

export const workspaceEntitySourceSchema = z.object({
  kind: z.enum(["local", "channel", "imported", "derived"]),
  channel: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});

const workspaceRecordBaseShape = {
  id: z.string().min(1),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  archivedAt: z.string().min(1).optional(),
  source: workspaceEntitySourceSchema,
  links: z.array(linkedEntityRefSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
} satisfies z.ZodRawShape;

export const taskChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  completed: z.boolean(),
});

export const taskRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done", "cancelled"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  labels: z.array(z.string()),
  assigneePersonId: z.string().min(1).optional(),
  watcherPersonIds: z.array(z.string()),
  dueAt: z.string().min(1).optional(),
  scheduledEventId: z.string().min(1).optional(),
  parentTaskId: z.string().min(1).optional(),
  childTaskIds: z.array(z.string()),
  checklist: z.array(taskChecklistItemSchema),
});

export const noteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["paragraph", "heading", "bullet_list", "checklist", "quote", "code"]),
  text: z.string(),
});

export const noteRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  blocks: z.array(noteBlockSchema),
  tags: z.array(z.string()),
  summary: z.string().optional(),
  attachments: z.array(z.object({
    name: z.string().min(1),
    mimeType: z.string().min(1),
    data: z.string().optional(),
    preview: z.string().optional(),
  })).optional(),
  linkedEntityIds: z.array(z.string()),
  searchText: z.string(),
});

export const personIdentitySchema = z.object({
  channel: z.string().min(1),
  handle: z.string().min(1),
  externalId: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
});

export const personRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  displayName: z.string().min(1),
  kind: z.enum(["human", "agent", "org"]),
  identities: z.array(personIdentitySchema),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  handles: z.array(z.string()),
  role: z.string().optional(),
  organization: z.string().optional(),
});

export const eventReminderSchema = z.object({
  id: z.string().min(1),
  minutesBeforeStart: z.number().int(),
  channel: z.string().min(1).optional(),
});

export const eventRecordSchema = z.object({
  ...workspaceRecordBaseShape,
  title: z.string().min(1),
  description: z.string().optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  location: z.string().optional(),
  attendeePersonIds: z.array(z.string()),
  linkedTaskIds: z.array(z.string()),
  linkedNoteIds: z.array(z.string()),
  reminders: z.array(eventReminderSchema),
});

export const workspaceSearchQuerySchema = z.object({
  query: z.string().min(1),
  domains: z.array(z.enum(["tasks", "notes", "people", "inbox", "events"])).optional(),
  strategy: z.enum(["auto", "keyword", "semantic", "hybrid"]).optional(),
  limit: z.number().int().positive().optional(),
  includeArchived: z.boolean().optional(),
});

export const workspaceSearchResultSchema = z.object({
  domain: z.enum(["tasks", "notes", "people", "inbox", "events"]),
  id: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string(),
  score: z.number(),
  strategy: z.enum(["keyword", "semantic", "hybrid"]),
  matchedFields: z.array(z.string()),
  links: z.array(linkedEntityRefSchema).optional(),
  updatedAt: z.string().min(1).optional(),
});

export const auditEventSchema = z.object({
  timestamp: z.string().min(1),
  event: z.string().min(1),
  capability: z.enum([
    "runtime",
    "workspace",
    "orchestration",
    "templates",
    "file_sync",
    "providers",
    "models",
    "auth",
    "conversations",
    "watchers",
    "compat",
    "doctor",
    "cli",
    "scheduler",
    "memory",
    "skills",
    "channels",
    "sandbox",
    "plugins",
    "tasks",
    "notes",
    "people",
    "inbox",
    "events",
    "workspace_search",
    "workspace_context",
    "workspace_ui",
  ]).optional(),
  detail: z.record(z.unknown()).optional(),
});

export const templateMutationSchema = z.object({
  targetFile: z.string().min(1),
  mode: z.enum([
    "seed_if_missing",
    "replace_full",
    "prepend",
    "append",
    "insert_before_anchor",
    "insert_after_anchor",
    "managed_block",
  ]),
  content: z.string().optional(),
  anchor: z.string().optional(),
  blockId: z.string().optional(),
  visibleToUser: z.boolean().optional(),
  required: z.boolean().optional(),
});

export const templatePackSchema = z.object({
  schemaVersion: z.number().int().positive(),
  id: z.string().min(1),
  name: z.string().min(1),
  mutations: z.array(templateMutationSchema),
});

export const bindingDefinitionSchema = z.object({
  id: z.string().min(1),
  targetFile: z.string().min(1),
  mode: z.enum([
    "managed_block",
    "insert_before_anchor",
    "insert_after_anchor",
    "append",
    "prepend",
  ]),
  blockId: z.string().optional(),
  anchor: z.string().optional(),
  required: z.boolean().optional(),
  visibleToUser: z.boolean().optional(),
  settingsPath: z.string().min(1),
});
