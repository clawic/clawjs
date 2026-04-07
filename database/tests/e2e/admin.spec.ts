import path from "node:path";

import { expect, saveBrowserScreenshot, test } from "./helpers";

test("admin console covers namespace, collection, records, tokens, files, and realtime", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("login-submit").click();
  await expect(page.getByTestId("admin-console")).toBeVisible();

  await page.locator("#namespace-id").fill("sales");
  await page.locator("#namespace-display-name").fill("Sales");
  await page.getByTestId("namespace-form").getByRole("button", { name: "Create database" }).click();
  await expect(page.getByTestId("namespace-sales")).toBeVisible();
  await page.getByTestId("namespace-sales").click();
  await expect(page.locator("#active-namespace-name")).toHaveText("Sales");
  await expect(page.getByTestId("collection-people")).toBeVisible();
  await expect(page.getByTestId("collection-tasks")).toBeVisible();

  await page.locator("#collection-name").fill("leads");
  await page.locator("#collection-display-name").fill("Leads");
  await page.locator("#collection-fields").fill(JSON.stringify([
    { name: "name", type: "text", required: true },
    { name: "status", type: "select", options: ["draft", "active"] },
    { name: "website", type: "url" },
  ], null, 2));
  await page.getByTestId("collection-form").getByRole("button", { name: "Create collection" }).click();
  await expect(page.getByTestId("collection-leads")).toBeVisible();
  await page.getByTestId("collection-leads").click();
  await expect(page.locator("#schema-title")).toHaveText("Leads");

  await page.locator("#record-data").fill(JSON.stringify({
    name: "Acme Corp",
    status: "draft",
    website: "https://acme.test",
  }, null, 2));
  await page.getByTestId("record-form").getByRole("button", { name: "Save record" }).click();
  await expect(page.getByTestId("records-table")).toContainText("Acme Corp");
  await expect(page.getByTestId("activity-card")).toContainText("record.created");

  await page.locator("#token-label").fill("sales-bot");
  await page.locator("#token-collection").fill("leads");
  await page.getByTestId("token-form").getByRole("button", { name: "Issue token" }).click();
  await expect(page.locator("#token-output")).toContainText("\"token\"");
  await expect(page.getByTestId("token-card")).toContainText("sales-bot");

  await page.locator("#file-input").setInputFiles(path.join(process.cwd(), "tests", "e2e", "fixtures-upload.txt"));
  await page.getByTestId("file-form").getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByTestId("file-card")).toContainText("fixtures-upload.txt");

  await page.locator("#record-data").fill(JSON.stringify({
    name: "Beta Ltd",
    status: "active",
    website: "https://beta.test",
  }, null, 2));
  await page.getByTestId("record-form").getByRole("button", { name: "Save record" }).click();
  await expect(page.getByTestId("activity-card")).toContainText("Beta Ltd");

  await saveBrowserScreenshot(page, "database-admin-console.png");
});
