import { test, expect, resetDemoState, saveArtifactScreenshot } from "./fixtures";

test("settings reset clears the hermetic workspace and returns to onboarding", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  const createNote = await request.post("/api/notes", {
    data: { title: "Reset me", content: "This note should disappear after reset." },
  });
  expect(createNote.ok()).toBeTruthy();

  await page.goto("/settings");
  await expect(page.getByTestId("reset-workspace-button")).toBeVisible({ timeout: 20_000 });
  await saveArtifactScreenshot(page, "settings-general.png");
  await page.getByTestId("reset-workspace-button").click();
  await expect(page.getByTestId("reset-workspace-confirm")).toBeVisible();
  await page.getByText("Select all").click();
  await page.getByText("Uninstall OpenClaw", { exact: true }).click();
  await page.getByTestId("reset-workspace-confirm").click();

  await expect(page.getByTestId("onboarding-flow")).toBeVisible({ timeout: 20_000 });
  const statusResponse = await request.get("/api/integrations/status");
  expect(statusResponse.ok()).toBeTruthy();
  const statusPayload = await statusResponse.json();
  expect(statusPayload.openClaw?.installed).toBeFalsy();
  expect(statusPayload.openClaw?.cliAvailable).toBeFalsy();

  const notesResponse = await request.get("/api/notes");
  expect(notesResponse.ok()).toBeTruthy();
  const notesPayload = await notesResponse.json();
  expect(notesPayload.notes).toEqual([]);
});

test("settings openclaw tab shows authentication as ready when the runtime is connected", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.route("**/api/integrations/status", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    await route.fulfill({
      response,
      contentType: "application/json",
      body: JSON.stringify({
        ...payload,
        openClaw: {
          ...payload.openClaw,
          authConfigured: true,
          ready: true,
          needsAuth: false,
          defaultModel: "openai-codex/gpt-5.4",
        },
      }),
    });
  });

  await page.goto("/settings");
  await expect(page.getByTestId("settings-tab-openclaw")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("settings-tab-openclaw").click();

  await expect(page.getByTestId("openclaw-status-authentication")).toHaveAttribute("data-state", "ready");
  await saveArtifactScreenshot(page, "settings-openclaw-auth-ready.png");
});

test("settings ai tab only marks chatgpt connected after the agent enables reusable codex auth", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  let enabledForAgent = false;
  await page.route("**/api/integrations/auth", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON?.();
      if (body?.action === "oauth" && body?.provider === "openai-codex") {
        enabledForAgent = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            connected: true,
            reusedExistingAuth: true,
            model: "openai-codex/gpt-5.4",
          }),
        });
        return;
      }
      await route.continue();
      return;
    }

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cliAvailable: true,
          defaultModel: "openai-codex/gpt-5.4",
          providers: {
            "openai-codex": {
              provider: "openai-codex",
              hasAuth: true,
              hasSubscription: true,
              hasApiKey: false,
              hasProfileApiKey: false,
              hasEnvKey: false,
              authType: "oauth",
              enabledForAgent,
            },
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/settings");
  await page.getByTestId("settings-tab-ai").click();

  const toggle = page.getByTestId("ai-provider-openai-codex-toggle");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();
  await page.getByRole("button", { name: "Connect account" }).click();

  await expect(page.getByText("Checking whether this machine already has a sign-in for this provider.")).toBeVisible();
  await expect(page.getByText("Complete the sign-in in the browser window that just opened.")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ai-provider-openai-codex-card")).toContainText("Default");
  await saveArtifactScreenshot(page, "settings-ai-chatgpt-explicit-enable.png");
});
