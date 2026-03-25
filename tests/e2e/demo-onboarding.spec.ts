import { test, expect, resetDemoState, saveArtifactScreenshot } from "./fixtures";

test("fresh workspace boots into onboarding", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

  await page.goto("/");
  await expect(page.getByTestId("onboarding-flow")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("onboarding-flow")).toHaveAttribute("data-step", "0");

  await page.getByTestId("onboarding-flow").getByRole("button").last().click();
  await expect(page.getByTestId("onboarding-flow")).toHaveAttribute("data-step", "1");

  await saveArtifactScreenshot(page, "onboarding-fresh.png");
});
