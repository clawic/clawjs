import { NextRequest, NextResponse } from "next/server";
import { getUserConfig, saveUserConfig } from "@/lib/user-config";
import { ALL_CALENDARS_ID } from "@/lib/calendar-constants";
import { ALL_EMAIL_ACCOUNTS_ID } from "@/lib/email-constants";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const integration = typeof body?.integration === "string" ? body.integration : "";
    const enabled = body?.enabled === true;

    const config = getUserConfig();

    switch (integration) {
      case "calendar":
        config.calendarAccounts = enabled ? [ALL_CALENDARS_ID] : [];
        break;
      case "email":
        config.emailAccounts = enabled ? [ALL_EMAIL_ACCOUNTS_ID] : [];
        break;
      default:
        return NextResponse.json(
          { error: `Unknown integration: ${integration}` },
          { status: 400 },
        );
    }

    saveUserConfig(config);
    return NextResponse.json({ ok: true, integration, enabled });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update integration" },
      { status: 500 },
    );
  }
}
