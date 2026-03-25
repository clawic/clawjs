import { NextRequest } from "next/server";
import { saveClawJSLocalSettings, getClawJSLocalSettings } from "@/lib/local-settings";
import { resolveLocale } from "@/lib/i18n/messages";
import { clearConfigCache } from "@/lib/user-config";

export async function GET() {
  try {
    return Response.json(getClawJSLocalSettings());
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to read local settings" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json() as { locale?: string; onboardingCompleted?: boolean; disclaimerAcceptedAt?: string; sidebarOpen?: boolean; openClawEnabled?: boolean; theme?: string };
    const validThemes = ["light", "dark", "system"];
    const next = saveClawJSLocalSettings({
      locale: typeof body?.locale === "string" ? resolveLocale(body.locale) : undefined,
      onboardingCompleted: typeof body?.onboardingCompleted === "boolean" ? body.onboardingCompleted : undefined,
      disclaimerAcceptedAt: typeof body?.disclaimerAcceptedAt === "string" ? body.disclaimerAcceptedAt : undefined,
      sidebarOpen: typeof body?.sidebarOpen === "boolean" ? body.sidebarOpen : undefined,
      openClawEnabled: typeof body?.openClawEnabled === "boolean" ? body.openClawEnabled : undefined,
      theme: typeof body?.theme === "string" && validThemes.includes(body.theme) ? body.theme as "light" | "dark" | "system" : undefined,
    });
    clearConfigCache();
    return Response.json(next);
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to save local settings" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
