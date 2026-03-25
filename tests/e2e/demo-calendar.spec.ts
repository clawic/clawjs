import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("calendar events can be created, inspected, and deleted hermetically", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/calendar");
  await expect(page.getByTestId("calendar-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("calendar-new-event").click();
  await expect(page.getByTestId("calendar-create-modal")).toBeVisible();
  await page.getByTestId("calendar-create-title").fill("Hermetic launch review");
  await page.getByTestId("calendar-create-location").fill("Release Room");
  await page.getByTestId("calendar-create-description").fill("Validate the full browser matrix before shipping.");
  await page.getByTestId("calendar-create-submit").click();

  await expect(page.getByTestId("calendar-toast")).toContainText("Event created");
  await page.getByTestId("calendar-view-day").click();
  await expect(page.getByText("Hermetic launch review").first()).toBeVisible();

  await page.getByText("Hermetic launch review").first().click();
  await expect(page.getByTestId("calendar-event-detail")).toBeVisible();
  await expect(page.getByTestId("calendar-event-detail")).toContainText("Release Room");

  await saveArtifactScreenshot(page, "calendar-day-event.png");

  await page.getByTestId("calendar-event-delete").click();
  await expect(page.getByTestId("calendar-toast")).toContainText("Event deleted");
  await page.reload();
  await expect(page.getByTestId("calendar-page")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("calendar-view-day").click();
  await expect(page.getByText("Hermetic launch review")).toHaveCount(0);
});
