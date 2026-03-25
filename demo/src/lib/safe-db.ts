import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

/**
 * Restrict file permissions to owner-only (0o600).
 * Silently ignores errors (e.g. on Windows where chmod is a no-op).
 */
function restrictPermissions(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort: chmod may not be supported on all platforms
  }
}

/**
 * Open a better-sqlite3 database, surfacing native module mismatch errors
 * instead of letting callers silently swallow them.
 * New databases are created with owner-only permissions (0o600).
 */
export function openDb(dbPath: string, options?: Database.Options): Database.Database {
  const isNew = !fs.existsSync(dbPath);
  try {
    // Ensure parent directory exists
    if (isNew) {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    const db = new Database(dbPath, options);
    if (isNew) {
      restrictPermissions(dbPath);
    }
    return db;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message.includes("NODE_MODULE_VERSION") ||
        err.message.includes("was compiled against") ||
        err.message.includes("dlopen"))
    ) {
      console.error(
        "\n[ClawJS] better-sqlite3 native module mismatch.\n" +
          "[ClawJS] Run: npm rebuild better-sqlite3\n"
      );
    }
    throw err;
  }
}
