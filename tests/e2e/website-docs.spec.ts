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

test("website landing page builds and renders publicly", async ({ page }) => {
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
    await expect(page.getByRole("heading", { name: "Build AI Agent Apps with Any Runtime" })).toBeVisible();
    await expect(page.locator(".hero__subtitle")).toContainText("Node.js SDK");
    await expect(page.locator(".hero__actions")).toContainText("Get Started");
    await expect(page.locator(".install-bar")).toContainText("npm install -g @clawjs/cli");
    await expect(page.locator(".runtime-marquee")).toContainText("Supported Runtimes");
    await expect(page.locator(".capabilities")).toContainText("Skills");
    await expect(page.locator(".capabilities")).toContainText("Providers & Models");
    await expect(page.getByRole("link", { name: "Get Started" }).first()).toHaveAttribute("href", /docs\.clawjs\.ai\/getting-started/);
    await expect(page.getByRole("link", { name: "API" }).first()).toHaveAttribute("href", /docs\.clawjs\.ai\/api/);
    await saveArtifactScreenshot(page, "website-docs-home.png");
  } finally {
    server.kill("SIGTERM");
  }
});
