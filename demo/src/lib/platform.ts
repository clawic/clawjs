/**
 * Cross-platform utilities.
 * Centralises OS-specific logic so the rest of the codebase stays clean.
 */

import { execFile } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import os from "os";
import path from "path";

export const isWindows = process.platform === "win32";
export const isMac = process.platform === "darwin";

/* ─── Binary discovery ────────────────────────────────────────────── */

const home = os.homedir();

const UNIX_CANDIDATES = (cmd: string): string[] => {
  const fixed = [
    `/opt/homebrew/bin/${cmd}`,
    `/usr/local/bin/${cmd}`,
    `/usr/bin/${cmd}`,
    path.join(home, ".volta/bin", cmd),
    path.join(home, ".local/bin", cmd),
  ];

  // Scan nvm versions, pick the most recently modified one
  const nvmDir = path.join(home, ".nvm/versions/node");
  try {
    const versions = readdirSync(nvmDir);
    const withMtime = versions
      .map((v) => {
        const bin = path.join(nvmDir, v, "bin", cmd);
        try {
          return { bin, mtime: statSync(bin).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as { bin: string; mtime: number }[];
    if (withMtime.length) {
      withMtime.sort((a, b) => b.mtime - a.mtime);
      fixed.push(withMtime[0].bin);
    }
  } catch {
    // nvm dir does not exist
  }

  return fixed;
};

const WIN_CANDIDATES = (cmd: string) => {
  const ext = cmd.endsWith(".exe") ? "" : ".exe";
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [
    ...(localAppData ? [path.join(localAppData, cmd, `${cmd}${ext}`)] : []),
    path.join(programFiles, cmd, `${cmd}${ext}`),
    path.join(programFilesX86, cmd, `${cmd}${ext}`),
  ];
};

/** In-process cache for resolved binary paths. */
const _cmdCache = new Map<string, string>();

/**
 * Resolve a command from PATH (via login shell / where) or well-known locations.
 * Results are cached for the lifetime of the process.
 * Works on macOS, Linux, and Windows.
 */
export function findCommand(cmd: string): Promise<string | null> {
  const cached = _cmdCache.get(cmd);
  if (cached) return Promise.resolve(cached);

  if (isWindows) {
    return new Promise((resolve) => {
      execFile("where", [cmd], { timeout: 3000 }, (err, stdout) => {
        if (!err && stdout.trim()) {
          const found = stdout.trim().split(/\r?\n/)[0];
          _cmdCache.set(cmd, found);
          resolve(found);
          return;
        }
        const fallback = WIN_CANDIDATES(cmd).find((c) => existsSync(c)) || null;
        if (fallback) _cmdCache.set(cmd, fallback);
        resolve(fallback);
      });
    });
  }

  // Unix: use a login shell so nvm/volta/etc. get loaded
  return new Promise((resolve) => {
    execFile("/bin/bash", ["-lc", `which ${cmd}`], { timeout: 3000 }, (err, stdout) => {
      if (!err && stdout.trim()) {
        const found = stdout.trim().split(/\r?\n/)[0];
        _cmdCache.set(cmd, found);
        resolve(found);
        return;
      }
      const fallback = UNIX_CANDIDATES(cmd).find((c) => existsSync(c)) || null;
      if (fallback) _cmdCache.set(cmd, fallback);
      resolve(fallback);
    });
  });
}

/**
 * Quick check: is a command available on the system?
 */
export async function hasBinary(cmd: string): Promise<boolean> {
  return !!(await findCommand(cmd));
}

/**
 * Like findCommand but throws if the binary is not found.
 */
export async function resolveCommand(cmd: string): Promise<string> {
  const binary = await findCommand(cmd);
  if (!binary) throw new Error(`"${cmd}" not found on this system`);
  return binary;
}

/* ─── Process detection ───────────────────────────────────────────── */

/**
 * Check whether a process matching `pattern` is running.
 */
export function checkProcess(pattern: string): Promise<boolean> {
  if (isWindows) {
    return new Promise((resolve) => {
      execFile("tasklist", [], { timeout: 5000 }, (err, stdout) => {
        resolve(!err && stdout.toLowerCase().includes(pattern.toLowerCase()));
      });
    });
  }
  return new Promise((resolve) => {
    execFile("pgrep", ["-f", pattern], { timeout: 3000 }, (err, stdout) => {
      resolve(!err && !!stdout.trim());
    });
  });
}

/* ─── Open URL in browser ─────────────────────────────────────────── */

/**
 * Open a URL in the default browser.
 */
export function openUrl(url: string): void {
  const cmd = isMac ? "open" : isWindows ? "cmd" : "xdg-open";
  const args = isWindows ? ["/c", "start", "", url] : [url];
  execFile(cmd, args, { timeout: 5000 }, () => {});
}

/* ─── App bundle / installation detection ─────────────────────────── */

/**
 * Check if an application is installed in well-known locations.
 */
export function appInstalled(appName: string): boolean {
  const home = os.homedir();

  if (isMac) {
    const macPaths = [
      `/Applications/${appName}.app`,
      path.join(home, "Applications", `${appName}.app`),
    ];
    return macPaths.some((p) => existsSync(p));
  }

  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const winPaths = [
      ...(localAppData ? [path.join(localAppData, appName, `${appName}.exe`)] : []),
      path.join(programFiles, appName, `${appName}.exe`),
    ];
    return winPaths.some((p) => existsSync(p));
  }

  // Linux
  return false;
}

/* ─── Temp directory ──────────────────────────────────────────────── */

/**
 * Build a path inside the OS temp directory.
 */
export function tmpPath(...segments: string[]): string {
  return path.join(os.tmpdir(), ...segments);
}

/* ─── Pseudo-TTY spawn ────────────────────────────────────────────── */

import { spawn, type ChildProcess } from "child_process";

/**
 * Spawn a process with a pseudo-TTY on macOS/Linux, or a plain spawn on Windows.
 * Returns the child process so the caller can attach listeners.
 */
export function spawnWithPty(binary: string, args: string[], env?: Record<string, string>): ChildProcess {
  const mergedEnv = { ...process.env, ...env };

  if (isMac) {
    // macOS: use `script -q /dev/null` to allocate a pseudo-TTY
    const child = spawn("script", ["-q", "/dev/null", binary, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: mergedEnv,
    });
    child.unref();
    return child;
  }

  if (!isWindows) {
    // Linux: `script -qc "binary args..."` (different syntax than macOS)
    const child = spawn("script", ["-qc", [binary, ...args].join(" "), "/dev/null"], {
      stdio: ["ignore", "pipe", "pipe"],
      env: mergedEnv,
    });
    child.unref();
    return child;
  }

  // Windows: no pseudo-TTY needed, spawn directly
  const child = spawn(binary, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: mergedEnv,
    shell: true,
  });
  child.unref();
  return child;
}
