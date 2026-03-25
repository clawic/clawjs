import path from "path";

import type { CommandRunner } from "./contracts.ts";

export interface OpenClawMemorySearchCommandOptions {
  agentId?: string;
  limit?: number;
  minScore?: number;
}

export interface OpenClawMemorySearchHit {
  text: string;
  path?: string;
  startLine?: number;
  endLine?: number;
  score?: number;
  provider?: string;
  model?: string;
  raw?: Record<string, unknown>;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPath(record: Record<string, unknown>): string | undefined {
  const direct = normalizeText(record.path)
    || normalizeText(record.filePath)
    || normalizeText(record.file)
    || normalizeText(record.sourcePath);
  if (direct) return direct;

  const location = record.location;
  if (!location || typeof location !== "object") return undefined;
  return normalizeText((location as Record<string, unknown>).path)
    || normalizeText((location as Record<string, unknown>).file);
}

function readLine(record: Record<string, unknown>, kind: "start" | "end"): number | undefined {
  const direct = normalizeNumber(record[kind === "start" ? "startLine" : "endLine"])
    ?? normalizeNumber(record[kind === "start" ? "start_line" : "end_line"])
    ?? normalizeNumber(record[kind === "start" ? "lineStart" : "lineEnd"]);
  if (direct !== undefined) return direct;

  const location = record.location;
  if (!location || typeof location !== "object") return undefined;
  const typedLocation = location as Record<string, unknown>;
  return normalizeNumber(typedLocation[kind === "start" ? "startLine" : "endLine"])
    ?? normalizeNumber((typedLocation[kind] as Record<string, unknown> | undefined)?.line);
}

function parseHit(input: unknown): OpenClawMemorySearchHit | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const text = normalizeText(record.text)
    || normalizeText(record.snippet)
    || normalizeText(record.content)
    || normalizeText(record.excerpt)
    || normalizeText(record.chunk);
  if (!text) return null;

  return {
    text,
    ...(readPath(record) ? { path: readPath(record) } : {}),
    ...(readLine(record, "start") !== undefined ? { startLine: readLine(record, "start") } : {}),
    ...(readLine(record, "end") !== undefined ? { endLine: readLine(record, "end") } : {}),
    ...(normalizeNumber(record.score) !== undefined ? { score: normalizeNumber(record.score) } : {}),
    ...(normalizeText(record.provider) ? { provider: normalizeText(record.provider) } : {}),
    ...(normalizeText(record.model) ? { model: normalizeText(record.model) } : {}),
    raw: record,
  };
}

function unwrapHits(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return [];

  const record = input as Record<string, unknown>;
  for (const key of ["results", "hits", "items", "entries", "data"]) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return [];
}

export function buildOpenClawMemorySearchCommand(
  query: string,
  options: OpenClawMemorySearchCommandOptions = {},
): { command: string; args: string[] } {
  const args = [
    "memory",
    ...(options.agentId ? ["--agent", options.agentId] : []),
    "search",
    "--query",
    query,
    "--json",
  ];

  if (typeof options.limit === "number" && Number.isFinite(options.limit) && options.limit > 0) {
    args.push("--max-results", String(Math.trunc(options.limit)));
  }
  if (typeof options.minScore === "number" && Number.isFinite(options.minScore)) {
    args.push("--min-score", String(options.minScore));
  }

  return {
    command: "openclaw",
    args,
  };
}

export function parseOpenClawMemorySearch(raw: string): OpenClawMemorySearchHit[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed) as unknown;
  return unwrapHits(parsed)
    .map((entry) => parseHit(entry))
    .filter(Boolean) as OpenClawMemorySearchHit[];
}

export async function runOpenClawMemorySearch(
  query: string,
  runner: CommandRunner,
  options: OpenClawMemorySearchCommandOptions & { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<OpenClawMemorySearchHit[]> {
  const command = buildOpenClawMemorySearchCommand(query, options);
  const result = await runner.exec(command.command, command.args, {
    env: options.env,
    timeoutMs: options.timeoutMs ?? 20_000,
  });
  return parseOpenClawMemorySearch(result.stdout);
}

export function resolveMemoryHitLabel(hit: OpenClawMemorySearchHit, fallback = "Memory search result"): string {
  if (hit.path) {
    const fileName = path.basename(hit.path);
    if (fileName) return fileName;
  }
  return fallback;
}
