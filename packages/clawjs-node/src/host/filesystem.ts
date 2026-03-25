import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface AtomicWriteResult {
  changed: boolean;
  filePath: string;
  backupPath?: string;
}

export interface WriteTextOptions {
  backupDir?: string;
  mode?: number;
}

export interface LockHandle {
  lockPath: string;
  release: () => void;
}

export interface LockRetryOptions {
  timeoutMs?: number;
  retryDelayMs?: number;
}

export function resolveFileLockPath(filePath: string): string {
  return `${filePath}.lock`;
}

function randomSuffix(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function sleepSync(delayMs: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
}

export class NodeFileSystemHost {
  exists(targetPath: string): boolean {
    return fs.existsSync(targetPath);
  }

  ensureDir(dirPath: string): void {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  readText(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  tryReadText(filePath: string): string {
    try {
      return this.readText(filePath);
    } catch {
      return "";
    }
  }

  writeTextAtomic(filePath: string, content: string, options: WriteTextOptions = {}): AtomicWriteResult {
    const normalized = content.replace(/\r\n/g, "\n");
    const exists = this.exists(filePath);
    const current = this.tryReadText(filePath);
    if (exists && current === normalized) {
      return { changed: false, filePath };
    }

    const dir = path.dirname(filePath);
    this.ensureDir(dir);

    let backupPath: string | undefined;
    if (current && options.backupDir) {
      this.ensureDir(options.backupDir);
      backupPath = path.join(options.backupDir, `${path.basename(filePath)}.${randomSuffix()}.bak`);
      fs.writeFileSync(backupPath, current, "utf8");
    }

    const tempPath = path.join(dir, `.${path.basename(filePath)}.${randomSuffix()}.tmp`);
    fs.writeFileSync(tempPath, normalized, {
      encoding: "utf8",
      mode: options.mode,
    });
    fs.renameSync(tempPath, filePath);

    return { changed: true, filePath, backupPath };
  }

  restoreFromBackup(filePath: string, backupPath: string): void {
    if (!this.exists(backupPath)) {
      throw new Error(`Backup does not exist: ${backupPath}`);
    }
    this.writeTextAtomic(filePath, this.readText(backupPath));
  }

  acquireLock(lockPath: string): LockHandle {
    this.ensureDir(path.dirname(lockPath));
    const fd = fs.openSync(lockPath, "wx");
    fs.closeSync(fd);
    return {
      lockPath,
      release: () => {
        if (this.exists(lockPath)) {
          fs.unlinkSync(lockPath);
        }
      },
    };
  }

  withLock<T>(lockPath: string, fn: () => T): T {
    const lock = this.acquireLock(lockPath);
    try {
      return fn();
    } finally {
      lock.release();
    }
  }

  withLockRetry<T>(lockPath: string, fn: () => T, options: LockRetryOptions = {}): T {
    const timeoutMs = options.timeoutMs ?? 2_000;
    const retryDelayMs = options.retryDelayMs ?? 10;
    const startedAt = Date.now();

    while (true) {
      try {
        return this.withLock(lockPath, fn);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code !== "EEXIST" || Date.now() - startedAt >= timeoutMs) {
          throw error;
        }
        sleepSync(retryDelayMs);
      }
    }
  }

  remove(targetPath: string): void {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }

  rename(fromPath: string, toPath: string): void {
    this.ensureDir(path.dirname(toPath));
    fs.renameSync(fromPath, toPath);
  }

  appendText(filePath: string, content: string): void {
    this.ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, content.replace(/\r\n/g, "\n"), "utf8");
  }
}
