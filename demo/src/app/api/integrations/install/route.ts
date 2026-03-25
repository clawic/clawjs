import { execFile } from "child_process";
import { NextRequest, NextResponse } from "next/server";
import { resolveCommand } from "@/lib/platform";
import { installAdapter, getVisibleAdapters } from "@/lib/runtime-adapters";
import { getE2EIntegrationStatus, isE2EEnabled, setE2EIntegrationStatus } from "@/lib/e2e";

type PackageInfo = {
  method: "npm";
  npmPkg: string;
} | {
  method: "brew";
  formula: string;
};

const ALLOWED_PACKAGES: Record<string, PackageInfo> = {
  openclaw: { method: "npm", npmPkg: "openclaw" },
  wacli: { method: "brew", formula: "steipete/tap/wacli" },
};

async function runInstall(info: PackageInfo): Promise<{ success: boolean; output: string }> {
  const cmd = await resolveCommand(info.method === "npm" ? "npm" : "brew");
  const args = info.method === "npm"
    ? ["install", "-g", info.npmPkg]
    : ["install", info.formula];

  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: 120_000, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, output: stderr?.trim() || err.message });
          return;
        }
        resolve({ success: true, output: stdout?.trim() || "" });
      },
    );
  });
}

const VALID_ADAPTER_IDS = new Set(getVisibleAdapters().map((a) => a.id));

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pkg = typeof body?.package === "string" ? body.package : "";
    const adapterId = typeof body?.adapter === "string" ? body.adapter : "";

    if (isE2EEnabled()) {
      const status = getE2EIntegrationStatus();
      setE2EIntegrationStatus({
        ...status,
        openClaw: { ...status.openClaw, installed: true, cliAvailable: true },
        whatsapp: { ...status.whatsapp, installed: true, wacliAvailable: true },
      });
      return NextResponse.json({ success: true, output: `Installed ${adapterId || pkg || "fixture"}` });
    }

    // Generic adapter install via SDK
    if (adapterId && VALID_ADAPTER_IDS.has(adapterId)) {
      const result = await installAdapter(adapterId);
      return NextResponse.json(result);
    }

    // Legacy package-based install
    const info = ALLOWED_PACKAGES[pkg];
    if (!info) {
      return NextResponse.json(
        { success: false, error: `Unknown package: ${pkg}` },
        { status: 400 },
      );
    }

    const result = await runInstall(info);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Install failed" },
      { status: 500 },
    );
  }
}
