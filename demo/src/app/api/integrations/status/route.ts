import { NextResponse } from "next/server";

import { existsSync } from "fs";
import { getCalendarIntegrationStatus } from "@/lib/calendar";
import { getContactsIntegrationStatus } from "@/lib/contacts-native";
import { getMailIntegrationStatus } from "@/lib/email";
import {
  getClawJSOpenClawStatus,
  getClawJSOpenClawContext,
  reconcileClawJSOpenClawDefaultModelWithAvailableAuth,
} from "@/lib/openclaw-agent";
import { getUserConfig, resolvePath } from "@/lib/user-config";
import { getWacliAuthStatus } from "@/lib/wacli-runtime";
import { hasBinary } from "@/lib/platform";
import { getClaw } from "@/lib/claw";
import { getAllAdapterStatuses } from "@/lib/runtime-adapters";
import { getE2EIntegrationStatus, isE2EEnabled } from "@/lib/e2e";

interface ToolStatus {
  installed: boolean;
  dbExists: boolean;
  authenticated?: boolean;
  authInProgress?: boolean;
  syncing?: boolean;
  qrText?: string;
  lastError?: string | null;
  wacliAvailable?: boolean;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  if (isE2EEnabled()) {
    return NextResponse.json(getE2EIntegrationStatus(), { headers: NO_STORE_HEADERS });
  }

  const config = getUserConfig();

  const contactsEnabled = !!config.contactsEnabled;

  let [wacliStatus, calendarStatus, contactsStatus, emailStatus, openClawStatus, adapterStatuses] = await Promise.all([
    getWacliAuthStatus(),
    getCalendarIntegrationStatus(config.calendarAccounts?.[0] || undefined),
    contactsEnabled
      ? getContactsIntegrationStatus().catch(() => ({
          installed: false, available: false, needsPermission: false,
          backend: "unsupported" as const, contactCount: 0,
          message: "Failed to check Contacts.app status.",
        }))
      : Promise.resolve({
          installed: false, available: false, needsPermission: false,
          backend: "unsupported" as const, contactCount: 0,
          message: null,
        }),
    getMailIntegrationStatus(config.emailAccounts),
    getClawJSOpenClawStatus(),
    getAllAdapterStatuses(),
  ]);

  if (openClawStatus.cliAvailable && openClawStatus.agentConfigured && !openClawStatus.authConfigured) {
    await reconcileClawJSOpenClawDefaultModelWithAvailableAuth().catch(() => null);
    openClawStatus = await getClawJSOpenClawStatus();
  }

  const wacliDbExists = config.dataSources.wacliDbPath
    ? existsSync(resolvePath(config.dataSources.wacliDbPath))
    : false;

  const transcriptionDbExists = config.dataSources.transcriptionDbPath
    ? existsSync(resolvePath(config.dataSources.transcriptionDbPath))
    : false;

  const openClawCtx = getClawJSOpenClawContext();
  return NextResponse.json({
    adapters: adapterStatuses,
    openClaw: {
      ...openClawStatus,
      context: openClawStatus.cliAvailable ? {
        agentId: openClawCtx.agentId,
        workspaceDir: openClawCtx.workspaceDir,
        stateDir: openClawCtx.stateDir,
        agentDir: openClawCtx.agentDir,
        agentName: openClawCtx.configuredAgent?.name,
      } : undefined,
    },
    whatsapp: {
      installed: wacliStatus.cliAvailable,
      dbExists: wacliDbExists,
      authenticated: wacliStatus.authenticated,
      authInProgress: wacliStatus.authInProgress,
      syncing: wacliStatus.syncing,
      qrText: wacliStatus.qrText,
      lastError: wacliStatus.lastError,
      wacliAvailable: wacliStatus.cliAvailable,
    } satisfies ToolStatus,
    email: { ...emailStatus, enabled: (config.emailAccounts ?? []).filter(Boolean).length > 0 },
    calendar: { ...calendarStatus, enabled: (config.calendarAccounts ?? []).filter(Boolean).length > 0 },
    contacts: { ...contactsStatus, enabled: !!config.contactsEnabled },
    transcription: {
      dbExists: transcriptionDbExists,
      whisperCliAvailable: await hasBinary("whisper-cli"),
      whisperAvailable: await hasBinary("whisper"),
    },
    telegram: await (async () => {
      if (!config.telegram?.enabled) {
        return {
          enabled: false,
          botConnected: false,
          botUsername: undefined as string | undefined,
          webhookUrl: undefined as string | undefined,
          lastError: null as string | null,
        };
      }
      try {
        const claw = await getClaw();
        const status = await claw.telegram.status();
        return {
          enabled: true,
          botConnected: status.connected,
          botUsername: status.botProfile?.username ?? config.telegram?.botUsername,
          webhookUrl: status.transport.webhook?.url,
          lastError: status.recentErrors[0] ?? null,
        };
      } catch {
        return {
          enabled: true,
          botConnected: !!config.telegram?.botUsername,
          botUsername: config.telegram?.botUsername,
          webhookUrl: undefined as string | undefined,
          lastError: null as string | null,
        };
      }
    })(),
    slack: {
      enabled: !!config.slack?.enabled,
      botConnected: !!config.slack?.botUsername || !!config.slack?.teamName,
      botUsername: config.slack?.botUsername,
      teamName: config.slack?.teamName,
      lastError: null as string | null,
    },
  }, { headers: NO_STORE_HEADERS });
}
