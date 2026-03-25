import type { __APP_PASCAL__PluginConfig } from "../config.js";

export interface TriageInput {
  subject: string;
  details: string;
  requester?: string;
}

export interface TriageOutput {
  summary: string;
  labels: string[];
  actions: string[];
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

export async function runTriageSkill(
  config: __APP_PASCAL__PluginConfig,
  input: TriageInput,
): Promise<TriageOutput> {
  const normalizedDetails = truncate(input.details.replace(/\s+/g, " ").trim(), 96);
  const requester = input.requester?.trim() || "unknown requester";

  return {
    summary: `${input.subject.trim()}: ${normalizedDetails}`,
    labels: [...config.defaultLabels, config.projectKey.toLowerCase()],
    actions: [
      `Create or update the ${config.provider} item for ${requester}.`,
      `Use ${config.baseUrl} as the integration base URL.`,
      config.enableAutoTriage
        ? "Run automatic triage before handing off the issue."
        : "Skip auto-triage and leave the item ready for manual review.",
    ],
  };
}
