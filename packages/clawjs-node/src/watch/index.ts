import fs from "fs";
import path from "path";

export type WatchCallback = (event: { eventType: string; filePath: string }) => void;
export interface WatchOptions {
  debounceMs?: number;
}

function resolveWatchDir(filePath: string): string {
  let current = path.dirname(filePath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

export function watchWorkspaceFile(
  workspaceDir: string,
  fileName: string,
  callback: WatchCallback,
  options: WatchOptions = {},
): () => void {
  const filePath = path.join(workspaceDir, fileName);
  const watchDir = resolveWatchDir(filePath);
  const debounceMs = options.debounceMs ?? 25;
  let timer: NodeJS.Timeout | null = null;
  let pendingEvent: { eventType: string; filePath: string } | null = null;
  const emit = (event: { eventType: string; filePath: string }) => {
    pendingEvent = event;
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      const next = pendingEvent;
      pendingEvent = null;
      timer = null;
      if (next) {
        callback(next);
      }
    }, debounceMs);
  };
  const watcher = fs.watch(watchDir, (eventType, changedFileName) => {
    if (path.dirname(filePath) === watchDir && changedFileName != null) {
      const changedName = Buffer.isBuffer(changedFileName) ? changedFileName.toString() : changedFileName;
      if (changedName === path.basename(filePath)) {
        emit({ eventType, filePath });
      }
      return;
    }

    if (changedFileName == null) {
      if (fs.existsSync(filePath)) {
        emit({ eventType, filePath });
      }
      return;
    }

    const changedName = Buffer.isBuffer(changedFileName) ? changedFileName.toString() : changedFileName;
    if (changedName === path.basename(filePath)) {
      emit({ eventType, filePath });
      return;
    }
  });
  return () => {
    watcher.close();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
