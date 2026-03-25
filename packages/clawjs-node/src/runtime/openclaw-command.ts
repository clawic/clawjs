export interface OpenClawCommandOptions {
  binaryPath?: string;
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

export function buildOpenClawCommand(
  args: string[],
  options: OpenClawCommandOptions = {},
): { command: string; args: string[]; env?: NodeJS.ProcessEnv } {
  const env = withOpenClawBinaryEnv(options.env, options.binaryPath);
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
  const env = withOpenClawBinaryEnv(options.env, options.binaryPath);
  const binaryPath = resolveOpenClawBinaryPath({
    ...options,
    ...(env ? { env } : {}),
  });

  return {
    exec(command, args, execOptions = {}) {
      const commandEnv = withOpenClawBinaryEnv(execOptions.env ?? env, options.binaryPath);
      return runner.exec(command === "openclaw" ? binaryPath : command, args, {
        ...execOptions,
        ...(commandEnv ? { env: commandEnv } : {}),
      });
    },
    ...(typeof runner.stream === "function" ? {
      stream(command, args, streamOptions = {}) {
        const commandEnv = withOpenClawBinaryEnv(streamOptions.env ?? env, options.binaryPath);
        return runner.stream!(command === "openclaw" ? binaryPath : command, args, {
          ...streamOptions,
          ...(commandEnv ? { env: commandEnv } : {}),
        });
      },
    } : {}),
    ...(typeof runner.spawnDetachedPty === "function" ? {
      spawnDetachedPty(command, args, spawnOptions = {}) {
        const commandEnv = withOpenClawBinaryEnv(spawnOptions.env ?? env, options.binaryPath);
        return runner.spawnDetachedPty!(command === "openclaw" ? binaryPath : command, args, {
          ...spawnOptions,
          ...(commandEnv ? { env: commandEnv } : {}),
        });
      },
    } : {}),
  } as T;
}
