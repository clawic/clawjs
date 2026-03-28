import { test, expect, resetDemoState, saveArtifactScreenshot } from "./fixtures";

async function reachAiProviderStep(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
) {
  const flow = page.getByTestId("onboarding-flow");
  await expect(flow).toBeVisible({ timeout: 20_000 });

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "1");

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "2");

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await flow.getByText("ClawJS is an AI assistant", { exact: true }).click();
  await flow.getByText("I accept how my data is processed", { exact: true }).click();
  await flow.getByText("I accept the risks of the OpenClaw engine", { exact: true }).click();
  await flow.getByRole("button", { name: "Continue" }).last().click();

  await expect(flow).toHaveAttribute("data-step", "3");
  await page.getByPlaceholder("Your name").fill("Taylor");
  await flow.getByRole("button", { name: "Continue" }).last().click();

  await expect(flow).toHaveAttribute("data-step", "4");
  await page.getByRole("button", { name: "Configure" }).click();

  await expect.poll(async () => {
    const response = await request.get("/api/integrations/status");
    const payload = await response.json();
    return {
      agentConfigured: payload.openClaw?.agentConfigured,
      needsSetup: payload.openClaw?.needsSetup,
      needsAuth: payload.openClaw?.needsAuth,
    };
  }).toEqual({
    agentConfigured: true,
    needsSetup: false,
    needsAuth: true,
  });

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "5");

  return flow;
}

test("fresh workspace boots into onboarding", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

  await page.goto("/");
  await expect(page.getByTestId("onboarding-flow")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("onboarding-flow")).toHaveAttribute("data-step", "0");

  await page.getByTestId("onboarding-flow").getByRole("button").last().click();
  await expect(page.getByTestId("onboarding-flow")).toHaveAttribute("data-step", "1");

  await saveArtifactScreenshot(page, "onboarding-fresh.png");
});

test("clearing onboarding state returns to onboarding after reload", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/");
  await expect(page.getByTestId("onboarding-flow")).toHaveCount(0);

  const response = await request.put("/api/config/local", {
    data: { onboardingCompleted: false },
  });
  expect(response.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByTestId("onboarding-flow")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("onboarding-flow")).toHaveAttribute("data-step", "0");

  await saveArtifactScreenshot(page, "onboarding-after-local-reset.png");
});

test("onboarding openclaw configure completes the engine step before auth", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

  await page.goto("/");
  const flow = page.getByTestId("onboarding-flow");
  await expect(flow).toBeVisible({ timeout: 20_000 });

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "1");

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "2");

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await flow.getByText("ClawJS is an AI assistant", { exact: true }).click();
  await flow.getByText("I accept how my data is processed", { exact: true }).click();
  await flow.getByText("I accept the risks of the OpenClaw engine", { exact: true }).click();
  await flow.getByRole("button", { name: "Continue" }).last().click();

  await expect(flow).toHaveAttribute("data-step", "3");
  await page.getByPlaceholder("Your name").fill("Taylor");
  await flow.getByRole("button", { name: "Continue" }).last().click();

  await expect(flow).toHaveAttribute("data-step", "4");
  await page.getByRole("button", { name: "Configure" }).click();

  await expect.poll(async () => {
    const response = await request.get("/api/integrations/status");
    const payload = await response.json();
    return {
      agentConfigured: payload.openClaw?.agentConfigured,
      needsSetup: payload.openClaw?.needsSetup,
      needsAuth: payload.openClaw?.needsAuth,
    };
  }).toEqual({
    agentConfigured: true,
    needsSetup: false,
    needsAuth: true,
  });

  await expect(flow.locator("svg.text-emerald-500")).toHaveCount(1);
  await saveArtifactScreenshot(page, "onboarding-openclaw-configured.png");
});

test("onboarding openclaw install completes the engine step from a clean state", async ({ page, request }) => {
  await resetDemoState(request, "clean");

  await page.goto("/");
  const flow = page.getByTestId("onboarding-flow");
  await expect(flow).toBeVisible({ timeout: 20_000 });

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "1");

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await expect(flow).toHaveAttribute("data-step", "2");

  await flow.getByRole("button", { name: "Continue" }).last().click();
  await flow.getByText("ClawJS is an AI assistant", { exact: true }).click();
  await flow.getByText("I accept how my data is processed", { exact: true }).click();
  await flow.getByText("I accept the risks of the OpenClaw engine", { exact: true }).click();
  await flow.getByRole("button", { name: "Continue" }).last().click();

  await expect(flow).toHaveAttribute("data-step", "3");
  await page.getByPlaceholder("Your name").fill("Taylor");
  await flow.getByRole("button", { name: "Continue" }).last().click();

  await expect(flow).toHaveAttribute("data-step", "4");
  await page.getByRole("button", { name: "Install" }).click();

  await expect.poll(async () => {
    const response = await request.get("/api/integrations/status");
    const payload = await response.json();
    return {
      installed: payload.openClaw?.installed,
      agentConfigured: payload.openClaw?.agentConfigured,
      needsSetup: payload.openClaw?.needsSetup,
      needsAuth: payload.openClaw?.needsAuth,
    };
  }).toEqual({
    installed: true,
    agentConfigured: true,
    needsSetup: false,
    needsAuth: true,
  });

  await expect(flow.locator("svg.text-emerald-500")).toHaveCount(1);
  await saveArtifactScreenshot(page, "onboarding-openclaw-installed.png");
});

test("onboarding ai auth surfaces launch errors instead of polling indefinitely", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

  await page.route("**/api/integrations/auth", async (route) => {
    const requestMethod = route.request().method();
    if (requestMethod !== "POST") {
      await route.continue();
      return;
    }

    const body = route.request().postDataJSON?.();
    if (body?.action === "oauth") {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          ok: false,
          error: "Could not start the OpenClaw authentication command.",
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/");
  const flow = await reachAiProviderStep(page, request);

  const toggle = page.getByTestId("onboarding-oauth-toggle-openai-codex");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();

  await expect(page.getByTestId("onboarding-auth-launch-error")).toContainText("Could not start the OpenClaw authentication command.");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await saveArtifactScreenshot(page, "onboarding-oauth-launch-error.png");
});

test("onboarding chatgpt subscription auth completes and marks the provider as connected", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

  let oauthCompleted = false;
  await page.route("**/api/integrations/auth", async (route) => {
    const requestMethod = route.request().method();
    if (requestMethod === "POST") {
      const body = route.request().postDataJSON?.();
      if (body?.action === "oauth" && body?.provider === "openai-codex") {
        oauthCompleted = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, message: "Sign-in started." }),
        });
        return;
      }
      await route.continue();
      return;
    }

    if (requestMethod === "GET" && oauthCompleted) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cliAvailable: true,
          defaultModel: "openai/gpt-5.4",
          providers: {
            "openai-codex": {
              provider: "openai-codex",
              hasAuth: true,
              hasSubscription: true,
              hasApiKey: false,
              hasProfileApiKey: false,
              hasEnvKey: false,
              authType: "oauth",
              enabledForAgent: true,
            },
            openai: {
              provider: "openai",
              hasAuth: true,
              hasSubscription: true,
              hasApiKey: false,
              hasProfileApiKey: false,
              hasEnvKey: false,
              authType: "oauth",
            },
          },
        }),
      });
      return;
    }

    await route.continue();
  });

  await page.goto("/");
  await reachAiProviderStep(page, request);

  const toggle = page.getByTestId("onboarding-oauth-toggle-openai-codex");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();

  await expect.poll(async () => {
    const payload = await page.evaluate(async () => {
      const response = await fetch("/api/integrations/auth", { cache: "no-store" });
      return response.json();
    });
    return {
      hasSubscription: payload.providers?.openai?.hasSubscription ?? false,
      defaultModel: payload.defaultModel ?? null,
    };
  }).toEqual({
    hasSubscription: true,
    defaultModel: "openai/gpt-5.4",
  });

  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("onboarding-oauth-status-openai-codex")).toContainText("Connected");
  await saveArtifactScreenshot(page, "onboarding-chatgpt-subscription-alias-connected.png");
});

test("onboarding chatgpt subscription shows a connected badge when auth already exists", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

  await page.route("**/api/integrations/auth", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

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
            enabledForAgent: true,
          },
        },
      }),
    });
  });

  await page.goto("/");
  const flow = await reachAiProviderStep(page, request);

  const toggle = page.getByTestId("onboarding-oauth-toggle-openai-codex");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("onboarding-oauth-status-openai-codex")).toContainText("Connected");
  await saveArtifactScreenshot(page, "onboarding-chatgpt-subscription-preconnected.png");
});

test("onboarding chatgpt subscription stays off until the agent explicitly enables reusable auth", async ({ page, request }) => {
  await resetDemoState(request, "fresh");

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

  await page.goto("/");
  await reachAiProviderStep(page, request);

  const toggle = page.getByTestId("onboarding-oauth-toggle-openai-codex");
  await expect(toggle).toHaveAttribute("aria-pressed", "false");

  await toggle.click();

  await expect(page.getByText("Checking whether this machine already has a sign-in for this provider.")).toBeVisible();
  await expect(page.getByText("Complete the sign-in in the browser window that just opened.")).toHaveCount(0);
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("onboarding-oauth-status-openai-codex")).toContainText("Connected");
  await saveArtifactScreenshot(page, "onboarding-chatgpt-subscription-explicit-enable.png");
});
