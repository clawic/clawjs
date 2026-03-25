import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOpenClawMemorySearchCommand,
  parseOpenClawMemorySearch,
  runOpenClawMemorySearch,
} from "./openclaw-memory.ts";

test("buildOpenClawMemorySearchCommand includes agent and search flags", () => {
  assert.deepEqual(
    buildOpenClawMemorySearchCommand("budget", {
      agentId: "demo-main",
      limit: 5,
      minScore: 0.25,
    }),
    {
      command: "openclaw",
      args: [
        "memory",
        "--agent",
        "demo-main",
        "search",
        "--query",
        "budget",
        "--json",
        "--max-results",
        "5",
        "--min-score",
        "0.25",
      ],
    },
  );
});

test("parseOpenClawMemorySearch tolerates common hit envelopes", () => {
  const hits = parseOpenClawMemorySearch(JSON.stringify({
    results: [{
      text: "Quarterly budget review",
      path: "/tmp/agents/demo-main/sessions/clawjs-123.jsonl",
      startLine: 10,
      endLine: 12,
      score: 0.82,
    }],
  }));

  assert.deepEqual(hits, [{
    text: "Quarterly budget review",
    path: "/tmp/agents/demo-main/sessions/clawjs-123.jsonl",
    startLine: 10,
    endLine: 12,
    score: 0.82,
    raw: {
      text: "Quarterly budget review",
      path: "/tmp/agents/demo-main/sessions/clawjs-123.jsonl",
      startLine: 10,
      endLine: 12,
      score: 0.82,
    },
  }]);
});

test("runOpenClawMemorySearch executes the OpenClaw CLI and parses hits", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];
  const hits = await runOpenClawMemorySearch("budget", {
    exec: async (command, args) => {
      calls.push({ command, args });
      return {
        stdout: JSON.stringify({
          hits: [{
            snippet: "Budget decisions",
            filePath: "/tmp/agents/demo-main/sessions/clawjs-456.jsonl",
            score: 0.7,
          }],
        }),
        stderr: "",
        exitCode: 0,
      };
    },
  }, {
    agentId: "demo-main",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, "openclaw");
  assert.deepEqual(hits, [{
    text: "Budget decisions",
    path: "/tmp/agents/demo-main/sessions/clawjs-456.jsonl",
    score: 0.7,
    raw: {
      snippet: "Budget decisions",
      filePath: "/tmp/agents/demo-main/sessions/clawjs-456.jsonl",
      score: 0.7,
    },
  }]);
});
