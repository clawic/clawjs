import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { watchConversationTranscript } from "./transcript.ts";

test("watchConversationTranscript observes transcript changes", async () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-watch-transcript-"));
  const transcriptDir = path.join(workspaceDir, ".clawjs", "conversations");
  fs.mkdirSync(transcriptDir, { recursive: true });
  const sessionId = "session-1";
  const transcriptPath = path.join(transcriptDir, `${sessionId}.jsonl`);
  fs.writeFileSync(transcriptPath, "");

  const event = await new Promise<{ filePath: string }>((resolve) => {
    const stop = watchConversationTranscript(workspaceDir, sessionId, (payload) => {
      stop();
      resolve(payload);
    });
    setTimeout(() => {
      fs.appendFileSync(transcriptPath, '{"type":"session"}\n');
    }, 20);
  });

  assert.equal(event.filePath, transcriptPath);
});
