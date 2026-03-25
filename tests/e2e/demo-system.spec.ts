import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("usage budget updates persist after reload", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/usage");
  await expect(page.getByTestId("usage-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("usage-edit-budget").click();
  await page.getByTestId("usage-limit-input").fill("321");
  await page.getByTestId("usage-threshold-input").fill("55");
  await page.getByTestId("usage-save-budget").click();

  await page.reload();
  await expect(page.getByTestId("usage-page")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("usage-edit-budget").click();
  await expect(page.getByTestId("usage-limit-input")).toHaveValue("321");
  await expect(page.getByTestId("usage-threshold-input")).toHaveValue("55");
});

test("activity log filters seeded and posted events deterministically", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  const createEvent = await request.post("/api/activity", {
    data: {
      event: "skills_registry_failure",
      capability: "skills",
      detail: "Registry lookup failed during a smoke run.",
      status: "failure",
    },
  });
  expect(createEvent.ok()).toBeTruthy();

  await page.goto("/activity");
  await expect(page.getByTestId("activity-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("skills_registry_failure")).toBeVisible();

  await page.getByTestId("activity-capability-trigger").click();
  await page.getByTestId("activity-capability-skills").click();
  await page.getByTestId("activity-status-trigger").click();
  await page.getByTestId("activity-status-failure").click();
  await expect(page.getByText("Registry lookup failed during a smoke run.")).toBeVisible();
});

test("health diagnostics expose repair flows in hermetic mode", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/health");
  await expect(page.getByTestId("health-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("health-capability-card")).toHaveCount(4);

  await page.getByTestId("health-repair-button").first().click();
  await expect(page.getByText("workspace repaired", { exact: true })).toBeVisible();
  await page.getByTestId("health-run-diagnostics").click();
  await expect(page.getByTestId("health-capability-card")).toHaveCount(4);
});

test("sidebar navigation, session switching, and persistence work across pages", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/notes");
  await expect(page.getByTestId("notes-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-state", "open");

  await page.getByTestId("sidebar-link-tasks").click();
  await expect(page.getByTestId("tasks-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("sidebar-link-usage").click();
  await expect(page.getByTestId("usage-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("session-item").first().click();
  await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("sidebar-toggle").click();
  await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-state", "closed");
  await page.reload();
  await expect(page.getByTestId("app-sidebar")).toHaveAttribute("data-state", "closed");

  await saveArtifactScreenshot(page, "sidebar-navigation.png");
});
