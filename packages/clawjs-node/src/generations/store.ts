import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

import type { RuntimeAdapterId } from "@clawjs/core";

import { createWorkspaceDataStore, type WorkspaceDataStore } from "../data/store.ts";
import { NodeFileSystemHost } from "../host/filesystem.ts";
import { NodeProcessHost } from "../host/process.ts";

export type GenerationKind = "image" | "video" | "audio" | "document";
export type GenerationBackendType = "command";
export type GenerationRecordStatus = "succeeded" | "failed";
export type GenerationBackendSource = "builtin" | "runtime" | "workspace" | "ad_hoc";

export interface GenerationAssetRecord {
  relativePath: string;
  filePath: string;
  exists: boolean;
  size: number | null;
  mimeType: string | null;
}

export interface GenerationModelOption {
  id: string;
  label: string;
  default?: boolean;
}

export interface GenerationMetadataFieldOption {
  value: string;
  label: string;
}

export interface GenerationMetadataField {
  key: string;
  label: string;
  type: "select" | "text" | "number";
  options?: GenerationMetadataFieldOption[];
  default?: string;
  placeholder?: string;
}

export interface CommandGenerationBackendRecord {
  id: string;
  label: string;
  type: "command";
  supportedKinds: GenerationKind[];
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  outputExtension?: string;
  mimeType?: string;
}

export interface GenerationBackendDescriptor extends CommandGenerationBackendRecord {
  source: GenerationBackendSource;
  available: boolean;
  reason?: string;
  supportedModels?: GenerationModelOption[];
  metadataSchema?: GenerationMetadataField[];
}

export interface GenerationRecord {
  id: string;
  kind: GenerationKind;
  status: GenerationRecordStatus;
  prompt: string;
  title: string;
  backendId: string;
  backendLabel: string;
  backendType: GenerationBackendType;
  backendSource: GenerationBackendSource;
  model?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  command?: {
    command: string;
    args: string[];
    cwd?: string;
  };
  output: GenerationAssetRecord | null;
  error?: string;
}

interface PersistedGenerationRecord {
  id: string;
  kind: GenerationKind;
  status: GenerationRecordStatus;
  prompt: string;
  title: string;
  backendId: string;
  backendLabel: string;
  backendType: GenerationBackendType;
  backendSource: GenerationBackendSource;
  model?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
  command?: {
    command: string;
    args: string[];
    cwd?: string;
  };
  outputRelativePath?: string;
  outputMimeType?: string;
  error?: string;
}

export interface GenerationListOptions {
  kind?: GenerationKind;
  backendId?: string;
  status?: GenerationRecordStatus;
  limit?: number;
}

export interface RegisterCommandGenerationBackendInput {
  id: string;
  label: string;
  supportedKinds: GenerationKind[];
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  outputExtension?: string;
  mimeType?: string;
}

export interface CreateGenerationInput {
  kind: GenerationKind;
  prompt: string;
  title?: string;
  backendId?: string;
  model?: string;
  metadata?: Record<string, unknown>;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  outputExtension?: string;
  mimeType?: string;
}

export interface GenerationStore {
  listBackends(): GenerationBackendDescriptor[];
  registerCommandBackend(input: RegisterCommandGenerationBackendInput): GenerationBackendDescriptor;
  removeBackend(id: string): boolean;
  create(input: CreateGenerationInput): Promise<GenerationRecord>;
  list(options?: GenerationListOptions): GenerationRecord[];
  get(id: string): GenerationRecord | null;
  remove(id: string): boolean;
}

const GENERATIONS_COLLECTION = "generations";
const BACKENDS_COLLECTION = "generation-backends";

const DEFAULT_OUTPUT_EXTENSION: Record<GenerationKind, string> = {
  image: "png",
  video: "mp4",
  audio: "mp3",
  document: "txt",
};

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  png: "image/png",
  txt: "text/plain",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
};

function normalizeId(value: string, label: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!/^[a-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters: ${value}`);
  }
  return trimmed;
}

function normalizeLabel(value: string, fallback: string): string {
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizePrompt(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("prompt is required");
  }
  return trimmed;
}

function normalizeKinds(values: GenerationKind[]): GenerationKind[] {
  const unique = Array.from(new Set(values));
  if (unique.length === 0) {
    throw new Error("supportedKinds must contain at least one kind");
  }
  return unique;
}

function normalizeOutputExtension(value: string | undefined, kind: GenerationKind): string {
  const trimmed = value?.trim().replace(/^\./, "").toLowerCase();
  return trimmed || DEFAULT_OUTPUT_EXTENSION[kind];
}

function resolveMimeType(kind: GenerationKind, extension: string, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  return MIME_TYPE_BY_EXTENSION[extension.toLowerCase()] || defaultMimeTypeForKind(kind);
}

function defaultMimeTypeForKind(kind: GenerationKind): string {
  switch (kind) {
    case "image":
      return "image/png";
    case "video":
      return "video/mp4";
    case "audio":
      return "audio/mpeg";
    case "document":
      return "text/plain";
  }
}

function summarizeTitle(prompt: string, explicitTitle?: string): string {
  const trimmed = explicitTitle?.trim();
  if (trimmed) return trimmed;
  const normalized = prompt.replace(/\s+/g, " ").trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77).trim()}...` : normalized;
}

function buildAssetRelativePath(kind: GenerationKind, id: string, extension: string): string {
  return ["generations", kind, `${id}.${extension.replace(/^\./, "")}`].join("/");
}

function enrichAssetRecord(
  dataStore: WorkspaceDataStore,
  filesystem: NodeFileSystemHost,
  relativePath: string | undefined,
  mimeType: string | undefined,
): GenerationAssetRecord | null {
  if (!relativePath) return null;
  const asset = dataStore.asset(relativePath);
  const filePath = asset.path();
  if (!filesystem.exists(filePath)) {
    return {
      relativePath,
      filePath,
      exists: false,
      size: null,
      mimeType: mimeType ?? null,
    };
  }
  try {
    const stat = fs.statSync(filePath);
    return {
      relativePath,
      filePath,
      exists: true,
      size: stat.isFile() ? stat.size : null,
      mimeType: mimeType ?? null,
    };
  } catch {
    return {
      relativePath,
      filePath,
      exists: false,
      size: null,
      mimeType: mimeType ?? null,
    };
  }
}

function hydrateRecord(
  record: PersistedGenerationRecord,
  dataStore: WorkspaceDataStore,
  filesystem: NodeFileSystemHost,
): GenerationRecord {
  return {
    ...record,
    output: enrichAssetRecord(dataStore, filesystem, record.outputRelativePath, record.outputMimeType),
  };
}

function compareGenerationRecords(left: GenerationRecord, right: GenerationRecord): number {
  return (
    right.createdAt.localeCompare(left.createdAt)
    || right.updatedAt.localeCompare(left.updatedAt)
    || right.id.localeCompare(left.id)
  );
}

function normalizeEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(env ?? {}),
  };
}

function resolveEnvValue(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  return typeof value === "string" ? value.trim() : "";
}

function isExecutablePath(candidate: string): boolean {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile();
  } catch {
    return false;
  }
}

function resolveBinaryOnPath(binary: string, env: NodeJS.ProcessEnv): string | null {
  const trimmed = binary.trim();
  if (!trimmed) return null;
  if (trimmed.includes(path.sep)) {
    return isExecutablePath(trimmed) ? trimmed : null;
  }

  const pathEntries = (resolveEnvValue(env, "PATH") || process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extensions = process.platform === "win32"
    ? (resolveEnvValue(env, "PATHEXT") || ".EXE;.CMD;.BAT")
        .split(";")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [""];

  for (const directory of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${trimmed}${extension}`);
      if (isExecutablePath(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function replaceTemplateTokens(value: string, tokens: Record<string, string>): string {
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => tokens[key] ?? "");
}

function resolveOpenClawSkillsDir(filesystem: NodeFileSystemHost, env: NodeJS.ProcessEnv): string | null {
  const explicit = resolveEnvValue(env, "OPENCLAW_SKILLS_DIR");
  if (explicit && filesystem.exists(explicit)) {
    return explicit;
  }

  const configuredBinary = resolveEnvValue(env, "CLAWJS_OPENCLAW_PATH");
  const openclawBinary = configuredBinary && isExecutablePath(configuredBinary)
    ? configuredBinary
    : resolveBinaryOnPath("openclaw", env);
  const candidates = new Set<string>();
  if (openclawBinary) {
    const resolvedBinary = fs.realpathSync.native?.(openclawBinary) ?? fs.realpathSync(openclawBinary);
    candidates.add(path.resolve(path.dirname(openclawBinary), "..", "lib", "node_modules", "openclaw", "skills"));
    candidates.add(path.resolve(path.dirname(resolvedBinary), "..", "skills"));
    candidates.add(path.resolve(path.dirname(resolvedBinary), "..", "..", "skills"));
  }
  candidates.add("/opt/homebrew/lib/node_modules/openclaw/skills");
  candidates.add("/usr/local/lib/node_modules/openclaw/skills");

  for (const candidate of candidates) {
    if (filesystem.exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildUnavailableReason(parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

function buildRuntimeBackends(
  runtimeAdapter: RuntimeAdapterId,
  filesystem: NodeFileSystemHost,
  env: NodeJS.ProcessEnv,
): GenerationBackendDescriptor[] {
  if (runtimeAdapter !== "openclaw") {
    return [];
  }

  const skillsDir = resolveOpenClawSkillsDir(filesystem, env);
  const descriptors: Array<{
    id: string;
    label: string;
    skillName: string;
    supportedKinds: GenerationKind[];
    command: string;
    outputExtension?: string;
    mimeType?: string;
    requiredEnv?: string[];
    supportedModels?: GenerationModelOption[];
    metadataSchema?: GenerationMetadataField[];
  }> = [
    {
      id: "openclaw-skill:openai-image-gen",
      label: "OpenAI Image Generation",
      skillName: "openai-image-gen",
      supportedKinds: ["image"],
      command: "python3",
      requiredEnv: ["OPENAI_API_KEY"],
      supportedModels: [
        { id: "gpt-image-1", label: "GPT Image 1", default: true },
        { id: "dall-e-3", label: "DALL·E 3" },
        { id: "dall-e-2", label: "DALL·E 2" },
      ],
      metadataSchema: [
        {
          key: "size",
          label: "Size",
          type: "select",
          default: "1024x1024",
          options: [
            { value: "1024x1024", label: "1024×1024 (Square)" },
            { value: "1024x1792", label: "1024×1792 (Portrait)" },
            { value: "1792x1024", label: "1792×1024 (Landscape)" },
          ],
        },
        {
          key: "quality",
          label: "Quality",
          type: "select",
          default: "auto",
          options: [
            { value: "auto", label: "Auto" },
            { value: "high", label: "High" },
            { value: "medium", label: "Medium" },
            { value: "low", label: "Low" },
          ],
        },
        {
          key: "background",
          label: "Background",
          type: "select",
          default: "auto",
          options: [
            { value: "auto", label: "Auto" },
            { value: "transparent", label: "Transparent" },
            { value: "opaque", label: "Opaque" },
          ],
        },
        {
          key: "outputFormat",
          label: "Output format",
          type: "select",
          default: "png",
          options: [
            { value: "png", label: "PNG" },
            { value: "jpeg", label: "JPEG" },
            { value: "webp", label: "WebP" },
          ],
        },
      ],
    },
    {
      id: "openclaw-skill:nano-banana-pro",
      label: "Gemini Nano Banana Pro",
      skillName: "nano-banana-pro",
      supportedKinds: ["image"],
      command: "uv",
      outputExtension: "png",
      mimeType: "image/png",
      requiredEnv: ["GEMINI_API_KEY"],
      supportedModels: [
        { id: "gemini-2.0-flash-preview-image-generation", label: "Gemini 2.0 Flash (Image)", default: true },
      ],
      metadataSchema: [
        {
          key: "aspectRatio",
          label: "Aspect ratio",
          type: "select",
          default: "1:1",
          options: [
            { value: "1:1", label: "1:1 (Square)" },
            { value: "16:9", label: "16:9 (Landscape)" },
            { value: "9:16", label: "9:16 (Portrait)" },
            { value: "4:3", label: "4:3" },
            { value: "3:4", label: "3:4" },
          ],
        },
      ],
    },
    {
      id: "openclaw-skill:sag",
      label: "OpenClaw sag TTS",
      skillName: "sag",
      supportedKinds: ["audio"],
      command: "sag",
      outputExtension: "mp3",
      mimeType: "audio/mpeg",
      requiredEnv: ["ELEVENLABS_API_KEY"],
    },
    {
      id: "openclaw-skill:sherpa-onnx-tts",
      label: "OpenClaw sherpa-onnx TTS",
      skillName: "sherpa-onnx-tts",
      supportedKinds: ["audio"],
      command: "__skill_wrapper__",
      outputExtension: "wav",
      mimeType: "audio/wav",
      requiredEnv: ["SHERPA_ONNX_RUNTIME_DIR", "SHERPA_ONNX_MODEL_DIR"],
    },
  ];

  return descriptors.map((descriptor) => {
    const skillDir = skillsDir ? path.join(skillsDir, descriptor.skillName) : "";
    const skillEntryPath = skillDir ? path.join(skillDir, "SKILL.md") : "";
    const missingBins = descriptor.command === "__skill_wrapper__"
      ? (skillDir && filesystem.exists(path.join(skillDir, "bin", descriptor.skillName)) ? [] : [path.join(skillDir, "bin", descriptor.skillName)])
      : (resolveBinaryOnPath(descriptor.command, env) ? [] : [descriptor.command]);
    const missingEnv = (descriptor.requiredEnv ?? []).filter((key) => !resolveEnvValue(env, key));
    const available = !!skillsDir && filesystem.exists(skillEntryPath) && missingBins.length === 0 && missingEnv.length === 0;
    const reasons: string[] = [];
    if (!skillsDir) reasons.push("OpenClaw bundled skills directory was not found.");
    if (skillsDir && !filesystem.exists(skillEntryPath)) reasons.push(`Bundled skill ${descriptor.skillName} is not installed.`);
    if (missingBins.length > 0) reasons.push(`Missing runtime requirements: ${missingBins.join(", ")}.`);
    if (missingEnv.length > 0) reasons.push(`Missing env: ${missingEnv.join(", ")}.`);

    return {
      id: descriptor.id,
      label: descriptor.label,
      type: "command" as const,
      supportedKinds: descriptor.supportedKinds,
      command: descriptor.command === "__skill_wrapper__" ? path.join(skillDir, "bin", descriptor.skillName) : descriptor.command,
      args: [],
      ...(descriptor.outputExtension ? { outputExtension: descriptor.outputExtension } : {}),
      ...(descriptor.mimeType ? { mimeType: descriptor.mimeType } : {}),
      source: "runtime" as const,
      available,
      ...(reasons.length > 0 ? { reason: buildUnavailableReason(reasons) } : {}),
      ...(descriptor.supportedModels ? { supportedModels: descriptor.supportedModels } : {}),
      ...(descriptor.metadataSchema ? { metadataSchema: descriptor.metadataSchema } : {}),
    };
  });
}

function buildBuiltinBackends(): GenerationBackendDescriptor[] {
  return [{
    id: "command",
    label: "External Command",
    type: "command",
    supportedKinds: ["image", "video", "audio", "document"],
    command: "",
    args: [],
    source: "builtin",
    available: true,
    reason: "Pass a command directly to create() or register a command backend for reuse.",
  }];
}

export function createGenerationStore(options: {
  workspaceDir: string;
  runtimeAdapter: RuntimeAdapterId;
  filesystem?: NodeFileSystemHost;
  processHost?: NodeProcessHost;
  dataStore?: WorkspaceDataStore;
  env?: NodeJS.ProcessEnv;
}): GenerationStore {
  const filesystem = options.filesystem ?? new NodeFileSystemHost();
  const processHost = options.processHost ?? new NodeProcessHost();
  const dataStore = options.dataStore ?? createWorkspaceDataStore(options.workspaceDir, filesystem);
  const runtimeEnv = normalizeEnv(options.env);
  const generationCollection = dataStore.collection<PersistedGenerationRecord>(GENERATIONS_COLLECTION);
  const backendCollection = dataStore.collection<CommandGenerationBackendRecord>(BACKENDS_COLLECTION);

  function listWorkspaceBackends(): GenerationBackendDescriptor[] {
    return backendCollection.entries()
      .map((entry) => entry.value)
      .map((backend) => ({
        ...backend,
        source: "workspace" as const,
        available: true,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  function listBackends(): GenerationBackendDescriptor[] {
    return [
      ...buildBuiltinBackends(),
      ...buildRuntimeBackends(options.runtimeAdapter, filesystem, runtimeEnv),
      ...listWorkspaceBackends(),
    ];
  }

  function pickDefaultBackend(kind: GenerationKind): GenerationBackendDescriptor | null {
    const candidates = listBackends().filter((backend) => (
      backend.id !== "command"
      && backend.available
      && backend.supportedKinds.includes(kind)
    ));
    return candidates[0] ?? null;
  }

  function resolveBackendForCreate(input: CreateGenerationInput): GenerationBackendDescriptor {
    const backendId = input.backendId?.trim();
    if (!backendId) {
      if (input.command?.trim()) {
        return {
          id: "command",
          label: "External Command",
          type: "command",
          supportedKinds: [input.kind],
          command: input.command.trim(),
          args: Array.isArray(input.args) ? input.args : [],
          ...(input.cwd?.trim() ? { cwd: input.cwd.trim() } : {}),
          ...(input.env ? { env: input.env } : {}),
          ...(input.outputExtension?.trim() ? { outputExtension: input.outputExtension.trim() } : {}),
          ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim() } : {}),
          source: "ad_hoc",
          available: true,
        };
      }
      const autoBackend = pickDefaultBackend(input.kind);
      if (autoBackend) return autoBackend;
      throw new Error(`No available generation backend for ${input.kind}. Use listBackends() to inspect requirements or pass a command.`);
    }

    if (backendId === "command") {
      if (!input.command?.trim()) {
        throw new Error("command is required when backendId is set to command");
      }
      return {
        id: "command",
        label: "External Command",
        type: "command",
        supportedKinds: [input.kind],
        command: input.command.trim(),
        args: Array.isArray(input.args) ? input.args : [],
        ...(input.cwd?.trim() ? { cwd: input.cwd.trim() } : {}),
        ...(input.env ? { env: input.env } : {}),
        ...(input.outputExtension?.trim() ? { outputExtension: input.outputExtension.trim() } : {}),
        ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim() } : {}),
        source: "ad_hoc",
        available: true,
      };
    }

    const backend = listBackends().find((candidate) => candidate.id === backendId);
    if (!backend) {
      throw new Error(`Unknown generation backend: ${backendId}`);
    }
    if (!backend.available) {
      throw new Error(backend.reason || `Generation backend is unavailable: ${backendId}`);
    }
    if (!backend.supportedKinds.includes(input.kind)) {
      throw new Error(`Generation backend ${backendId} does not support ${input.kind}`);
    }
    return backend;
  }

  function readMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
    const value = metadata?.[key];
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  function readMetadataStringArray(metadata: Record<string, unknown> | undefined, key: string): string[] {
    const value = metadata?.[key];
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim())
      : [];
  }

  function inferOutputExtension(input: CreateGenerationInput, backend: GenerationBackendDescriptor): string | undefined {
    if (input.outputExtension?.trim()) {
      return input.outputExtension.trim();
    }
    if (backend.id === "openclaw-skill:openai-image-gen") {
      return readMetadataString(input.metadata, "outputFormat") ?? "png";
    }
    return backend.outputExtension;
  }

  function findGeneratedArtifact(rootDir: string, allowedExtensions: string[]): string | null {
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      const normalizedExtensions = allowedExtensions.map((extension) => extension.toLowerCase().replace(/^\./, ""));
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(rootDir, entry.name))
        .filter((filePath) => normalizedExtensions.includes(path.extname(filePath).slice(1).toLowerCase()))
        .sort((left, right) => left.localeCompare(right));
      return files[0] ?? null;
    } catch {
      return null;
    }
  }

  function buildCommandPlan(
    backend: GenerationBackendDescriptor,
    input: CreateGenerationInput,
    tokens: Record<string, string>,
    outputPath: string,
  ): {
    command: string;
    args: string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    finalize?: () => void;
  } {
    if (backend.id === "openclaw-skill:nano-banana-pro") {
      const skillsDir = resolveOpenClawSkillsDir(filesystem, runtimeEnv);
      const scriptPath = skillsDir ? path.join(skillsDir, "nano-banana-pro", "scripts", "generate_image.py") : "";
      const args = [scriptPath, "--prompt", input.prompt, "--filename", outputPath];
      const resolution = readMetadataString(input.metadata, "resolution");
      const aspectRatio = readMetadataString(input.metadata, "aspectRatio");
      const inputImages = readMetadataStringArray(input.metadata, "inputImages");
      if (resolution) args.push("--resolution", resolution);
      if (aspectRatio) args.push("--aspect-ratio", aspectRatio);
      for (const imagePath of inputImages) {
        args.push("-i", imagePath);
      }
      return { command: "uv", args, env: runtimeEnv };
    }

    if (backend.id === "openclaw-skill:openai-image-gen") {
      const skillsDir = resolveOpenClawSkillsDir(filesystem, runtimeEnv);
      const scriptPath = skillsDir ? path.join(skillsDir, "openai-image-gen", "scripts", "gen.py") : "";
      const stagingDir = path.join(path.dirname(outputPath), `${path.basename(outputPath, path.extname(outputPath))}-openclaw`);
      const args = [
        scriptPath,
        "--prompt", input.prompt,
        "--count", "1",
        "--model", input.model?.trim() || "gpt-image-1",
        "--out-dir", stagingDir,
      ];
      const size = readMetadataString(input.metadata, "size");
      const quality = readMetadataString(input.metadata, "quality");
      const background = readMetadataString(input.metadata, "background");
      const outputFormat = readMetadataString(input.metadata, "outputFormat");
      const style = readMetadataString(input.metadata, "style");
      if (size) args.push("--size", size);
      if (quality) args.push("--quality", quality);
      if (background) args.push("--background", background);
      if (outputFormat) args.push("--output-format", outputFormat);
      if (style) args.push("--style", style);
      return {
        command: "python3",
        args,
        env: runtimeEnv,
        finalize() {
          const generatedPath = findGeneratedArtifact(stagingDir, [path.extname(outputPath), ".png", ".jpeg", ".jpg", ".webp"]);
          if (!generatedPath) {
            throw new Error(`OpenClaw skill openai-image-gen did not produce an image in ${stagingDir}`);
          }
          filesystem.ensureDir(path.dirname(outputPath));
          fs.copyFileSync(generatedPath, outputPath);
          fs.rmSync(stagingDir, { recursive: true, force: true });
        },
      };
    }

    if (backend.id === "openclaw-skill:sag") {
      const args = ["-o", outputPath];
      const voice = readMetadataString(input.metadata, "voice");
      if (voice) args.push("-v", voice);
      args.push(input.prompt);
      return { command: "sag", args, env: runtimeEnv };
    }

    if (backend.id === "openclaw-skill:sherpa-onnx-tts") {
      const skillsDir = resolveOpenClawSkillsDir(filesystem, runtimeEnv);
      const wrapperPath = skillsDir ? path.join(skillsDir, "sherpa-onnx-tts", "bin", "sherpa-onnx-tts") : "";
      return { command: wrapperPath, args: ["-o", outputPath, input.prompt], env: runtimeEnv };
    }

    const args = backend.args.map((arg) => replaceTemplateTokens(arg, tokens));
    const env = Object.fromEntries(
      Object.entries(backend.env ?? {}).map(([key, value]) => [key, replaceTemplateTokens(value, tokens)])
    );
    return {
      command: backend.command,
      args,
      ...(backend.cwd ? { cwd: replaceTemplateTokens(backend.cwd, tokens) } : {}),
      ...(Object.keys(env).length > 0 ? { env: { ...runtimeEnv, ...env } } : {}),
    };
  }

  return {
    listBackends,
    registerCommandBackend(input) {
      const record: CommandGenerationBackendRecord = {
        id: normalizeId(input.id, "backend id"),
        label: normalizeLabel(input.label, input.id),
        type: "command",
        supportedKinds: normalizeKinds(input.supportedKinds),
        command: input.command.trim(),
        args: Array.isArray(input.args) ? input.args : [],
        ...(input.cwd?.trim() ? { cwd: input.cwd.trim() } : {}),
        ...(input.env ? { env: input.env } : {}),
        ...(input.outputExtension?.trim() ? { outputExtension: input.outputExtension.trim() } : {}),
        ...(input.mimeType?.trim() ? { mimeType: input.mimeType.trim() } : {}),
      };
      if (!record.command) {
        throw new Error("backend command is required");
      }
      backendCollection.put(record.id, record);
      return {
        ...record,
        source: "workspace",
        available: true,
      };
    },
    removeBackend(id) {
      const normalized = normalizeId(id, "backend id");
      const existing = backendCollection.get(normalized);
      if (!existing) return false;
      backendCollection.remove(normalized);
      return true;
    },
    async create(input) {
      const kind = input.kind;
      const prompt = normalizePrompt(input.prompt);
      const backend = resolveBackendForCreate(input);
      const id = `gen-${randomUUID()}`;
      const createdAt = new Date().toISOString();
      const extension = normalizeOutputExtension(inferOutputExtension(input, backend), kind);
      const mimeType = resolveMimeType(kind, extension, input.mimeType || backend.mimeType);
      const outputRelativePath = buildAssetRelativePath(kind, id, extension);
      const outputPath = dataStore.asset(outputRelativePath).path();
      filesystem.ensureDir(path.dirname(outputPath));

      const tokens = {
        prompt,
        outputPath,
        outputDir: path.dirname(outputPath),
        workspaceDir: options.workspaceDir,
        generationId: id,
        kind,
        model: input.model?.trim() || "",
      };
      const commandPlan = buildCommandPlan(backend, { ...input, prompt }, tokens, outputPath);
      const commandSpec = {
        command: commandPlan.command,
        args: commandPlan.args,
        ...(commandPlan.cwd ? { cwd: commandPlan.cwd } : {}),
      };

      try {
        await processHost.exec(commandSpec.command, commandSpec.args, {
          ...(commandSpec.cwd ? { cwd: commandSpec.cwd } : {}),
          env: commandPlan.env,
          timeoutMs: 10 * 60 * 1_000,
        });
        commandPlan.finalize?.();
        if (!filesystem.exists(outputPath)) {
          throw new Error(`Generation command completed without creating output: ${outputPath}`);
        }
        const persisted: PersistedGenerationRecord = {
          id,
          kind,
          status: "succeeded",
          prompt,
          title: summarizeTitle(prompt, input.title),
          backendId: backend.id,
          backendLabel: backend.label,
          backendType: backend.type,
          backendSource: backend.source,
          ...(input.model?.trim() ? { model: input.model.trim() } : {}),
          createdAt,
          updatedAt: createdAt,
          ...(input.metadata ? { metadata: input.metadata } : {}),
          command: commandSpec,
          outputRelativePath,
          outputMimeType: mimeType,
        };
        generationCollection.put(id, persisted);
        return hydrateRecord(persisted, dataStore, filesystem);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const failed: PersistedGenerationRecord = {
          id,
          kind,
          status: "failed",
          prompt,
          title: summarizeTitle(prompt, input.title),
          backendId: backend.id,
          backendLabel: backend.label,
          backendType: backend.type,
          backendSource: backend.source,
          ...(input.model?.trim() ? { model: input.model.trim() } : {}),
          createdAt,
          updatedAt: new Date().toISOString(),
          ...(input.metadata ? { metadata: input.metadata } : {}),
          command: commandSpec,
          outputRelativePath: filesystem.exists(outputPath) ? outputRelativePath : undefined,
          outputMimeType: filesystem.exists(outputPath) ? mimeType : undefined,
          error: message,
        };
        generationCollection.put(id, failed);
        throw new Error(message);
      }
    },
    list(query = {}) {
      const limit = Math.max(1, query.limit ?? Number.MAX_SAFE_INTEGER);
      return generationCollection.list()
        .map((record) => hydrateRecord(record, dataStore, filesystem))
        .filter((record) => !query.kind || record.kind === query.kind)
        .filter((record) => !query.backendId || record.backendId === query.backendId)
        .filter((record) => !query.status || record.status === query.status)
        .sort(compareGenerationRecords)
        .slice(0, limit);
    },
    get(id) {
      const normalized = normalizeId(id, "generation id");
      const record = generationCollection.get(normalized);
      return record ? hydrateRecord(record, dataStore, filesystem) : null;
    },
    remove(id) {
      const normalized = normalizeId(id, "generation id");
      const record = generationCollection.get(normalized);
      if (!record) return false;
      if (record.outputRelativePath) {
        dataStore.asset(record.outputRelativePath).remove();
      }
      generationCollection.remove(normalized);
      return true;
    },
  };
}
