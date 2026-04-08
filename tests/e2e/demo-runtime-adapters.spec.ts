import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("runtime adapters expose capability-driven details without OpenClaw regressions", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/settings?tab=openclaw");
  await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("adapter-openclaw-card")).toBeVisible();
  await expect(page.getByTestId("adapter-hermes-card")).toBeVisible();
  await expect(page.getByTestId("adapter-nanobot-card")).toBeVisible();

  await page.getByTestId("adapter-hermes-card").click();
  await expect(page.getByTestId("adapter-hermes-capability-conversation_gateway")).toBeVisible();
  await expect(page.getByTestId("adapter-hermes-capability-sandbox")).toHaveAttribute("data-state", "degraded");
  await expect(page.getByTestId("adapter-hermes-conversation-transport")).toContainText("hybrid -> cli");
  await expect(page.getByTestId("adapter-hermes-limitations")).toContainText("Isolation depends on the selected Hermes terminal backend.");

  await page.getByTestId("adapter-nanobot-card").click();
  await expect(page.getByTestId("adapter-nanobot-capability-conversation_gateway")).toBeVisible();
  await expect(page.getByTestId("adapter-nanobot-capability-sandbox")).toHaveAttribute("data-state", "degraded");
  await expect(page.getByTestId("adapter-nanobot-conversation-transport")).toContainText("hybrid -> cli");
  await expect(page.getByTestId("adapter-nanobot-limitations")).toContainText("Bubblewrap sandboxing is only available on Linux with bwrap installed.");
  await saveArtifactScreenshot(page, "runtime-adapters-settings.png");

  await page.getByTestId("adapter-openclaw-card").click();
  await expect(page.getByTestId("openclaw-status-cli")).toBeVisible();
});
