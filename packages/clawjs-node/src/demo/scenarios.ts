import type {
  ChannelDescriptor,
  DefaultModelRef,
  MemoryDescriptor,
  ModelDescriptor,
  ProviderDescriptor,
  SchedulerDescriptor,
  SkillDescriptor,
} from "@clawjs/core";

export interface DemoScenarioAuthSeed {
  hasAuth?: boolean;
  hasSubscription?: boolean;
  hasApiKey?: boolean;
  hasProfileApiKey?: boolean;
  hasEnvKey?: boolean;
  authType?: "oauth" | "token" | "api_key" | "env" | null;
  maskedCredential?: string | null;
}

export interface DemoScenario {
  id: DemoScenarioId;
  title: string;
  summary: string;
  providers: ProviderDescriptor[];
  models: ModelDescriptor[];
  defaultModel: DefaultModelRef | null;
  auth: Record<string, DemoScenarioAuthSeed>;
  schedulers: SchedulerDescriptor[];
  memory: MemoryDescriptor[];
  skills: SkillDescriptor[];
  channels: ChannelDescriptor[];
  chat?: {
    assistantResponse?: string;
  };
}

const SETTINGS_RUNTIME_AGENTS_SCENARIO: DemoScenario = {
  id: "settings-runtime-agents",
  title: "Settings Runtime Agents",
  summary: "Demo runtime snapshot for settings, auth, models, and workspace orchestration flows.",
  providers: [
    {
      id: "anthropic",
      label: "Anthropic",
      envVars: ["ANTHROPIC_API_KEY"],
      auth: { supportsApiKey: true, supportsEnv: true },
    },
    {
      id: "openai",
      label: "OpenAI",
      envVars: ["OPENAI_API_KEY"],
      auth: { supportsApiKey: true, supportsEnv: true },
    },
    {
      id: "google",
      label: "Google",
      envVars: ["GEMINI_API_KEY"],
      auth: { supportsApiKey: true, supportsEnv: true, supportsOAuth: true },
    },
  ],
  models: [
    {
      id: "anthropic/claude-sonnet-4",
      provider: "anthropic",
      label: "Claude Sonnet 4",
      available: true,
      source: "runtime",
    },
    {
      id: "openai/gpt-5-mini",
      provider: "openai",
      label: "GPT-5 Mini",
      available: true,
      source: "runtime",
    },
    {
      id: "google/gemini-2.5-pro",
      provider: "google",
      label: "Gemini 2.5 Pro",
      available: true,
      source: "runtime",
    },
  ],
  defaultModel: {
    provider: "anthropic",
    modelId: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
  },
  auth: {
    anthropic: {
      hasAuth: true,
      hasSubscription: true,
      hasApiKey: true,
      hasProfileApiKey: true,
      authType: "api_key",
      maskedCredential: "••••demo",
    },
    openai: {
      hasAuth: false,
      hasSubscription: false,
      hasApiKey: false,
      hasProfileApiKey: false,
      authType: null,
    },
    google: {
      hasAuth: true,
      hasSubscription: true,
      hasEnvKey: true,
      authType: "env",
      maskedCredential: "••••env",
    },
  },
  schedulers: [
    {
      id: "morning-sync",
      label: "Morning Sync",
      enabled: true,
      status: "idle",
      kind: "routine",
    },
  ],
  memory: [
    {
      id: "workspace-profile",
      label: "Workspace Profile",
      kind: "file",
      path: "MEMORY.md",
      summary: "Workspace profile and guardrails.",
      updatedAt: "2026-03-24T09:00:00.000Z",
    },
  ],
  skills: [
    {
      id: "triage",
      label: "Triage",
      enabled: true,
      scope: "workspace",
      path: "skills/triage.ts",
    },
  ],
  channels: [
    {
      id: "openclaw-gateway",
      label: "OpenClaw Gateway",
      kind: "chat",
      status: "connected",
      endpoint: "http://127.0.0.1:4317",
      provider: "openclaw",
    },
  ],
  chat: {
    assistantResponse: "Demo runtime reply from the settings-runtime-agents scenario.",
  },
};

const DEMO_SCENARIOS = {
  "settings-runtime-agents": SETTINGS_RUNTIME_AGENTS_SCENARIO,
} satisfies Record<string, DemoScenario>;

export type DemoScenarioId = keyof typeof DEMO_SCENARIOS;

export const DEFAULT_DEMO_SCENARIO_ID: DemoScenarioId = "settings-runtime-agents";

export function listDemoScenarios(): DemoScenario[] {
  return Object.values(DEMO_SCENARIOS);
}

export function getDemoScenario(id: DemoScenarioId): DemoScenario {
  return DEMO_SCENARIOS[id];
}

export function resolveDemoScenarioId(
  env: NodeJS.ProcessEnv | undefined = process.env,
): DemoScenarioId {
  const requested = env?.CLAWJS_DEMO_SCENARIO?.trim();
  if (requested && requested in DEMO_SCENARIOS) {
    return requested as DemoScenarioId;
  }
  return DEFAULT_DEMO_SCENARIO_ID;
}
