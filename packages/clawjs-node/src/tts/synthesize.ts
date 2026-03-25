/**
 * Text-to-Speech synthesis module.
 *
 * Supports multiple providers: local (system TTS / Edge TTS), OpenAI, ElevenLabs, Deepgram.
 * Returns raw audio buffers so callers can stream or save as needed.
 */

import { execFile as execFileCb } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { join } from "path";
import { readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";

const execFileAsync = promisify(execFileCb);

// ── Public types ──

export type TtsProvider = "local" | "openai" | "elevenlabs" | "deepgram";

export type TtsConfigFieldKey =
  | "enabled"
  | "autoRead"
  | "apiKey"
  | "voice"
  | "model"
  | "speed"
  | "stability"
  | "similarityBoost";

export interface TtsProviderConfig {
  enabled?: boolean;
  autoRead?: boolean;
  provider?: TtsProvider;
  apiKey?: string;
  voice?: string;
  model?: string;
  speed?: number;
  stability?: number;
  similarityBoost?: number;
}

export interface TtsConfigFieldOption {
  value: string;
  label: string;
}

export interface TtsConfigFieldDescriptor {
  key: TtsConfigFieldKey;
  label: string;
  type: "toggle" | "password" | "select" | "text" | "number";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: TtsConfigFieldOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface TtsProviderDescriptor {
  id: TtsProvider;
  label: string;
  requiresApiKey: boolean;
  defaultVoice: string;
  defaultModel: string | null;
  defaults: Partial<Pick<TtsProviderConfig, "voice" | "model" | "speed" | "stability" | "similarityBoost">>;
  fields: TtsConfigFieldDescriptor[];
}

export interface TtsCatalog {
  globalFields: TtsConfigFieldDescriptor[];
  providers: TtsProviderDescriptor[];
}

export interface TtsSynthesizeInput {
  /** Text to convert to speech. */
  text: string;
  /** BCP-47 language hint (used by local provider for voice selection). */
  lang?: string;
  /** TTS provider to use. Defaults to "local". */
  provider?: TtsProvider;
  /** Provider API key (required for openai, elevenlabs, deepgram). */
  apiKey?: string;
  /** Voice identifier. Meaning depends on provider. */
  voice?: string;
  /** Model identifier (provider-specific). */
  model?: string;
  /** Playback speed multiplier. Defaults to 1. */
  speed?: number;
  /** ElevenLabs stability (0-1). */
  stability?: number;
  /** ElevenLabs similarity boost (0-1). */
  similarityBoost?: number;
}

export interface TtsSynthesizeResult {
  /** Raw audio data. */
  audio: Buffer;
  /** MIME type of the returned audio. */
  mimeType: string;
}

// ── Default voice map for local providers ──

const EDGE_TTS_VOICE_MAP: Record<string, string> = {
  es: "es-ES-AlvaroNeural",
  en: "en-US-ChristopherNeural",
  fr: "fr-FR-HenriNeural",
  de: "de-DE-ConradNeural",
  it: "it-IT-DiegoNeural",
  pt: "pt-BR-AntonioNeural",
};

const MACOS_SAY_VOICE_MAP: Record<string, string> = {
  es: "Paulina",
  en: "Samantha",
  fr: "Thomas",
  de: "Anna",
  it: "Alice",
  pt: "Luciana",
};

const SPEED_OPTIONS: TtsConfigFieldOption[] = [
  { value: "0.5", label: "0.5x" },
  { value: "0.75", label: "0.75x" },
  { value: "1", label: "1x" },
  { value: "1.25", label: "1.25x" },
  { value: "1.5", label: "1.5x" },
  { value: "2", label: "2x" },
];

const OPENAI_VOICE_OPTIONS: TtsConfigFieldOption[] = [
  { value: "alloy", label: "Alloy" },
  { value: "ash", label: "Ash" },
  { value: "coral", label: "Coral" },
  { value: "echo", label: "Echo" },
  { value: "fable", label: "Fable" },
  { value: "nova", label: "Nova" },
  { value: "onyx", label: "Onyx" },
  { value: "sage", label: "Sage" },
  { value: "shimmer", label: "Shimmer" },
];

const OPENAI_MODEL_OPTIONS: TtsConfigFieldOption[] = [
  { value: "tts-1", label: "tts-1" },
  { value: "tts-1-hd", label: "tts-1-hd" },
  { value: "gpt-4o-mini-tts", label: "gpt-4o-mini-tts" },
];

const DEEPGRAM_MODEL_OPTIONS: TtsConfigFieldOption[] = [
  { value: "aura-2-thalia-en", label: "Thalia (EN)" },
  { value: "aura-2-andromeda-en", label: "Andromeda (EN)" },
  { value: "aura-2-luna-en", label: "Luna (EN)" },
  { value: "aura-2-athena-en", label: "Athena (EN)" },
  { value: "aura-2-stella-en", label: "Stella (EN)" },
  { value: "aura-2-orion-en", label: "Orion (EN)" },
  { value: "aura-2-arcas-en", label: "Arcas (EN)" },
  { value: "aura-2-perseus-en", label: "Perseus (EN)" },
];

const STABILITY_OPTIONS: TtsConfigFieldOption[] = [
  { value: "0.2", label: "0.2" },
  { value: "0.35", label: "0.35" },
  { value: "0.5", label: "0.5" },
  { value: "0.65", label: "0.65" },
  { value: "0.8", label: "0.8" },
  { value: "1", label: "1.0" },
];

const SIMILARITY_OPTIONS: TtsConfigFieldOption[] = [
  { value: "0.25", label: "0.25" },
  { value: "0.5", label: "0.5" },
  { value: "0.75", label: "0.75" },
  { value: "1", label: "1.0" },
];

const TTS_CATALOG: TtsCatalog = {
  globalFields: [
    { key: "enabled", label: "Enable text to speech", type: "toggle", defaultValue: false },
    { key: "autoRead", label: "Auto-read assistant responses", type: "toggle", defaultValue: false },
  ],
  providers: [
    {
      id: "local",
      label: "Local (System / Edge TTS)",
      requiresApiKey: false,
      defaultVoice: "auto",
      defaultModel: null,
      defaults: {
        speed: 1,
      },
      fields: [
        {
          key: "voice",
          label: "Voice",
          type: "text",
          placeholder: "Automatic system voice",
        },
        {
          key: "speed",
          label: "Speed",
          type: "select",
          defaultValue: 1,
          options: SPEED_OPTIONS,
        },
      ],
    },
    {
      id: "openai",
      label: "OpenAI",
      requiresApiKey: true,
      defaultVoice: "alloy",
      defaultModel: "tts-1",
      defaults: {
        model: "tts-1",
        voice: "alloy",
        speed: 1,
      },
      fields: [
        {
          key: "apiKey",
          label: "API key",
          type: "password",
          required: true,
        },
        {
          key: "model",
          label: "Model",
          type: "select",
          defaultValue: "tts-1",
          options: OPENAI_MODEL_OPTIONS,
        },
        {
          key: "voice",
          label: "Voice",
          type: "select",
          defaultValue: "alloy",
          options: OPENAI_VOICE_OPTIONS,
        },
        {
          key: "speed",
          label: "Speed",
          type: "select",
          defaultValue: 1,
          options: SPEED_OPTIONS,
        },
      ],
    },
    {
      id: "elevenlabs",
      label: "ElevenLabs",
      requiresApiKey: true,
      defaultVoice: "21m00Tcm4TlvDq8ikWAM",
      defaultModel: "eleven_monolingual_v1",
      defaults: {
        model: "eleven_monolingual_v1",
        voice: "21m00Tcm4TlvDq8ikWAM",
        speed: 1,
        stability: 0.5,
        similarityBoost: 0.75,
      },
      fields: [
        {
          key: "apiKey",
          label: "API key",
          type: "password",
          required: true,
        },
        {
          key: "voice",
          label: "Voice ID",
          type: "text",
          placeholder: "21m00Tcm4TlvDq8ikWAM",
          defaultValue: "21m00Tcm4TlvDq8ikWAM",
        },
        {
          key: "stability",
          label: "Stability",
          type: "select",
          defaultValue: 0.5,
          options: STABILITY_OPTIONS,
        },
        {
          key: "similarityBoost",
          label: "Similarity boost",
          type: "select",
          defaultValue: 0.75,
          options: SIMILARITY_OPTIONS,
        },
        {
          key: "speed",
          label: "Speed",
          type: "select",
          defaultValue: 1,
          options: SPEED_OPTIONS,
        },
      ],
    },
    {
      id: "deepgram",
      label: "Deepgram Aura",
      requiresApiKey: true,
      defaultVoice: "aura-asteria-en",
      defaultModel: "aura-2-thalia-en",
      defaults: {
        model: "aura-2-thalia-en",
      },
      fields: [
        {
          key: "apiKey",
          label: "API key",
          type: "password",
          required: true,
        },
        {
          key: "model",
          label: "Voice model",
          type: "select",
          defaultValue: "aura-2-thalia-en",
          options: DEEPGRAM_MODEL_OPTIONS,
        },
      ],
    },
  ],
};

function getProviderDescriptor(provider?: TtsProvider | null): TtsProviderDescriptor {
  return TTS_CATALOG.providers.find((candidate) => candidate.id === provider) ?? TTS_CATALOG.providers[0];
}

function coerceConfigValue(
  field: TtsConfigFieldDescriptor,
  rawValue: TtsProviderConfig[TtsConfigFieldKey],
): string | number | boolean | undefined {
  if (rawValue === undefined || rawValue === null) {
    return field.defaultValue;
  }

  if (field.type === "toggle") {
    return typeof rawValue === "boolean" ? rawValue : field.defaultValue;
  }

  if (field.type === "select") {
    const value = String(rawValue);
    const allowedValues = new Set((field.options ?? []).map((option) => option.value));
    if (allowedValues.size === 0 || allowedValues.has(value)) {
      return typeof field.defaultValue === "number" ? Number(value) : value;
    }
    return field.defaultValue;
  }

  if (field.type === "number") {
    const value = typeof rawValue === "number" ? rawValue : Number(rawValue);
    return Number.isFinite(value) ? value : field.defaultValue;
  }

  if (typeof rawValue !== "string") {
    return field.defaultValue;
  }

  const trimmed = rawValue.trim();
  return trimmed || field.defaultValue;
}

// ── Provider implementations ──

async function synthesizeLocal(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  if (process.platform === "darwin") {
    try {
      return await synthesizeMacOsSay(input);
    } catch (systemError) {
      try {
        return await synthesizeEdgeTts(input);
      } catch (edgeError) {
        throw new Error(
          `Local TTS failed with macOS system voices and edge-tts. ` +
          `System error: ${systemError instanceof Error ? systemError.message : String(systemError)}. ` +
          `Edge error: ${edgeError instanceof Error ? edgeError.message : String(edgeError)}`,
        );
      }
    }
  }

  return synthesizeEdgeTts(input);
}

function normalizeLocalLang(lang?: string): string {
  const trimmed = lang?.trim().toLowerCase();
  if (!trimmed) return "en";
  return trimmed.split(/[-_]/)[0] || "en";
}

function resolveMacOsVoice(input: TtsSynthesizeInput): string {
  const explicitVoice = input.voice?.trim();
  if (explicitVoice && !explicitVoice.includes("Neural") && !explicitVoice.includes("-")) {
    return explicitVoice;
  }
  return MACOS_SAY_VOICE_MAP[normalizeLocalLang(input.lang)] ?? "Samantha";
}

async function synthesizeEdgeTts(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  const voice = input.voice?.trim() || EDGE_TTS_VOICE_MAP[normalizeLocalLang(input.lang)] || "en-US-ChristopherNeural";
  const speed = input.speed ?? 1;
  const rate = speed >= 1
    ? `+${Math.round((speed - 1) * 100)}%`
    : `-${Math.round((1 - speed) * 100)}%`;

  const tmpFile = join(tmpdir(), `clawjs-tts-${randomUUID()}.mp3`);
  try {
    await execFileAsync("edge-tts", [
      "--voice", voice,
      "--rate", rate,
      "--text", input.text,
      "--write-media", tmpFile,
    ], { timeout: 30_000 });
    const audio = await readFile(tmpFile);
    await unlink(tmpFile).catch(() => {});
    return { audio, mimeType: "audio/mpeg" };
  } catch (err) {
    await unlink(tmpFile).catch(() => {});
    throw new Error(
      `Local TTS (edge-tts) failed. Is it installed? Run: pip install edge-tts. ` +
      `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function synthesizeMacOsSay(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  const voice = resolveMacOsVoice(input);
  const speed = input.speed ?? 1;
  const speakingRate = Math.max(90, Math.min(360, Math.round(180 * speed)));
  const aiffFile = join(tmpdir(), `clawjs-tts-${randomUUID()}.aiff`);
  const wavFile = join(tmpdir(), `clawjs-tts-${randomUUID()}.wav`);

  try {
    await execFileAsync("say", [
      "-v", voice,
      "-r", String(speakingRate),
      "-o", aiffFile,
      input.text,
    ], { timeout: 30_000 });
    await execFileAsync("afconvert", [
      "-f", "WAVE",
      "-d", "LEI16",
      aiffFile,
      wavFile,
    ], { timeout: 30_000 });
    const audio = await readFile(wavFile);
    await unlink(aiffFile).catch(() => {});
    await unlink(wavFile).catch(() => {});
    return { audio, mimeType: "audio/wav" };
  } catch (error) {
    await unlink(aiffFile).catch(() => {});
    await unlink(wavFile).catch(() => {});
    throw new Error(
      `Local TTS (macOS say) failed. Voice: ${voice}. ` +
      `Original error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function synthesizeOpenAI(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  if (!input.apiKey) throw new Error("OpenAI API key is required for TTS");

  const model = input.model ?? "tts-1";
  const voice = input.voice ?? "alloy";
  const speed = input.speed ?? 1;

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: input.text,
      voice,
      speed,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS request failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return { audio: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
}

async function synthesizeElevenLabs(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  if (!input.apiKey) throw new Error("ElevenLabs API key is required for TTS");

  const voiceId = input.voice ?? "21m00Tcm4TlvDq8ikWAM"; // Rachel
  const stability = input.stability ?? 0.5;
  const similarityBoost = input.similarityBoost ?? 0.75;
  const model = input.model ?? "eleven_monolingual_v1";

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": input.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: input.text,
      model_id: model,
      voice_settings: { stability, similarity_boost: similarityBoost },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`ElevenLabs TTS request failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return { audio: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
}

async function synthesizeDeepgram(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  if (!input.apiKey) throw new Error("Deepgram API key is required for TTS");

  const model = input.model ?? "aura-asteria-en";

  const res = await fetch(
    `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Token ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.text }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Deepgram TTS request failed (${res.status}): ${detail}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return { audio: Buffer.from(arrayBuffer), mimeType: "audio/mpeg" };
}

// ── Public API ──

const PROVIDERS: Record<TtsProvider, (input: TtsSynthesizeInput) => Promise<TtsSynthesizeResult>> = {
  local: synthesizeLocal,
  openai: synthesizeOpenAI,
  elevenlabs: synthesizeElevenLabs,
  deepgram: synthesizeDeepgram,
};

/**
 * Synthesize speech from text.
 *
 * @example
 * ```ts
 * const { audio, mimeType } = await synthesize({
 *   text: "Hello world",
 *   provider: "openai",
 *   apiKey: process.env.OPENAI_API_KEY,
 *   voice: "nova",
 * });
 * fs.writeFileSync("hello.mp3", audio);
 * ```
 */
export async function synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
  const provider = input.provider ?? "local";
  const handler = PROVIDERS[provider];
  if (!handler) {
    throw new Error(`Unknown TTS provider: ${provider}`);
  }
  return handler(input);
}

export function getTtsCatalog(): TtsCatalog {
  return {
    globalFields: TTS_CATALOG.globalFields.map((field) => ({ ...field })),
    providers: TTS_CATALOG.providers.map((provider) => ({
      ...provider,
      defaults: { ...provider.defaults },
      fields: provider.fields.map((field) => ({
        ...field,
        ...(field.options ? { options: field.options.map((option) => ({ ...option })) } : {}),
      })),
    })),
  };
}

export function normalizeTtsConfig(input?: TtsProviderConfig | null): TtsProviderConfig {
  const provider = getProviderDescriptor(input?.provider);
  const normalized: TtsProviderConfig = {
    provider: provider.id,
  };

  for (const field of TTS_CATALOG.globalFields) {
    const value = coerceConfigValue(field, input?.[field.key]);
    if (typeof value === "boolean") {
      (normalized as Record<string, unknown>)[field.key] = value;
    }
  }

  for (const field of provider.fields) {
    const value = coerceConfigValue(field, input?.[field.key]);
    if (value === undefined) continue;
    if (field.key === "apiKey") {
      if (typeof value === "string" && value.trim()) {
        normalized.apiKey = value.trim();
      }
      continue;
    }
    if (field.key === "speed" || field.key === "stability" || field.key === "similarityBoost") {
      if (typeof value === "number" && Number.isFinite(value)) {
        normalized[field.key] = value;
      }
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      (normalized as Record<string, unknown>)[field.key] = value;
    }
  }

  return normalized;
}

/**
 * List available TTS providers and their required configuration.
 */
export function listTtsProviders(): Array<{
  id: TtsProvider;
  label: string;
  requiresApiKey: boolean;
  defaultVoice: string;
  defaultModel: string | null;
}> {
  return getTtsCatalog().providers.map((provider) => ({
    id: provider.id,
    label: provider.label,
    requiresApiKey: provider.requiresApiKey,
    defaultVoice: provider.defaultVoice,
    defaultModel: provider.defaultModel,
  }));
}
