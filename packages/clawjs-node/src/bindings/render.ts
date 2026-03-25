function normalizeRenderValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((entry) => normalizeRenderValue(entry)));
  }
  if (typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, entry]) => [key, entry]),
      ),
      null,
      2,
    );
  }
  return String(value);
}

function getValueAtPath(source: Record<string, unknown>, valuePath: string): unknown {
  return valuePath.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
}

export function renderSettingsTemplate(template: string, settings: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, valuePath: string) => normalizeRenderValue(getValueAtPath(settings, valuePath.trim())));
}

export function createTemplateRenderer(template: string) {
  return (settings: Record<string, unknown>): string => renderSettingsTemplate(template, settings);
}
