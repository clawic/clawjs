import type { CapabilityName } from "./types.ts";

export type ClawErrorCode =
  | "runtime_not_found"
  | "runtime_unsupported"
  | "compatibility_error"
  | "workspace_not_found"
  | "workspace_ownership_error"
  | "file_sync_conflict"
  | "managed_block_missing"
  | "provider_auth_error"
  | "model_selection_error"
  | "conversation_stream_error"
  | "doctor_error";

export class ClawError extends Error {
  readonly code: ClawErrorCode;
  readonly capability?: CapabilityName;
  readonly repairHint?: string;
  readonly diagnostic?: Record<string, unknown>;

  constructor(options: {
    code: ClawErrorCode;
    message: string;
    capability?: CapabilityName;
    repairHint?: string;
    diagnostic?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "ClawError";
    this.code = options.code;
    this.capability = options.capability;
    this.repairHint = options.repairHint;
    this.diagnostic = options.diagnostic;
  }
}

export function toClawError(error: unknown, fallback: Omit<ConstructorParameters<typeof ClawError>[0], "message"> & { message?: string }): ClawError {
  if (error instanceof ClawError) return error;
  return new ClawError({
    ...fallback,
    message: error instanceof Error ? error.message : fallback.message || String(error),
  });
}
