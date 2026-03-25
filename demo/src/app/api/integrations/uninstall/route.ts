import { execFile } from "child_process";
import { NextRequest } from "next/server";
import { findCommand } from "@/lib/platform";
import { uninstallAdapter, getVisibleAdapters } from "@/lib/runtime-adapters";

function run(cmd: string, args: string[], timeout = 30_000): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, output: stderr?.trim() || err.message });
        return;
      }
      resolve({ success: true, output: stdout?.trim() || "" });
    });
  });
}

const VALID_ADAPTER_IDS = new Set(getVisibleAdapters().map((a) => a.id));

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const pkg = typeof body?.package === "string" ? body.package : "";
    const adapterId = typeof body?.adapter === "string" ? body.adapter : "";

    // Generic adapter uninstall via SDK
    if (adapterId && VALID_ADAPTER_IDS.has(adapterId)) {
      const result = await uninstallAdapter(adapterId);
      return Response.json(result);
    }

    // Legacy package-based uninstall
    if (pkg !== "openclaw") {
      return Response.json({ success: false, error: `Unknown package: ${pkg}` }, { status: 400 });
    }

    const binary = await findCommand("npm");
    if (!binary) {
      return Response.json({ success: false, error: "npm not available" }, { status: 400 });
    }

    const result = await run(binary, ["uninstall", "-g", "openclaw"], 60_000);
    return Response.json(result);
  } catch (error) {
    return Response.json({
      success: false,
      error: error instanceof Error ? error.message : "Uninstall failed",
    }, { status: 500 });
  }
}
