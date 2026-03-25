import { hasBinary, checkProcess, appInstalled } from "@/lib/platform";

export interface OpenClawRuntime {
  openClawInstalled: boolean;
  openClawRunning: boolean;
  wacliAvailable: boolean;
}

export async function detectOpenClawRuntime(): Promise<OpenClawRuntime> {
  const [wacliAvailable, openClawCliAvailable, openClawRunning] = await Promise.all([
    hasBinary("wacli"),
    hasBinary("openclaw"),
    checkProcess("openclaw"),
  ]);

  return {
    openClawInstalled: appInstalled("OpenClaw") || appInstalled("OpenClaw Desktop") || openClawCliAvailable || openClawRunning || wacliAvailable,
    openClawRunning,
    wacliAvailable,
  };
}
