export interface OpenClawCommandOptions {
  binaryPath?: string;
  homeDir?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}

export interface OpenClawCommandRunner {
  exec(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  stream?(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      env?: NodeJS.ProcessEnv;
      timeoutMs?: number;
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
  ): Promise<{ stdout: string; stderr: string; exitCode: number }>;
  spawnDetachedPty?(
    command: string,
    args: string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number },
  ): { pid: number | undefined; command: string; args: string[] };
}

function readConfiguredValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function resolveOpenClawBinaryPath(options: OpenClawCommandOptions = {}): string {
  return readConfiguredValue(options.binaryPath)
    ?? readConfiguredValue(options.env?.CLAWJS_OPENCLAW_PATH)
    ?? readConfiguredValue(process.env.CLAWJS_OPENCLAW_PATH)
    ?? "openclaw";
}

export function withOpenClawBinaryEnv(
  env?: NodeJS.ProcessEnv,
  binaryPath?: string,
): NodeJS.ProcessEnv | undefined {
  const resolvedBinaryPath = readConfiguredValue(binaryPath) ?? readConfiguredValue(env?.CLAWJS_OPENCLAW_PATH);
  if (!resolvedBinaryPath) {
    return env;
  }
  return {
    ...(env ?? {}),
    CLAWJS_OPENCLAW_PATH: resolvedBinaryPath,
  };
}

export function withOpenClawCommandEnv(
  env?: NodeJS.ProcessEnv,
  options: OpenClawCommandOptions = {},
): NodeJS.ProcessEnv | undefined {
  const commandEnv = withOpenClawBinaryEnv(env, options.binaryPath) ?? (env ? { ...env } : undefined) ?? {};
  const resolvedStateDir = readConfiguredValue(commandEnv.OPENCLAW_STATE_DIR) ?? readConfiguredValue(options.homeDir);
  const resolvedConfigPath = readConfiguredValue(commandEnv.OPENCLAW_CONFIG_PATH) ?? readConfiguredValue(options.configPath);

  if (resolvedStateDir) {
    commandEnv.OPENCLAW_STATE_DIR = resolvedStateDir;
  }
  if (resolvedConfigPath) {
    commandEnv.OPENCLAW_CONFIG_PATH = resolvedConfigPath;
  }

  return Object.keys(commandEnv).length > 0 ? commandEnv : undefined;
}

export function buildOpenClawCommand(
  args: string[],
  options: OpenClawCommandOptions = {},
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const env = withOpenClawCommandEnv(options.env, options);
  return {
    command: resolveOpenClawBinaryPath({
      ...options,
      ...(env ? { env } : {}),
    }),
    args,
    ...(env ? { env } : {}),
  };
}

export function withOpenClawCommandRunner<T extends OpenClawCommandRunner>(
  runner: T,
  options: OpenClawCommandOptions = {},
): T {
  const env = withOpenClawCommandEnv(options.env, options);
  const binaryPath = resolveOpenClawBinaryPath({
    ...options,
    ...(env ? { env } : {}),
  });

  return {
    exec(command, args, execOptions = {}) {
      const commandEnv = withOpenClawCommandEnv(execOptions.env ?? env, options);
      return runner.exec(command === "openclaw" ? binaryPath : command, args, {
        ...execOptions,
        ...(commandEnv ? { env: commandEnv } : {}),
      });
    },
    ...(typeof runner.stream === "function" ? {
      stream(command, args, streamOptions = {}) {
        const commandEnv = withOpenClawCommandEnv(streamOptions.env ?? env, options);
        return runner.stream!(command === "openclaw" ? binaryPath : command, args, {
          ...streamOptions,
          ...(commandEnv ? { env: commandEnv } : {}),
        });
      },
    } : {}),
    ...(typeof runner.spawnDetachedPty === "function" ? {
      spawnDetachedPty(command, args, spawnOptions = {}) {
        const commandEnv = withOpenClawCommandEnv(spawnOptions.env ?? env, options);
        return runner.spawnDetachedPty!(command === "openclaw" ? binaryPath : command, args, {
          ...spawnOptions,
          ...(commandEnv ? { env: commandEnv } : {}),
        });
      },
    } : {}),
  } as T;
}
