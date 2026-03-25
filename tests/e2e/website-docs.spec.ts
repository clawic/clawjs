import http from "node:http";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

const WEBSITE_PORT = 41731;
const WEBSITE_DIST_DIR = path.join(process.cwd(), "website", "dist");
async function waitForServer(url: string) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 20_000) {
    const ready = await new Promise<boolean>((resolve) => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve((response.statusCode ?? 500) === 200);
      });
      request.on("error", () => resolve(false));
    });

    if (ready) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for website server at ${url}`);
}

test("website docs build from markdown and render publicly", async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1600, height: 1000 });

  execFileSync("npm", ["run", "build:website"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  const server = spawn("python3", ["-m", "http.server", String(WEBSITE_PORT), "--directory", WEBSITE_DIST_DIR], {
    cwd: process.cwd(),
    stdio: "ignore",
  });

  try {
    await waitForServer(`http://127.0.0.1:${WEBSITE_PORT}/`);

    await page.goto(`http://127.0.0.1:${WEBSITE_PORT}/`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Build AI agent apps with any runtime." })).toBeVisible();
    await expect(page.locator(".VPSidebar")).toContainText("Overview");
    await expect(page.locator(".VPSidebar")).toContainText("Introduction");
    const homeSidebarBox = await page.locator(".VPSidebar").boundingBox();
    expect(homeSidebarBox?.width ?? 0).toBeGreaterThan(320);
    await expect(page.locator(".intro-hero__actions")).toContainText("Getting Started");
    await saveArtifactScreenshot(page, "website-docs-home.png");

    await page.goto(`http://127.0.0.1:${WEBSITE_PORT}/cli.html`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "CLI" })).toBeVisible();
    await expect(page.locator(".VPSidebar")).toContainText("Reference");
    const sidebarBox = await page.locator(".VPSidebar").boundingBox();
    expect(sidebarBox?.width ?? 0).toBeGreaterThan(320);
    await expect(page.locator(".vp-doc")).toContainText("files apply-template-pack");
    await expect(page.locator(".vp-doc")).toContainText("sessions generate-title");
    await saveArtifactScreenshot(page, "website-docs-cli.png");
  } finally {
    server.kill("SIGTERM");
  }
});
