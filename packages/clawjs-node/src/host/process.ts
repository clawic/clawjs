import { execFile, spawn } from "child_process";

function buildCommandNotFoundMessage(command: string, error: Error & { code?: unknown }): string {
  const isExplicitPath = command.includes("/") || command.includes("\\");
  if (isExplicitPath) {
    return `Command not found: ${command}. Ensure the configured binary exists and is executable.`;
  }
  return `Command not found: ${command}. Ensure it is installed and available on PATH.`;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface StreamOptions extends ExecOptions {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface DetachedSpawnResult {
  pid: number | undefined;
  command: string;
  args: string[];
}

export interface DetachedPtySpec {
  command: string;
  args: string[];
  shell?: boolean;
}

export function buildDetachedPtySpec(command: string, args: string[], platform = process.platform): DetachedPtySpec {
  if (platform === "darwin") {
    return {
      command: "script",
      args: ["-q", "/dev/null", command, ...args],
    };
  }

  if (platform === "win32") {
    return {
      command,
      args,
      shell: true,
    };
  }

  return {
    command: "script",
    args: ["-qc", [command, ...args].join(" "), "/dev/null"],
  };
}

export class NodeProcessHost {
  exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          cwd: options.cwd,
          env: options.env,
          timeout: options.timeoutMs,
          encoding: "utf8",
          maxBuffer: 10 * 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const exitCode = typeof error?.code === "number" ? error.code : 0;
          const result = {
            stdout: stdout ?? "",
            stderr: stderr ?? "",
            exitCode,
          };
          if (error) {
            const message = error.code === "ENOENT"
              ? buildCommandNotFoundMessage(command, error)
              : stderr?.trim() || error.message;
            reject(Object.assign(new Error(message), { result, code: error.code }));
            return;
          }
          resolve(result);
        }
      );
    });
  }

  stream(command: string, args: string[], options: StreamOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | undefined;

      if (options.timeoutMs) {
        timeoutId = setTimeout(() => {
          child.kill("SIGKILL");
        }, options.timeoutMs);
      }

      child.stdout?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        stdout += text;
        options.onStdout?.(text);
      });

      child.stderr?.on("data", (chunk: Buffer | string) => {
        const text = chunk.toString();
        stderr += text;
        options.onStderr?.(text);
      });

      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        const normalized = error instanceof Error
          ? Object.assign(new Error(
            (error as Error & { code?: unknown }).code === "ENOENT"
              ? buildCommandNotFoundMessage(command, error as Error & { code?: unknown })
              : error.message,
          ), { code: (error as Error & { code?: unknown }).code })
          : error;
        reject(normalized);
      });

      child.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        const result = {
          stdout,
          stderr,
          exitCode: code ?? 0,
        };
        if ((code ?? 0) !== 0) {
          reject(Object.assign(new Error(stderr.trim() || `Command failed with exit code ${code}`), { result }));
          return;
        }
        resolve(result);
      });
    });
  }

  spawnDetachedPty(command: string, args: string[], options: ExecOptions = {}): DetachedSpawnResult {
    const spec = buildDetachedPtySpec(command, args);
    const child = spawn(spec.command, spec.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: "ignore",
      detached: true,
      shell: spec.shell,
    });
    child.unref();
    return {
      pid: child.pid,
      command: spec.command,
      args: spec.args,
    };
  }
}
