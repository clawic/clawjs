import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

const IGNORED_DIRS = new Set([
  ".git",
  ".next",
  ".playwright-cli",
  "dist",
  "node_modules",
  "output",
  "tmp-cli-workspace",
]);

function fromCharCodes(codes: number[]): string {
  return String.fromCharCode(...codes);
}

const DISALLOWED_PATTERNS = [
  {
    label: "retired product name",
    pattern: new RegExp(fromCharCodes([111, 112, 101, 110, 116, 104, 101, 114, 97, 112, 121]), "i"),
  },
  {
    label: "retired demo agent name",
    pattern: new RegExp(fromCharCodes([116, 104, 101, 114, 97, 112, 121, 45, 109, 97, 105, 110])),
  },
  {
    label: "retired demo writer name",
    pattern: new RegExp(fromCharCodes([106, 111, 117, 114, 110, 97, 108, 45, 119, 114, 105, 116, 101, 114])),
  },
  {
    label: "retired demo support name",
    pattern: new RegExp(fromCharCodes([115, 117, 112, 112, 111, 114, 116, 45, 99, 111, 109, 112, 97, 99, 116])),
  },
  {
    label: "retired demo title",
    pattern: new RegExp(fromCharCodes([72, 111, 119, 32, 100, 111, 32, 73, 32, 116, 97, 108, 107, 32, 119, 105, 116, 104, 111, 117, 116, 32, 101, 115, 99, 97, 108, 97, 116, 105, 110, 103, 63])),
  },
  {
    label: "retired demo prompt",
    pattern: new RegExp(fromCharCodes([73, 32, 110, 101, 101, 100, 32, 116, 111, 32, 116, 97, 108, 107, 32, 116, 111, 32, 109, 121, 32, 112, 97, 114, 116, 110, 101, 114, 32, 116, 111, 110, 105, 103, 104, 116, 32, 119, 105, 116, 104, 111, 117, 116, 32, 101, 115, 99, 97, 108, 97, 116, 105, 110, 103, 32, 116, 104, 101, 32, 99, 111, 110, 118, 101, 114, 115, 97, 116, 105, 111, 110, 46])),
  },
];

function listFiles(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;
    const next = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(next));
      continue;
    }
    files.push(next);
  }
  return files;
}

test("repo source does not leak legacy product or retired demo names", () => {
  const repoRoot = path.resolve(import.meta.dirname, "..", "..", "..");
  const files = listFiles(repoRoot).filter((filePath) =>
    /\.(ts|md|json|mjs|html)$/.test(filePath) && !filePath.endsWith("release-readiness.test.ts")
  );
  const leaks = files.flatMap((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    return DISALLOWED_PATTERNS
      .filter(({ pattern }) => pattern.test(raw))
      .map(({ label }) => `${path.relative(repoRoot, filePath)} contains ${label}`);
  });

  assert.deepEqual(leaks, []);
});
