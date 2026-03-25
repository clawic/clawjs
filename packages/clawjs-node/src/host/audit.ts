import path from "path";
import { NodeFileSystemHost, resolveFileLockPath } from "./filesystem.ts";

export interface AuditRecord {
  timestamp: string;
  event: string;
  capability?: string;
  detail?: Record<string, unknown>;
}

export interface AuditQueryInput {
  capability?: string;
  event?: string;
  action?: string;
  entityId?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export class WorkspaceAuditLog {
  private readonly filesystem: NodeFileSystemHost;

  constructor(filesystem = new NodeFileSystemHost()) {
    this.filesystem = filesystem;
  }

  append(workspaceDir: string, record: AuditRecord): string {
    const auditDir = path.join(workspaceDir, ".clawjs", "audit");
    const auditPath = path.join(auditDir, "audit.jsonl");
    this.filesystem.ensureDir(auditDir);
    const line = JSON.stringify(record);
    this.filesystem.withLockRetry(resolveFileLockPath(auditPath), () => {
      this.filesystem.appendText(auditPath, `${line}\n`);
    });
    return auditPath;
  }

  list(workspaceDir: string): AuditRecord[] {
    const auditPath = path.join(workspaceDir, ".clawjs", "audit", "audit.jsonl");
    if (!this.filesystem.exists(auditPath)) return [];
    return this.filesystem.readText(auditPath)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as AuditRecord;
        } catch {
          return null;
        }
      })
      .filter((record): record is AuditRecord => record !== null);
  }

  query(workspaceDir: string, input: AuditQueryInput = {}): AuditRecord[] {
    const since = input.since ? Date.parse(input.since) : null;
    const until = input.until ? Date.parse(input.until) : null;

    return this.list(workspaceDir)
      .filter((record) => {
        if (input.capability && record.capability !== input.capability) return false;
        if (input.event && record.event !== input.event) return false;
        if (input.action) {
          const action = record.event.includes(".") ? record.event.split(".").slice(1).join(".") : record.event;
          if (action !== input.action) return false;
        }
        if (input.entityId) {
          const detailValues = Object.values(record.detail ?? {});
          if (!detailValues.some((value) => String(value) === input.entityId)) return false;
        }
        const timestamp = Date.parse(record.timestamp);
        if (since !== null && !Number.isNaN(timestamp) && timestamp < since) return false;
        if (until !== null && !Number.isNaN(timestamp) && timestamp > until) return false;
        return true;
      })
      .slice(input.limit && input.limit > 0 ? -input.limit : 0);
  }
}
