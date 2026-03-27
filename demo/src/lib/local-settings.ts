import fs from "fs";
import os from "os";
import path from "path";
import { resolveLocale, type Locale } from "./i18n/messages.ts";
import { resolveClawJSWorkspaceDir } from "./openclaw-agent.ts";

export const LOCAL_SETTINGS_SCHEMA_VERSION = 1;

export interface ClawJSLocalSettings {
  schemaVersion: number;
  locale?: Locale;
  onboardingCompleted?: boolean;
  disclaimerAcceptedAt?: string;
  ageVerifiedAt?: string;
  sidebarOpen?: boolean;
  openClawEnabled?: boolean;
  activeAdapter?: string;
  theme?: "light" | "dark" | "system";
}

function resolveSettingsPath(rawPath: string): string {
  if (rawPath.startsWith("~/")) {
    return path.join(os.homedir(), rawPath.slice(2));
  }
  return rawPath;
}

export function getClawJSLocalSettingsPath(): string {
  const configured = process.env.OPENCLAW_LOCAL_SETTINGS_PATH?.trim();
  if (configured) {
    return resolveSettingsPath(configured);
  }
  return path.join(resolveClawJSWorkspaceDir(), "settings.json");
}

export function getClawJSLocalSettings(): ClawJSLocalSettings {
  try {
    const raw = fs.readFileSync(getClawJSLocalSettingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<ClawJSLocalSettings> & { locale?: string };
    return {
      schemaVersion: LOCAL_SETTINGS_SCHEMA_VERSION,
      ...(parsed.locale ? { locale: resolveLocale(parsed.locale) } : {}),
      ...(typeof parsed.onboardingCompleted === "boolean" ? { onboardingCompleted: parsed.onboardingCompleted } : {}),
      ...(typeof (parsed as Record<string, unknown>).disclaimerAcceptedAt === "string" ? { disclaimerAcceptedAt: (parsed as Record<string, unknown>).disclaimerAcceptedAt as string } : {}),
      ...(typeof (parsed as Record<string, unknown>).ageVerifiedAt === "string" ? { ageVerifiedAt: (parsed as Record<string, unknown>).ageVerifiedAt as string } : {}),
      ...(typeof parsed.sidebarOpen === "boolean" ? { sidebarOpen: parsed.sidebarOpen } : {}),
      ...(typeof parsed.openClawEnabled === "boolean" ? { openClawEnabled: parsed.openClawEnabled } : {}),
      ...(typeof parsed.activeAdapter === "string" ? { activeAdapter: parsed.activeAdapter } : {}),
      ...(typeof parsed.theme === "string" && ["light", "dark", "system"].includes(parsed.theme) ? { theme: parsed.theme as "light" | "dark" | "system" } : {}),
    };
  } catch {
    return { schemaVersion: LOCAL_SETTINGS_SCHEMA_VERSION };
  }
}

export function saveClawJSLocalSettings(
  updates: Partial<Omit<ClawJSLocalSettings, "schemaVersion">>
): ClawJSLocalSettings {
  const next: ClawJSLocalSettings = {
    ...getClawJSLocalSettings(),
    schemaVersion: LOCAL_SETTINGS_SCHEMA_VERSION,
    ...(updates.locale ? { locale: resolveLocale(updates.locale) } : {}),
    ...(typeof updates.onboardingCompleted === "boolean" ? { onboardingCompleted: updates.onboardingCompleted } : {}),
    ...(typeof updates.disclaimerAcceptedAt === "string" ? { disclaimerAcceptedAt: updates.disclaimerAcceptedAt } : {}),
    ...(typeof updates.ageVerifiedAt === "string" ? { ageVerifiedAt: updates.ageVerifiedAt } : {}),
    ...(typeof updates.sidebarOpen === "boolean" ? { sidebarOpen: updates.sidebarOpen } : {}),
    ...(typeof updates.openClawEnabled === "boolean" ? { openClawEnabled: updates.openClawEnabled } : {}),
    ...(typeof updates.activeAdapter === "string" ? { activeAdapter: updates.activeAdapter } : {}),
    ...(typeof updates.theme === "string" && ["light", "dark", "system"].includes(updates.theme) ? { theme: updates.theme } : {}),
  };

  const targetPath = getClawJSLocalSettingsPath();
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  return next;
}
