export interface PluginConfigField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface __APP_PASCAL__PluginConfig {
  provider: string;
  projectKey: string;
  baseUrl: string;
  enableAutoTriage: boolean;
  defaultLabels: string[];
}

export const configSchema = [
  {
    name: "provider",
    type: "string",
    required: true,
    description: "External system or product family this plugin integrates with.",
  },
  {
    name: "projectKey",
    type: "string",
    required: true,
    description: "Primary project or tenant identifier used by the plugin.",
  },
  {
    name: "baseUrl",
    type: "string",
    required: true,
    description: "Base URL for the integrated product surface.",
  },
  {
    name: "enableAutoTriage",
    type: "boolean",
    required: true,
    description: "Whether the plugin should auto-run bundled triage behavior.",
  },
  {
    name: "defaultLabels",
    type: "string[]",
    required: true,
    description: "Labels or tags the plugin should attach by default.",
  },
] satisfies PluginConfigField[];

export function validatePluginConfig(input: unknown): __APP_PASCAL__PluginConfig {
  if (!input || typeof input !== "object") {
    throw new Error("Plugin config must be an object.");
  }

  const candidate = input as Record<string, unknown>;

  if (typeof candidate.provider !== "string" || candidate.provider.trim().length === 0) {
    throw new Error("Plugin config provider must be a non-empty string.");
  }

  if (typeof candidate.projectKey !== "string" || candidate.projectKey.trim().length === 0) {
    throw new Error("Plugin config projectKey must be a non-empty string.");
  }

  if (typeof candidate.baseUrl !== "string" || !candidate.baseUrl.startsWith("https://")) {
    throw new Error("Plugin config baseUrl must be an https URL.");
  }

  if (typeof candidate.enableAutoTriage !== "boolean") {
    throw new Error("Plugin config enableAutoTriage must be a boolean.");
  }

  if (!Array.isArray(candidate.defaultLabels) || candidate.defaultLabels.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new Error("Plugin config defaultLabels must be a string array.");
  }

  return {
    provider: candidate.provider.trim(),
    projectKey: candidate.projectKey.trim(),
    baseUrl: candidate.baseUrl.trim(),
    enableAutoTriage: candidate.enableAutoTriage,
    defaultLabels: candidate.defaultLabels.map((value) => value.trim()),
  };
}
