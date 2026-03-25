import type { RuntimeProbeStatus } from "../runtime/contracts.ts";
import type { ProviderAuthSummary } from "@clawjs/core";

export interface PollWatchOptions {
  intervalMs?: number;
  emitInitial?: boolean;
}

type StopWatching = () => void;

function normalizeStableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeStableValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalizeStableValue(entry)]),
    );
  }
  return value;
}

function stableValue(value: unknown): string {
  return JSON.stringify(normalizeStableValue(value));
}

export function watchPolledValue<TValue>(
  read: () => Promise<TValue>,
  callback: (value: TValue) => void,
  options: PollWatchOptions = {},
): StopWatching {
  const intervalMs = options.intervalMs ?? 250;
  const emitInitial = options.emitInitial ?? true;
  let active = true;
  let previousValue: string | null = null;
  let inFlight = false;

  const poll = async () => {
    if (!active || inFlight) return;
    inFlight = true;
    try {
      const next = await read();
      const serialized = stableValue(next);
      if ((emitInitial && previousValue === null) || previousValue !== serialized) {
        previousValue = serialized;
        callback(next);
      }
    } finally {
      inFlight = false;
    }
  };

  void poll();
  const handle = setInterval(() => {
    void poll();
  }, intervalMs);

  return () => {
    active = false;
    clearInterval(handle);
  };
}

export function watchRuntimeStatus(
  read: () => Promise<RuntimeProbeStatus>,
  callback: (value: RuntimeProbeStatus) => void,
  options?: PollWatchOptions,
): StopWatching {
  return watchPolledValue(read, callback, options);
}

export function watchProviderStatus(
  read: () => Promise<Record<string, ProviderAuthSummary>>,
  callback: (value: Record<string, ProviderAuthSummary>) => void,
  options?: PollWatchOptions,
): StopWatching {
  return watchPolledValue(read, callback, options);
}
