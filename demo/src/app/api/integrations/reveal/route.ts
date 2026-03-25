import { execFile } from "child_process";
import { existsSync } from "fs";
import { NextRequest } from "next/server";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const dir = typeof body?.path === "string" ? body.path : "";

    if (!dir || !existsSync(dir)) {
      return Response.json({ ok: false, error: "Directory not found" }, { status: 400 });
    }

    const platform = os.platform();
    const cmd = platform === "win32" ? "explorer" : platform === "linux" ? "xdg-open" : "open";

    await new Promise<void>((resolve) => {
      execFile(cmd, [dir], { timeout: 5000 }, () => resolve());
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Failed to open directory",
    }, { status: 500 });
  }
}
