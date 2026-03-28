import { execFile, type ExecFileException } from "child_process";

export interface TerminalLaunchOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  execFileImpl?: (
    file: string,
    args: readonly string[],
    options: { timeout?: number; maxBuffer?: number },
    callback: (error: ExecFileException | null, stdout: string, stderr: string) => void,
  ) => void;
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildShellCommand(
  command: string,
  args: string[],
  options: Pick<TerminalLaunchOptions, "cwd" | "env"> = {},
): string {
  const segments: string[] = [];

  if (options.cwd?.trim()) {
    segments.push(`cd ${shellQuote(options.cwd.trim())}`);
  }

  const envEntries = Object.entries(options.env ?? {})
    .filter(([, value]) => typeof value === "string" && value.length > 0)
    .map(([key, value]) => `${key}=${shellQuote(value!)}`);

  const escapedCommand = [command, ...args].map(shellQuote).join(" ");
  segments.push(envEntries.length > 0 ? `env ${envEntries.join(" ")} ${escapedCommand}` : escapedCommand);

  return segments.join("; ");
}

export function buildMacTerminalAppleScript(shellCommand: string): string[] {
  return [
    'tell application "Terminal" to activate',
    `tell application "Terminal" to do script ${JSON.stringify(shellCommand)}`,
  ];
}

export async function launchInMacTerminal(
  command: string,
  args: string[],
  options: TerminalLaunchOptions = {},
): Promise<void> {
  const shellCommand = buildShellCommand(command, args, options);
  const appleScript = buildMacTerminalAppleScript(shellCommand);
  const execFileImpl = options.execFileImpl ?? execFile;

  await new Promise<void>((resolve, reject) => {
    execFileImpl(
      "osascript",
      appleScript.flatMap((line) => ["-e", line]),
      {
        timeout: options.timeoutMs ?? 5_000,
        maxBuffer: 1024 * 1024,
      },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message));
          return;
        }
        resolve();
      },
    );
  });
}
