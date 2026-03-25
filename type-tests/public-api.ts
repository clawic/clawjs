import type { BindingDefinition, ProviderAuthSummary } from "@clawjs/core";
import type { ClawInstance, CreateClawOptions, DemoScenarioId } from "@clawjs/claw";
import { Claw, buildDemoRuntimeEnv, createClaw } from "@clawjs/claw";

type Assert<T extends true> = T;
type IsAssignable<TLeft, TRight> = TLeft extends TRight ? true : false;

type _CreateOptions = Assert<IsAssignable<CreateClawOptions, {
  runtime: { adapter: string };
  workspace: {
    appId: string;
    workspaceId: string;
    agentId: string;
    rootDir: string;
  };
}>>;

type _CreateReturn = Assert<IsAssignable<Awaited<ReturnType<typeof createClaw>>, ClawInstance>>;
type _ClawReturn = Assert<IsAssignable<Awaited<ReturnType<typeof Claw>>, ClawInstance>>;

const binding: BindingDefinition = {
  id: "tone",
  targetFile: "SOUL.md",
  mode: "managed_block",
  blockId: "tone",
  settingsPath: "tone",
};

void binding;

const providerSummary: ProviderAuthSummary = {
  provider: "openai",
  hasAuth: true,
  hasSubscription: true,
  hasApiKey: true,
  hasProfileApiKey: true,
  hasEnvKey: false,
  authType: "api_key",
  maskedCredential: "*******5678",
};

void providerSummary;

const scenarioId: DemoScenarioId = "settings-runtime-agents";
const demoEnv = buildDemoRuntimeEnv(scenarioId);

void demoEnv;

async function exercise(instance: ClawInstance) {
  instance.files.syncBinding(binding, { tone: "direct" }, (settings) => String(settings.tone));
  await instance.auth.login("openai");
  await instance.conversations.searchSessions({
    query: "release checklist",
    strategy: "local",
  });
  instance.generations.backends();
  instance.image.backends();
  instance.audio.list();
  instance.video.get("gen-123");
  for await (const event of instance.watch.eventsIterator("*")) {
    void event.type;
    break;
  }
}

void exercise;
