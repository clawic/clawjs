import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);

const docRoots = [
  path.join(rootDir, "README.md"),
  path.join(rootDir, "docs"),
];

const publicDocPages = [
  "index.md",
  "getting-started.md",
  "terminology.md",
  "runtime.md",
  "workspace.md",
  "authentication.md",
  "models.md",
  "conversations.md",
  "files.md",
  "watchers.md",
  "diagnostics.md",
  "cli.md",
  "api.md",
  "surface.md",
];

const forbiddenPatterns = [
  {
    label: "absolute local workspace path",
    pattern: /(?:\/Users\/(?!user\b)[^/\s"'`]+\/[^\s"'`]+|\/home\/(?!user\b)[^/\s"'`]+\/[^\s"'`]+|[A-Za-z]:\\Users\\(?!user\b)[^\s"'`]+)/g,
  },
  {
    label: "SDK imported from clawjs package",
    pattern: /import\s*\{\s*createClaw\s*\}\s*from\s*"clawjs"/g,
  },
  {
    label: "CLI docs using repo-local package path",
    pattern: /node\s+packages\/clawjs\/bin\/clawjs\.mjs/g,
  },
  {
    label: "stale files API registerBinding example",
    pattern: /\bclaw\.files\.registerBinding\b/g,
  },
  {
    label: "stale watcher emit example on claw.watch",
    pattern: /\bclaw\.watch\.emit\b/g,
  },
  {
    label: "stale watcher iterate example on claw.watch",
    pattern: /\bclaw\.watch\.iterate\b/g,
  },
  {
    label: "stale watcher runtimeStatus example",
    pattern: /\bclaw\.watch\.watchRuntimeStatus\b/g,
  },
  {
    label: "stale watcher providerStatus example",
    pattern: /\bclaw\.watch\.watchProviderStatus\b/g,
  },
  {
    label: "stale conversations.create example",
    pattern: /\bclaw\.conversations\.create\(/g,
  },
  {
    label: "stale conversations.stream example",
    pattern: /\bclaw\.conversations\.stream\(/g,
  },
  {
    label: "stale FileSyncConflictError example",
    pattern: /\bFileSyncConflictError\b/g,
  },
];

const requiredSnippets = [
  {
    file: path.join(rootDir, "docs", "api.md"),
    snippets: [
      "claw.telegram",
      "claw.secrets",
      "claw.inference",
      "claw.data",
      "claw.orchestration",
      "eventsIterator",
    ],
  },
  {
    file: path.join(rootDir, "docs", "cli.md"),
    snippets: [
      "files apply-template-pack",
      "telegram webhook set",
      "telegram polling start",
      "sessions generate-title",
      "workspace repair",
      "channels status",
    ],
  },
  {
    file: path.join(rootDir, "docs", "files.md"),
    snippets: [
      "writeWorkspaceFilePreservingManagedBlocks",
      "updateSettings",
      "managedBlockMarkers",
      "previewManagedBlockMutation",
    ],
  },
  {
    file: path.join(rootDir, "docs", "watchers.md"),
    snippets: [
      "claw.watch.runtimeStatus",
      "claw.watch.providerStatus",
      "ClawEventBus",
      "watchPolledValue",
      "eventsIterator",
    ],
  },
];

function listFiles(targetPath) {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) return [targetPath];
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "dist" || entry.name === "node_modules" || entry.name === ".vitepress") return [];
    const next = path.join(targetPath, entry.name);
    return entry.isDirectory() ? listFiles(next) : [next];
  });
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractExports(filePath) {
  const raw = read(filePath);
  const start = raw.lastIndexOf("export {");
  if (start === -1) {
    throw new Error(`Missing export block in ${filePath}`);
  }
  const tail = raw.slice(start + "export {".length);
  const end = tail.indexOf("};");
  if (end === -1) {
    throw new Error(`Unterminated export block in ${filePath}`);
  }
  return tail
    .slice(0, end)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, "").replace(/^(.*?)\s+as\s+(.*)$/, "$2"));
}

const docFiles = docRoots.flatMap((targetPath) => listFiles(targetPath))
  .filter((filePath) => /\.(md|html)$/.test(filePath));

const violations = [];

for (const page of publicDocPages) {
  const targetPath = path.join(rootDir, "docs", page);
  if (!fs.existsSync(targetPath)) {
    violations.push(`docs site is missing required page ${page}`);
  }
}

for (const filePath of docFiles) {
  const raw = read(filePath);
  for (const rule of forbiddenPatterns) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(raw)) {
      violations.push(`${path.relative(rootDir, filePath)} contains ${rule.label}`);
    }
  }
}

for (const requirement of requiredSnippets) {
  const raw = read(requirement.file);
  for (const snippet of requirement.snippets) {
    if (!raw.includes(snippet)) {
      violations.push(`${path.relative(rootDir, requirement.file)} is missing required snippet ${snippet}`);
    }
  }
}

const surfacePath = path.join(rootDir, "docs", "surface.md");
const surfaceRaw = read(surfacePath);

for (const exportName of extractExports(path.join(rootDir, "packages", "clawjs-node", "dist", "index.d.ts"))) {
  if (!surfaceRaw.includes(exportName)) {
    violations.push(`docs/surface.md is missing @clawjs/claw export ${exportName}`);
  }
}

for (const exportName of extractExports(path.join(rootDir, "packages", "clawjs-core", "dist", "index.d.ts"))) {
  if (!surfaceRaw.includes(exportName)) {
    violations.push(`docs/surface.md is missing @clawjs/core export ${exportName}`);
  }
}

if (violations.length > 0) {
  console.error("Documentation surface check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Documentation surface check passed for ${docFiles.length} files.`);
