import { checkProcess, appInstalled, findCommandFresh } from "@/lib/platform";

export interface OpenClawRuntime {
  openClawInstalled: boolean;
  openClawRunning: boolean;
  wacliAvailable: boolean;
}

export async function detectOpenClawRuntime(): Promise<OpenClawRuntime> {
  const [wacliAvailable, openClawCliAvailable, openClawRunning] = await Promise.all([
    findCommandFresh("wacli").then(Boolean),
    findCommandFresh("openclaw").then(Boolean),
    checkProcess("openclaw"),
  ]);

  return {
    openClawInstalled: appInstalled("OpenClaw") || appInstalled("OpenClaw Desktop") || openClawCliAvailable || openClawRunning || wacliAvailable,
    openClawRunning,
    wacliAvailable,
  };
}
