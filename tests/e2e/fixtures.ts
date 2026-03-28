import fs from "fs";
import path from "path";

import { expect, test as base } from "@playwright/test";

type AppErrors = {
  consoleErrors: string[];
  pageErrors: string[];
  responseErrors: string[];
  requestFailures: string[];
};

function shouldIgnoreConsole(text: string): boolean {
  return text.includes("Download the React DevTools");
}

function shouldIgnoreResponse(url: string, status: number): boolean {
  return status === 404 && url.endsWith("/favicon.ico");
}

function shouldIgnoreRequestFailure(url: string, failureText: string, resourceType: string): boolean {
  if (resourceType === "document" && failureText.includes("ERR_ABORTED")) {
    return true;
  }
  if (url.startsWith("data:")) {
    return true;
  }
  return false;
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
      if (message.type() !== "error") return;
      const text = message.text();
      if (shouldIgnoreConsole(text)) return;
      appErrors.consoleErrors.push(text);
    });

    page.on("pageerror", (error) => {
      appErrors.pageErrors.push(error.message);
    });

    page.on("response", async (response) => {
      if (response.status() < 400) return;
      const url = response.url();
      if (shouldIgnoreResponse(url, response.status())) return;
      appErrors.responseErrors.push(`${response.status()} ${url}`);
    });

    page.on("requestfailed", (request) => {
      const failureText = request.failure()?.errorText || "unknown failure";
      if (shouldIgnoreRequestFailure(request.url(), failureText, request.resourceType())) return;
      appErrors.requestFailures.push(`${request.resourceType()} ${failureText} ${request.url()}`);
    });

    await use(appErrors);

    const messages = [
      ...appErrors.consoleErrors.map((entry) => `console: ${entry}`),
      ...appErrors.pageErrors.map((entry) => `pageerror: ${entry}`),
      ...appErrors.responseErrors.map((entry) => `response: ${entry}`),
      ...appErrors.requestFailures.map((entry) => `requestfailed: ${entry}`),
    ];

    expect(messages, messages.join("\n")).toEqual([]);
  },
});

export { expect };

export async function resetDemoState(
  request: import("@playwright/test").APIRequestContext,
  profile: "seeded" | "fresh" | "clean" = "seeded",
) {
  const response = await request.post("/api/e2e/reset", { data: { profile } });
  expect(response.ok()).toBeTruthy();
}

export async function saveArtifactScreenshot(
  page: import("@playwright/test").Page,
  fileName: string,
) {
  const outputDir = path.join(process.cwd(), "artifacts", "e2e");
  fs.mkdirSync(outputDir, { recursive: true });
  const targetPath = path.join(outputDir, fileName);
  await page.screenshot({ path: targetPath, fullPage: true });
  return targetPath;
}
