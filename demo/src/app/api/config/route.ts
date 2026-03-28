import { NextRequest } from "next/server";
import { z } from "zod";
import { getUserConfig, saveUserConfig, clearConfigCache, redactUserConfigForClient } from "@/lib/user-config";
import { saveClawJSLocalSettings } from "@/lib/local-settings";
import { syncGeneratedProfile } from "@/lib/profile-context";

const MAX_CONFIG_SIZE = 100 * 1024; // 100 KB
export const dynamic = "force-dynamic";
export const revalidate = 0;
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const userConfigSchema = z.object({
  schemaVersion: z.number(),
  locale: z.string(),
  displayName: z.string(),
  profileNameKey: z.string(),
  dataSources: z.object({
    wacliDbPath: z.string(),
    transcriptionDbPath: z.string(),
    activityStoreDbPath: z.string(),
  }),
  chat: z.object({}).passthrough().optional(),
  assistant: z.object({}).passthrough().optional(),
  assistantPersona: z.object({}).passthrough().optional(),
}).passthrough();

export async function GET() {
  try {
    const config = redactUserConfigForClient(getUserConfig());
    return new Response(JSON.stringify(config, null, 2), {
      headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
    });
  } catch (err) {
    console.error("[api/config] GET failed:", err);
    return new Response(
      JSON.stringify({ error: "Failed to read config", detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS } }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const rawBody = await req.text();

    if (rawBody.length > MAX_CONFIG_SIZE) {
      return new Response(
        JSON.stringify({ error: "Config payload exceeds 100KB size limit" }),
        { status: 400, headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS } }
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS } }
      );
    }

    const result = userConfigSchema.safeParse(body);
    if (!result.success) {
      const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      return new Response(
        JSON.stringify({ error: "Invalid config format", details: messages }),
        { status: 400, headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS } }
      );
    }

    const validated = result.data;
    saveUserConfig(validated as unknown as Parameters<typeof saveUserConfig>[0]);
    saveClawJSLocalSettings({ locale: validated.locale as Parameters<typeof saveClawJSLocalSettings>[0]["locale"] });
    syncGeneratedProfile();
    clearConfigCache();
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to save config" }),
      { status: 500, headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS } }
    );
  }
}
