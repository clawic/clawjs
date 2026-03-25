import { existsSync } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { getE2EIntegrationStatus, isE2EEnabled, setE2EIntegrationStatus } from "@/lib/e2e";
import { getUserConfig, resolvePath, saveUserConfig } from "@/lib/user-config";
import { getWacliAuthStatus, startWacliAuth, stopWacliAuth } from "@/lib/wacli-runtime";

const DEFAULT_WACLI_DB_PATH = "~/.wacli/wacli.db";

type ConnectionState = "disabled" | "connected" | "pairing" | "waiting" | "needs-app";

function whatsappDbExists(): boolean {
  const config = getUserConfig();
  return !!config.dataSources.wacliDbPath
    && existsSync(resolvePath(config.dataSources.wacliDbPath));
}

function responseFor(
  state: ConnectionState,
  integration: {
    installed: boolean;
    dbExists: boolean;
    available?: boolean;
    linked?: boolean;
    connected?: boolean;
    configured?: boolean;
    running?: boolean;
    authenticated?: boolean;
    authInProgress?: boolean;
    qrText?: string;
    wacliAvailable?: boolean;
    lastError?: string | null;
  },
  message: string,
  qrText?: string
) {
  return NextResponse.json({
    state,
    message,
    qrText,
    integration,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { enabled } = await req.json();
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }

    if (isE2EEnabled()) {
      const status = getE2EIntegrationStatus();
      const next = {
        ...status,
        whatsapp: enabled
          ? {
              ...status.whatsapp,
              installed: true,
              dbExists: true,
              authenticated: true,
              authInProgress: false,
              qrText: "",
              lastError: null,
              wacliAvailable: true,
            }
          : {
              ...status.whatsapp,
              dbExists: false,
              authenticated: false,
              authInProgress: false,
              qrText: "",
              lastError: null,
            },
      };
      setE2EIntegrationStatus(next);
      return NextResponse.json({
        state: enabled ? "connected" : "disabled",
        message: enabled ? "WhatsApp is connected and data is ready." : "WhatsApp sync is turned off.",
        integration: next.whatsapp,
      });
    }

    const config = getUserConfig();
    config.dataSources.wacliDbPath = enabled ? DEFAULT_WACLI_DB_PATH : "";
    saveUserConfig(config);

    const status = await getWacliAuthStatus();
    const baseIntegration = {
      installed: status.cliAvailable,
      dbExists: whatsappDbExists(),
      authenticated: status.authenticated,
      authInProgress: status.authInProgress,
      qrText: status.qrText,
      wacliAvailable: status.cliAvailable,
      lastError: status.lastError,
    };

    if (!enabled) {
      stopWacliAuth();
      return responseFor(
        "disabled",
        {
          ...baseIntegration,
          dbExists: false,
        },
        "WhatsApp sync is turned off."
      );
    }

    if (!status.cliAvailable) {
      return responseFor(
        "needs-app",
        baseIntegration,
        "WhatsApp bridge is not available yet."
      );
    }

    const auth = status.authenticated ? status : await startWacliAuth();
    const integration = {
      installed: auth.cliAvailable,
      dbExists: whatsappDbExists(),
      authenticated: auth.authenticated,
      authInProgress: auth.authInProgress,
      qrText: auth.qrText,
      wacliAvailable: auth.cliAvailable,
      lastError: auth.lastError,
    };

    if (auth.authenticated && integration.dbExists) {
      return responseFor("connected", integration, "WhatsApp is connected and data is ready.");
    }

    return responseFor(
      auth.qrText ? "pairing" : auth.authInProgress ? "waiting" : "waiting",
      integration,
      auth.message || "WhatsApp authentication flow started.",
      auth.qrText
    );
  } catch {
    return NextResponse.json({ error: "Failed to connect WhatsApp" }, { status: 500 });
  }
}
