import fs from "fs";
import path from "path";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

const cleanedFiles = [
  "README.md",
  "docs/setup.md",
  "RELEASING.md",
  "website/docs/cli.html",
  "package.json",
  "scripts/pack-smoke.mjs",
] as const;
const removedPackage = ["create", "claw", "skill"].join("-");

function readFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

test("repository no longer exposes the unpublished skill wrapper", async ({ request, page }) => {
  const status = await request.get("/api/e2e/status");
  expect(status.ok()).toBeTruthy();

  for (const relativePath of cleanedFiles) {
    expect(readFile(relativePath), `${relativePath} should not mention the removed package`).not.toContain(removedPackage);
  }

  expect(fs.existsSync(path.join(process.cwd(), "packages", removedPackage))).toBe(false);
  expect(readFile("package-lock.json")).not.toContain(removedPackage);

  const cards = cleanedFiles.map((relativePath) => {
    const content = readFile(relativePath);
    const preview = content
      .split("\n")
      .filter((line) => line.includes("create-claw-") || line.includes("claw new") || line.includes("publish"))
      .slice(0, 6)
      .join("\n");

    return `
      <section class="card">
        <h2>${escapeHtml(relativePath)}</h2>
        <pre>${escapeHtml(preview || "No compatibility wrapper mention remains here.")}</pre>
      </section>
    `;
  }).join("");

  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Repository package surface cleanup</title>
        <style>
          :root {
            color-scheme: light;
            font-family: "Iowan Old Style", "Palatino Linotype", serif;
            background: #f4efe6;
            color: #1f1a17;
          }
          body {
            margin: 0;
            min-height: 100vh;
            background:
              radial-gradient(circle at top left, rgba(190, 140, 79, 0.18), transparent 28%),
              linear-gradient(180deg, #f8f3eb 0%, #eee4d3 100%);
          }
          main {
            max-width: 1100px;
            margin: 0 auto;
            padding: 48px 32px 64px;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 40px;
            line-height: 1.1;
          }
          p {
            max-width: 760px;
            font-size: 18px;
            line-height: 1.5;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-top: 28px;
          }
          .card {
            padding: 20px;
            border: 1px solid rgba(76, 55, 37, 0.16);
            border-radius: 18px;
            background: rgba(255, 250, 242, 0.92);
            box-shadow: 0 18px 40px rgba(78, 58, 38, 0.08);
          }
          .card h2 {
            margin: 0 0 12px;
            font-size: 18px;
          }
          pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            font: 14px/1.5 "SFMono-Regular", "Menlo", monospace;
            color: #473526;
          }
          .badge {
            display: inline-block;
            margin-top: 8px;
            padding: 8px 12px;
            border-radius: 999px;
            background: #1f1a17;
            color: #f8f3eb;
            font: 600 13px/1 "SFMono-Regular", "Menlo", monospace;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Public package surface cleaned</h1>
          <p>
            The unpublished skill wrapper package no longer appears in the repository surface.
            This browser view is rendered from the current checked-out files after cleanup.
          </p>
          <span class="badge">wrapper removed</span>
          <div class="grid">${cards}</div>
        </main>
      </body>
    </html>
  `);

  await saveArtifactScreenshot(page, "repository-package-surface.png");
});
