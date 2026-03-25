import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { NextRequest, NextResponse } from "next/server";
import { getE2EIntegrationStatus, isE2EEnabled, setE2EIntegrationStatus } from "@/lib/e2e";
import { getUserConfig, saveUserConfig } from "@/lib/user-config";
import { stopWacliAuth } from "@/lib/wacli-runtime";
import { findCommand } from "@/lib/platform";

const WACLI_STORE_DIR = path.join(os.homedir(), ".wacli");

function secureDeleteDir(dirPath: string): void {
  try {
    if (!fs.existsSync(dirPath)) return;
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

async function brewUninstall(): Promise<boolean> {
  const brewBin = await findCommand("brew");
  if (!brewBin) return false;
  return new Promise((resolve) => {
    execFile(brewBin, ["uninstall", "wacli"], { timeout: 30_000 }, (err) => {
      resolve(!err);
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const deleteData = body?.deleteData === true;
    const uninstallCli = body?.uninstallCli === true;

    if (isE2EEnabled()) {
      const status = getE2EIntegrationStatus();
      setE2EIntegrationStatus({
        ...status,
        whatsapp: {
          ...status.whatsapp,
          dbExists: false,
          authenticated: false,
          authInProgress: false,
          qrText: "",
        },
      });
      return NextResponse.json({ success: true, dataDeleted: deleteData, cliUninstalled: uninstallCli });
    }

    // Stop any running auth process
    stopWacliAuth();

    // Clear config
    const config = getUserConfig();
    config.dataSources.wacliDbPath = "";
    saveUserConfig(config);

    const result: { dataDeleted: boolean; cliUninstalled: boolean } = {
      dataDeleted: false,
      cliUninstalled: false,
    };

    // Delete wacli data directory (~/.wacli)
    if (deleteData) {
      secureDeleteDir(WACLI_STORE_DIR);
      result.dataDeleted = true;
    }

    // Uninstall wacli CLI via brew
    if (uninstallCli) {
      const binary = await findCommand("wacli");
      if (binary) {
        result.cliUninstalled = await brewUninstall();
      } else {
        result.cliUninstalled = true; // already not installed
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Cleanup failed" },
      { status: 500 },
    );
  }
}
