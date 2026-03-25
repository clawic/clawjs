import { watchWorkspaceFile, type WatchCallback, type WatchOptions } from "./index.ts";

export function watchConversationTranscript(
  workspaceDir: string,
  sessionId: string,
  callback: WatchCallback,
  options?: WatchOptions,
): () => void {
  return watchWorkspaceFile(workspaceDir, `.clawjs/conversations/${sessionId}.jsonl`, callback, options);
}
