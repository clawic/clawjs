import { execFile, spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import os from "os";
import path from "path";

export interface WacliAuthStatus {
  cliAvailable: boolean;
  authenticated: boolean;
  dbExists: boolean;
  authInProgress: boolean;
  syncing: boolean;
  qrText: string;
  state: "idle" | "starting" | "pairing" | "syncing" | "connected" | "error";
  message: string;
  lastError: string | null;
}

interface WacliSessionState {
  proc: ReturnType<typeof spawn> | null;
  buffer: string;
  qrText: string;
  state: WacliAuthStatus["state"];
  message: string;
  lastError: string | null;
}

const g = globalThis as typeof globalThis & { __wacliSessionState?: WacliSessionState };

function sessionState(): WacliSessionState {
  if (!g.__wacliSessionState) {
    g.__wacliSessionState = {
      proc: null,
      buffer: "",
      qrText: "",
      state: "idle",
      message: "",
      lastError: null,
    };
  }
  return g.__wacliSessionState;
}

function wacliStoreDir(): string {
  return path.join(os.homedir(), ".wacli");
}

function wacliLockPath(): string {
  return path.join(wacliStoreDir(), "LOCK");
}

/** Check if a wacli process is actively running (holds the LOCK file). */
function isWacliProcessRunning(): boolean {
  try {
    const lockContent = readFileSync(wacliLockPath(), "utf8");
    const pidMatch = lockContent.match(/pid=(\d+)/);
    if (!pidMatch) return false;
    const pid = parseInt(pidMatch[1], 10);
    // Check if process is alive (signal 0 doesn't kill, just checks)
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function wacliDbPath(): string {
  return path.join(wacliStoreDir(), "wacli.db");
}

import { findCommand } from "@/lib/platform";

async function execWacli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const binary = await findCommand("wacli");
  if (!binary) {
    throw new Error("wacli is not installed");
  }

  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 20000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function extractQrText(buffer: string): string {
  const marker = "Scan this QR code with WhatsApp (Linked Devices):";
  const markerIndex = buffer.lastIndexOf(marker);
  if (markerIndex === -1) return "";

  const afterMarker = buffer.slice(markerIndex + marker.length).split(/\r?\n/);
  const qrLines: string[] = [];
  let collecting = false;

  for (const line of afterMarker) {
    const trimmed = line.trimEnd();
    if (!collecting && /^[\s█▀▄]+$/u.test(trimmed) && trimmed.trim().length > 0) {
      collecting = true;
      qrLines.push(trimmed);
      continue;
    }
    if (!collecting) continue;
    if (/^[\s█▀▄]+$/u.test(trimmed) && trimmed.length > 0) {
      qrLines.push(trimmed);
      continue;
    }
    break;
  }

  return qrLines.join("\n");
}

async function readAuthStatus(): Promise<boolean> {
  try {
    const { stdout } = await execWacli(["--json", "auth", "status"]);
    const parsed = JSON.parse(stdout) as {
      authenticated?: boolean;
      data?: {
        authenticated?: boolean;
      };
    };
    return !!(parsed.data?.authenticated ?? parsed.authenticated);
  } catch {
    return false;
  }
}

function updateFromBuffer(state: WacliSessionState): void {
  state.qrText = extractQrText(state.buffer);
  if (state.qrText) {
    state.state = "pairing";
    state.message = "Scan the QR code in WhatsApp, then open Linked Devices.";
  }

  if (state.buffer.includes("Authenticated.")) {
    state.state = "connected";
    state.message = "WhatsApp is connected and the initial sync is complete.";
    state.lastError = null;
  }

  if (state.buffer.includes("QR code timed out")) {
    state.state = "error";
    state.message = "The QR code expired before WhatsApp completed the link.";
    state.lastError = "QR code timed out";
  }
}

export async function getWacliAuthStatus(): Promise<WacliAuthStatus> {
  const state = sessionState();
  const cliAvailable = !!await findCommand("wacli");
  const authenticated = cliAvailable ? await readAuthStatus() : false;
  const dbExists = existsSync(wacliDbPath());

  if (authenticated) {
    state.state = "connected";
    state.message = "WhatsApp is connected and authenticated.";
    state.lastError = null;
    state.qrText = "";
  } else if (!state.proc && state.state === "connected") {
    state.state = "idle";
    state.message = "";
  }

  const syncing = authenticated && (!!state.proc || isWacliProcessRunning());

  return {
    cliAvailable,
    authenticated,
    dbExists,
    authInProgress: !!state.proc,
    syncing,
    qrText: state.qrText,
    state: state.state,
    message: state.message,
    lastError: state.lastError,
  };
}

export async function startWacliAuth(): Promise<WacliAuthStatus> {
  const state = sessionState();
  const binary = await findCommand("wacli");
  if (!binary) {
    return {
      cliAvailable: false,
      authenticated: false,
      dbExists: existsSync(wacliDbPath()),
      authInProgress: false,
      syncing: false,
      qrText: "",
      state: "error",
      message: "WhatsApp bridge is not available yet.",
      lastError: "WhatsApp bridge is not installed",
    };
  }

  if (state.proc) {
    return getWacliAuthStatus();
  }

  state.buffer = "";
  state.qrText = "";
  state.state = "starting";
  state.message = "Starting WhatsApp authentication...";
  state.lastError = null;

  const proc = spawn(binary, ["auth"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  state.proc = proc;

  const onChunk = (chunk: Buffer) => {
    state.buffer += chunk.toString("utf8");
    updateFromBuffer(state);
  };

  proc.stdout.on("data", onChunk);
  proc.stderr.on("data", onChunk);

  proc.on("error", (error) => {
    state.proc = null;
    state.state = "error";
    state.message = "WhatsApp authentication failed to start.";
    state.lastError = error.message;
  });

  proc.on("exit", async (code) => {
    state.proc = null;
    updateFromBuffer(state);

    const authenticated = await readAuthStatus();
    if (authenticated) {
      state.state = "connected";
      state.message = "WhatsApp is connected and the initial sync is complete.";
      state.lastError = null;
      state.qrText = "";
      return;
    }

    if (code === 0) {
      state.state = "idle";
      state.message = "";
      return;
    }

    if (!state.lastError) {
      state.state = "error";
      state.message = "WhatsApp authentication did not complete.";
      state.lastError = `WhatsApp auth exited with code ${code ?? "unknown"}`;
    }
  });

  return getWacliAuthStatus();
}

export function stopWacliAuth(): void {
  const state = sessionState();
  if (state.proc) {
    state.proc.kill("SIGTERM");
  }
  state.proc = null;
  state.buffer = "";
  state.qrText = "";
  state.state = "idle";
  state.message = "";
  state.lastError = null;
}
