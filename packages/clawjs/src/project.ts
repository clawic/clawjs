import fs from "fs";
import fsp from "fs/promises";
import path from "path";

import { createPackageName, createPascalCase, createTitle, type SupportedPackageManager } from "./scaffold.ts";

export const PROJECT_CONFIG_FILE = "claw.project.json";

export type ClawProjectType = "app" | "agent" | "server" | "workspace" | "skill" | "plugin";
export type ClawResourceType = "skill" | "plugin" | "provider" | "channel" | "command";
export type ClawIntegrationType = "provider" | "channel" | "telegram" | "scheduler" | "memory" | "workspace";

export interface ClawProjectResourceEntry {
  id: string;
  path: string;
}

export interface ClawProjectConfig {
  schemaVersion: number;
  type: ClawProjectType;
  name: string;
  title: string;
  runtime: {
    adapter: string;
  };
  workspace?: {
    appId: string;
    workspaceId: string;
    agentId: string;
  };
  directories: {
    skills?: string;
    plugins?: string;
    providers?: string;
    channels?: string;
    commands?: string;
    scheduler?: string;
    memory?: string;
  };
  resources: {
    skills: ClawProjectResourceEntry[];
    plugins: ClawProjectResourceEntry[];
    providers: ClawProjectResourceEntry[];
    channels: ClawProjectResourceEntry[];
    commands: ClawProjectResourceEntry[];
    schedulers: ClawProjectResourceEntry[];
    memory: ClawProjectResourceEntry[];
  };
}

interface GeneratedEntry {
  id: string;
  path: string;
  kind: keyof ClawProjectConfig["resources"];
}

function buildJsonFilePath(rootDir: string, relativePath: string): string {
  return path.join(rootDir, relativePath);
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextFile(filePath: string, content: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, "utf8");
}

function safeReadJson<TValue>(filePath: string): TValue | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as TValue;
  } catch {
    return null;
  }
}

export function loadPackageJson(projectRoot: string): Record<string, unknown> | null {
  return safeReadJson<Record<string, unknown>>(path.join(projectRoot, "package.json"));
}

export async function savePackageJson(projectRoot: string, packageJson: Record<string, unknown>): Promise<void> {
  await writeJsonFile(path.join(projectRoot, "package.json"), packageJson);
}

export function locateProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, PROJECT_CONFIG_FILE))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function readProjectConfig(projectRoot: string): ClawProjectConfig | null {
  return safeReadJson<ClawProjectConfig>(path.join(projectRoot, PROJECT_CONFIG_FILE));
}

export async function writeProjectConfig(projectRoot: string, config: ClawProjectConfig): Promise<void> {
  await writeJsonFile(path.join(projectRoot, PROJECT_CONFIG_FILE), config);
}

export function createProjectConfig(input: {
  type: ClawProjectType;
  slug: string;
  title: string;
  runtimeAdapter?: string;
}): ClawProjectConfig {
  const base = {
    schemaVersion: 1,
    type: input.type,
    name: input.slug,
    title: input.title,
    runtime: {
      adapter: input.runtimeAdapter ?? "demo",
    },
    resources: {
      skills: [],
      plugins: [],
      providers: [],
      channels: [],
      commands: [],
      schedulers: [],
      memory: [],
    },
  } satisfies Omit<ClawProjectConfig, "directories" | "workspace">;

  if (input.type === "skill") {
    return {
      ...base,
      directories: {
        skills: "src",
      },
    };
  }

  if (input.type === "plugin") {
    return {
      ...base,
      directories: {
        skills: "src/skills",
        plugins: "src",
        providers: "claw/providers",
        channels: "claw/channels",
        commands: "claw/commands",
        scheduler: "claw/scheduler",
        memory: "claw/memory",
      },
    };
  }

  return {
    ...base,
    workspace: {
      appId: input.slug,
      workspaceId: input.slug,
      agentId: input.slug,
    },
    directories: {
      skills: "claw/skills",
      plugins: "claw/plugins",
      providers: "claw/providers",
      channels: "claw/channels",
      commands: "claw/commands",
      scheduler: "claw/scheduler",
      memory: "claw/memory",
    },
  };
}

function ensureResourceBucket(config: ClawProjectConfig, bucket: keyof ClawProjectConfig["resources"]): ClawProjectResourceEntry[] {
  const value = config.resources[bucket];
  if (Array.isArray(value)) return value;
  config.resources[bucket] = [];
  return config.resources[bucket];
}

function registerResource(config: ClawProjectConfig, entry: GeneratedEntry): void {
  const bucket = ensureResourceBucket(config, entry.kind);
  const existing = bucket.find((item) => item.id === entry.id);
  if (existing) {
    existing.path = entry.path;
    return;
  }
  bucket.push({ id: entry.id, path: entry.path });
}

function assertDirectory(directory: string | undefined, label: string): string {
  if (!directory) {
    throw new Error(`This project does not define a ${label} directory in ${PROJECT_CONFIG_FILE}.`);
  }
  return directory;
}

function buildSkillContent(slug: string, title: string, pascal: string): string {
  return `export interface ${pascal}SkillInput {\n  text: string;\n}\n\nexport interface ${pascal}SkillOutput {\n  summary: string;\n}\n\nexport async function run${pascal}Skill(input: ${pascal}SkillInput): Promise<${pascal}SkillOutput> {\n  return {\n    summary: \`TODO: implement ${title} for \${input.text}\`,\n  };\n}\n`;
}

function buildPluginContent(slug: string, title: string, pascal: string): string {
  return `export interface ${pascal}PluginConfig {\n  enabled?: boolean;\n}\n\nexport function create${pascal}Plugin(config: ${pascal}PluginConfig = {}) {\n  return {\n    id: "${slug}",\n    name: "${title}",\n    enabled: config.enabled ?? true,\n  };\n}\n`;
}

function buildCommandContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    description: `TODO: describe the ${title} command.`,
    handler: `claw/commands/${slug}.ts`,
  };
}

function buildProviderContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    type: "provider",
    auth: {
      strategy: "api_key",
      secretName: `TODO_${slug.toUpperCase().replace(/-/g, "_")}_SECRET`,
    },
  };
}

function buildChannelContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    type: "channel",
    enabled: true,
  };
}

function buildSchedulerContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    enabled: true,
    schedule: "TODO",
    handler: `claw/commands/${slug}.json`,
  };
}

function buildMemoryContent(slug: string, title: string): Record<string, unknown> {
  return {
    id: slug,
    name: title,
    provider: "filesystem",
    enabled: true,
  };
}

export async function generateProjectResource(projectRoot: string, config: ClawProjectConfig, resource: ClawResourceType, name: string): Promise<GeneratedEntry> {
  const slug = createPackageName(name, resource);
  const title = createTitle(slug, slug);
  const pascal = createPascalCase(slug, "ClawResource");

  if (resource === "skill") {
    const relativePath = path.join(assertDirectory(config.directories.skills, "skills"), `${slug}.ts`);
    await writeTextFile(buildJsonFilePath(projectRoot, relativePath), buildSkillContent(slug, title, pascal));
    const entry = { id: slug, path: relativePath, kind: "skills" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  if (resource === "plugin") {
    const relativePath = path.join(assertDirectory(config.directories.plugins, "plugins"), `${slug}.ts`);
    await writeTextFile(buildJsonFilePath(projectRoot, relativePath), buildPluginContent(slug, title, pascal));
    const entry = { id: slug, path: relativePath, kind: "plugins" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  if (resource === "provider") {
    const relativePath = path.join(assertDirectory(config.directories.providers, "providers"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildProviderContent(slug, title));
    const entry = { id: slug, path: relativePath, kind: "providers" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  if (resource === "channel") {
    const relativePath = path.join(assertDirectory(config.directories.channels, "channels"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildChannelContent(slug, title));
    const entry = { id: slug, path: relativePath, kind: "channels" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return entry;
  }

  const relativePath = path.join(assertDirectory(config.directories.commands, "commands"), `${slug}.json`);
  await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildCommandContent(slug, title));
  const entry = { id: slug, path: relativePath, kind: "commands" as const };
  registerResource(config, entry);
  await writeProjectConfig(projectRoot, config);
  return entry;
}

function ensurePackageJsonScripts(packageJson: Record<string, unknown>): Record<string, string> {
  const scripts = packageJson.scripts;
  if (scripts && typeof scripts === "object" && !Array.isArray(scripts)) {
    return scripts as Record<string, string>;
  }
  const created: Record<string, string> = {};
  packageJson.scripts = created;
  return created;
}

async function maybeInstallDependencies(
  projectRoot: string,
  packageManager: SupportedPackageManager,
  dependencies: string[],
  runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>,
): Promise<void> {
  if (dependencies.length === 0) return;
  const exec = runCommand;
  if (!exec) return;
  await exec(packageManager, ["install", ...dependencies], { cwd: projectRoot });
}

export async function addProjectIntegration(
  projectRoot: string,
  config: ClawProjectConfig,
  integration: ClawIntegrationType,
  options: {
    name?: string;
    packageManager: SupportedPackageManager;
    runCommand?: (command: string, args: string[], options: { cwd: string }) => Promise<void>;
  },
): Promise<{ created: GeneratedEntry; installedDependencies: string[] }> {
  if (integration === "workspace") {
    const packageJson = loadPackageJson(projectRoot) ?? {};
    const scripts = ensurePackageJsonScripts(packageJson);
    const dependencies = (packageJson.dependencies && typeof packageJson.dependencies === "object" && !Array.isArray(packageJson.dependencies))
      ? packageJson.dependencies as Record<string, string>
      : {};
    dependencies["@clawjs/workspace"] = dependencies["@clawjs/workspace"]
      ?? ((packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/claw"] ?? "^0.1.0");
    packageJson.dependencies = dependencies;
    scripts["claw:workspace:reindex"] = `claw workspace-index rebuild --workspace .`;
    await savePackageJson(projectRoot, packageJson);
    await maybeInstallDependencies(projectRoot, options.packageManager, ["@clawjs/workspace"], options.runCommand);
    return {
      created: {
        id: "workspace",
        path: "package.json",
        kind: "plugins",
      },
      installedDependencies: ["@clawjs/workspace"],
    };
  }

  if (integration === "provider") {
    const created = await generateProjectResource(projectRoot, config, "provider", options.name ?? "provider");
    return { created, installedDependencies: [] };
  }

  if (integration === "channel") {
    const created = await generateProjectResource(projectRoot, config, "channel", options.name ?? "channel");
    return { created, installedDependencies: [] };
  }

  if (integration === "telegram") {
    const slug = "telegram";
    const relativePath = path.join(assertDirectory(config.directories.channels, "channels"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), {
      id: slug,
      name: "Telegram",
      type: "channel",
      enabled: true,
      transport: {
        mode: "polling",
        secretName: "TODO_TELEGRAM_BOT_TOKEN",
      },
    });
    const entry = { id: slug, path: relativePath, kind: "channels" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);

    const packageJson = loadPackageJson(projectRoot);
    if (packageJson) {
      const scripts = ensurePackageJsonScripts(packageJson);
      scripts["claw:telegram:status"] = `claw --runtime ${config.runtime.adapter} telegram status --workspace .`;
      scripts["claw:telegram:connect"] = `claw --runtime ${config.runtime.adapter} telegram connect --workspace . --secret-name TODO_TELEGRAM_BOT_TOKEN`;
      await savePackageJson(projectRoot, packageJson);
    }

    return { created: entry, installedDependencies: [] };
  }

  if (integration === "scheduler") {
    const slug = createPackageName(options.name ?? "default-scheduler", "scheduler");
    const title = createTitle(slug, "Scheduler");
    const relativePath = path.join(assertDirectory(config.directories.scheduler, "scheduler"), `${slug}.json`);
    await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildSchedulerContent(slug, title));
    const entry = { id: slug, path: relativePath, kind: "schedulers" as const };
    registerResource(config, entry);
    await writeProjectConfig(projectRoot, config);
    return { created: entry, installedDependencies: [] };
  }

  const slug = createPackageName(options.name ?? "default-memory", "memory");
  const title = createTitle(slug, "Memory");
  const relativePath = path.join(assertDirectory(config.directories.memory, "memory"), `${slug}.json`);
  await writeJsonFile(buildJsonFilePath(projectRoot, relativePath), buildMemoryContent(slug, title));
  const entry = { id: slug, path: relativePath, kind: "memory" as const };
  registerResource(config, entry);
  await writeProjectConfig(projectRoot, config);
  await maybeInstallDependencies(projectRoot, options.packageManager, [], options.runCommand);
  return { created: entry, installedDependencies: [] };
}

export async function collectProjectInfo(projectRoot: string): Promise<Record<string, unknown>> {
  const project = readProjectConfig(projectRoot);
  const packageJson = loadPackageJson(projectRoot);
  const manifestPath = path.join(projectRoot, ".clawjs", "manifest.json");
  const manifest = safeReadJson<Record<string, unknown>>(manifestPath);
  const nodeModulesPackage = safeReadJson<{ version?: string }>(path.join(projectRoot, "node_modules", "@clawjs", "claw", "package.json"));
  const rootPackage = safeReadJson<{ version?: string }>(path.join(projectRoot, "package.json"));

  return {
    projectRoot,
    project,
    packageJson: packageJson ? {
      name: packageJson.name,
      version: packageJson.version,
      sdkDependency: (packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/claw"]
        ?? (packageJson.devDependencies as Record<string, string> | undefined)?.["@clawjs/claw"]
        ?? null,
      workspaceDependency: (packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/workspace"]
        ?? (packageJson.devDependencies as Record<string, string> | undefined)?.["@clawjs/workspace"]
        ?? null,
      cliDependency: (packageJson.dependencies as Record<string, string> | undefined)?.["@clawjs/cli"]
        ?? (packageJson.devDependencies as Record<string, string> | undefined)?.["@clawjs/cli"]
        ?? null,
    } : null,
    installedSdkVersion: nodeModulesPackage?.version ?? null,
    cliVersion: rootPackage?.version ?? null,
    workspace: manifest ? {
      manifestPath,
      manifest,
    } : null,
  };
}
