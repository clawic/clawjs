import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const sourceDir = path.join(rootDir, "docs", "site");
const targetDir = path.join(rootDir, "website", "docs");

fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(targetDir), { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Synced website docs from ${path.relative(rootDir, sourceDir)} to ${path.relative(rootDir, targetDir)}.`);
