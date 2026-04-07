import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test as base } from "@playwright/test";

import { buildDatabaseApp } from "../../src/server/app.ts";

export async function startDatabaseServer(prefix = "database-e2e") {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const { app } = buildDatabaseApp({
    config: {
      host: "127.0.0.1",
      port: 0,
      dataDir: path.join(rootDir, ".data"),
      dbPath: path.join(rootDir, ".data", "database.sqlite"),
      filesDir: path.join(rootDir, ".data", "files"),
      jwtSecret: "database-test-secret",
    },
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 4510;
  const baseUrl = `http://127.0.0.1:${port}`;
  return {
    rootDir,
    baseUrl,
    async close() {
      await app.close();
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

type AppErrors = {
  consoleErrors: string[];
  pageErrors: string[];
  responseErrors: string[];
  requestFailures: string[];
};

function shouldIgnoreResponse(url: string, status: number): boolean {
  return status === 404 && url.endsWith("/favicon.ico");
}

export const test = base.extend<{
  appErrors: AppErrors;
}>({
  appErrors: async ({ page }, use) => {
    const appErrors: AppErrors = {
      consoleErrors: [],
      pageErrors: [],
      responseErrors: [],
      requestFailures: [],
    };

    page.on("console", (message) => {
      if (message.type() === "error") appErrors.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      appErrors.pageErrors.push(error.message);
    });
    page.on("response", (response) => {
      if (response.status() >= 400 && !shouldIgnoreResponse(response.url(), response.status())) {
        appErrors.responseErrors.push(`${response.status()} ${response.url()}`);
      }
    });
    page.on("requestfailed", (request) => {
      appErrors.requestFailures.push(`${request.failure()?.errorText || "unknown"} ${request.url()}`);
    });

    await use(appErrors);

    expect([
      ...appErrors.consoleErrors,
      ...appErrors.pageErrors,
      ...appErrors.responseErrors,
      ...appErrors.requestFailures,
    ]).toEqual([]);
  },
});

export { expect };

export async function saveBrowserScreenshot(page: import("@playwright/test").Page, name: string) {
  const targetDir = path.join(process.cwd(), "output", "playwright");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, name);
  await page.screenshot({ path: target, fullPage: true });
  return target;
}
