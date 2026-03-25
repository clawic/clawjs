import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

const WEBSITE_DIST_DIR = path.join(process.cwd(), "website", "dist");
const WEBSITE_CLI_PAGE = path.join(WEBSITE_DIST_DIR, "docs", "cli.html");

function inlineBuiltCliPage() {
  let html = fs.readFileSync(WEBSITE_CLI_PAGE, "utf8");

  html = html
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>/g, "")
    .replace(/<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>/g, "")
    .replace(/<link href="https:\/\/fonts\.googleapis\.com[^"]+" rel="stylesheet" \/>/g, "");

  html = html.replace(
    /\b(?:src|href)="\/(logo\.png|favicon\.ico|icon-192\.png|icon-512\.png|apple-touch-icon\.png)"/g,
    (match, asset) => `${match.slice(0, match.indexOf('="') + 2)}${pathToFileURL(path.join(WEBSITE_DIST_DIR, asset)).href}"`,
  );

  html = html.replace(
    /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
    (_, assetPath) => `<style>${fs.readFileSync(path.join(WEBSITE_DIST_DIR, assetPath.replace(/^\//, "")), "utf8")}</style>`,
  );

  html = html.replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
    (_, assetPath) => `<script type="module">${fs.readFileSync(path.join(WEBSITE_DIST_DIR, assetPath.replace(/^\//, "")), "utf8")}</script>`,
  );

  return html;
}

test("website docs keep the current interface while sourcing pages from docs", async ({ page }) => {
  test.setTimeout(240_000);

  execFileSync("npm", ["run", "build:website"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  await page.setContent(inlineBuiltCliPage(), { waitUntil: "load" });

  await expect(page.getByRole("heading", { name: "CLI" })).toBeVisible();
  await expect(page.locator(".docs-sidebar")).toContainText("Reference");
  await expect(page.locator(".docs-content")).toContainText("files apply-template-pack");
  await expect(page.locator(".docs-content")).toContainText("sessions generate-title");

  await saveArtifactScreenshot(page, "website-docs-cli.png");
});
