import { test, expect, resetDemoState, saveArtifactScreenshot } from "./fixtures";

test("chat streams hermetic responses and persists the session", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/");
  await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("chat-input").fill("Summarize the E2E hardening plan in one sentence.");
  await page.getByTestId("chat-input").press("Enter");

  await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
    "Good question. I checked the current state and everything looks healthy. If you want, I can break down any part in more detail.",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("session-item").first()).toBeVisible();

  const sessionsResponse = await request.get("/api/chat/sessions");
  expect(sessionsResponse.ok()).toBeTruthy();
  const sessionsPayload = await sessionsResponse.json();
  expect(Array.isArray(sessionsPayload.sessions)).toBeTruthy();
  expect(sessionsPayload.sessions[0]?.messageCount).toBeGreaterThanOrEqual(2);

  await saveArtifactScreenshot(page, "chat-hermetic.png");
});

test("chat debug mode surfaces latency phases for the current reply", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/?chatDebug=1");
  await expect(page.getByTestId("chat-composer")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("chat-input").fill("Why is this slow?");
  await page.getByTestId("chat-input").press("Enter");

  await expect(page.getByTestId("chat-message-assistant").last()).toContainText(
    "Good question. I checked the current state and everything looks healthy. If you want, I can break down any part in more detail.",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("chat-perf-trace")).toContainText("trace", { timeout: 20_000 });
  await expect(page.getByTestId("chat-perf-trace")).toContainText("gateway");
  await expect(page.getByTestId("chat-perf-trace")).toContainText("first chunk 400ms");
  await expect(page.getByTestId("chat-perf-trace")).toContainText("prompt 0ms");
  await expect(page.getByTestId("chat-perf-trace")).toContainText("stream");

  await saveArtifactScreenshot(page, "chat-hermetic-debug.png");
});
