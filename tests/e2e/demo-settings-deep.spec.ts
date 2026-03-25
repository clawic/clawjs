import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("settings locale, profile, and workspace files persist hermetically", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/settings");
  await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("settings-locale-select").selectOption("es");
  await expect.poll(async () => {
    const response = await request.get("/api/config/local");
    const payload = await response.json();
    return payload.locale;
  }).toBe("es");

  await page.getByTestId("settings-tab-profile").click();
  await expect(page.getByTestId("profile-basics")).toBeVisible();
  await page.getByTestId("profile-name-input").fill("Taylor Stone");
  await page.getByTestId("profile-location-input").fill("Madrid");
  await page.getByTestId("profile-occupation-input").fill("Operations Lead");

  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return {
      displayName: payload.displayName,
      location: payload.profileBasics?.location,
      occupation: payload.profileBasics?.occupation,
    };
  }).toEqual({
    displayName: "Taylor Stone",
    location: "Madrid",
    occupation: "Operations Lead",
  });

  await page.getByTestId("settings-tab-advanced").click();
  await expect(page.getByTestId("workspace-files-nav")).toBeVisible();
  await page.getByTestId("workspace-file-tab-agents-md").click();
  await page.getByTestId("workspace-file-editor-agents-md-preview").click();
  await page.getByTestId("workspace-file-editor-agents-md").fill("## Agents\n\nDocument stable workflows and keep tests current.");
  await page.getByTestId("workspace-file-save-agents-md").click();

  await expect.poll(async () => {
    const response = await request.get("/api/config/workspace-files");
    const payload = await response.json();
    return payload.files.find((file: { fileName: string }) => file.fileName === "AGENTS.md")?.content;
  }).toContain("keep tests current");

  await page.reload();
  await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("settings-locale-select")).toHaveValue("es");
  await page.getByTestId("settings-tab-profile").click();
  await expect(page.getByTestId("profile-name-input")).toHaveValue("Taylor Stone");

  await saveArtifactScreenshot(page, "settings-deep-profile.png");
});

test("settings integration flows stay hermetic across whatsapp, telegram, email, and calendar", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/settings?tab=integrations");
  await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("whatsapp-integration-card")).toBeVisible();

  await page.getByTestId("whatsapp-integration-toggle").click();
  await expect.poll(async () => {
    const response = await request.get("/api/integrations/status");
    const payload = await response.json();
    return payload.whatsapp?.authenticated;
  }).toBe(true);

  await page.getByTestId("whatsapp-integration-card").click();
  await expect(page.getByTestId("whatsapp-config-modal")).toBeVisible();
  await expect(page.getByText("Nora")).toBeVisible();
  await page.getByTestId("whatsapp-auto-transcribe-toggle").click();
  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return payload.whatsappAutoTranscribe;
  }).toBe(true);
  await page.getByTestId("whatsapp-config-done").click();

  await page.getByTestId("whatsapp-integration-toggle").click();
  await expect(page.getByTestId("whatsapp-disconnect-modal")).toBeVisible();
  await page.getByTestId("whatsapp-disconnect-cancel").click();
  await expect(page.getByTestId("whatsapp-disconnect-modal")).toHaveCount(0);

  const telegramToggle = page.getByTestId("telegram-integration-toggle");
  await telegramToggle.click();
  await expect(page.getByTestId("telegram-disconnect-modal")).toBeVisible();
  await page.getByTestId("telegram-disconnect-delete").click();
  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return {
      enabled: payload.telegram?.enabled,
      botToken: payload.telegram?.botToken || "",
      botUsername: payload.telegram?.botUsername || "",
    };
  }).toEqual({
    enabled: false,
    botToken: "",
    botUsername: "",
  });
  await expect(page.getByTestId("telegram-disconnect-modal")).toHaveCount(0);
  await expect(telegramToggle).toHaveAttribute("aria-pressed", "false");

  await telegramToggle.click();
  await expect(page.getByTestId("telegram-config-modal")).toBeVisible();
  await page.getByTestId("telegram-token-input").fill("fixture-bot-token");
  await page.getByTestId("telegram-test-connection").click();
  await page.getByTestId("telegram-sync-toggle").click();
  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return {
      botToken: payload.telegram?.botToken,
      botUsername: payload.telegram?.botUsername,
      syncMessages: payload.telegram?.syncMessages,
    };
  }).toEqual({
    botToken: "",
    botUsername: "clawjs_demo_bot",
    syncMessages: true,
  });
  await page.getByTestId("telegram-config-done").click();
  await expect(page.getByTestId("telegram-config-modal")).toHaveCount(0);

  const slackToggle = page.getByTestId("slack-integration-toggle");
  await slackToggle.click();
  await expect(page.getByTestId("slack-disconnect-modal")).toBeVisible();
  await page.getByTestId("slack-disconnect-delete").click();
  await expect.poll(async () => {
    const response = await request.get("/api/integrations/status");
    const payload = await response.json();
    return {
      enabled: payload.slack?.enabled,
      botConnected: payload.slack?.botConnected,
    };
  }).toEqual({
    enabled: false,
    botConnected: false,
  });
  await expect(page.getByTestId("slack-disconnect-modal")).toHaveCount(0);
  await expect(slackToggle).toHaveAttribute("aria-pressed", "false");

  await slackToggle.click();
  await expect(page.getByTestId("slack-config-modal")).toBeVisible();
  await page.getByTestId("slack-token-input").fill("fixture-slack-token");
  await page.getByTestId("slack-test-connection").click();
  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return {
      botToken: payload.slack?.botToken,
      botUsername: payload.slack?.botUsername,
      teamName: payload.slack?.teamName,
    };
  }).toEqual({
    botToken: "",
    botUsername: "clawjs_demo_bot",
    teamName: "ClawJS Demo Team",
  });
  await expect.poll(async () => {
    const response = await request.get("/api/integrations/status");
    const payload = await response.json();
    return {
      enabled: payload.slack?.enabled,
      botConnected: payload.slack?.botConnected,
      botUsername: payload.slack?.botUsername,
      teamName: payload.slack?.teamName,
    };
  }).toEqual({
    enabled: true,
    botConnected: true,
    botUsername: "clawjs_demo_bot",
    teamName: "ClawJS Demo Team",
  });
  await expect(page.getByTestId("slack-bot-username")).toContainText("clawjs_demo_bot");
  await expect(page.getByTestId("slack-team-name")).toContainText("ClawJS Demo Team");
  await page.getByTestId("slack-config-done").click();
  await expect(page.getByTestId("slack-config-modal")).toHaveCount(0);

  await page.getByTestId("slack-integration-toggle").click();
  await expect(page.getByTestId("slack-disconnect-modal")).toBeVisible();
  await page.getByTestId("slack-disconnect-cancel").click();
  await expect(page.getByTestId("slack-disconnect-modal")).toHaveCount(0);

  await page.getByTestId("email-integration-card").click();
  await expect(page.getByTestId("email-config-modal")).toBeVisible();
  await expect(page.getByTestId("email-integration-account-inbox")).toBeVisible();
  await page.getByTestId("email-config-done").click();

  await page.getByTestId("calendar-integration-card").click();
  await expect(page.getByTestId("calendar-config-modal")).toBeVisible();
  await expect(page.getByTestId("calendar-integration-calendar-calendar-main")).toBeVisible();
  await page.getByTestId("calendar-config-done").click();

  await page.getByTestId("contacts-integration-toggle").click();
  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return payload.contactsEnabled;
  }).toBe(true);

  await page.getByTestId("contacts-integration-toggle").click();
  await expect.poll(async () => {
    const response = await request.get("/api/config");
    const payload = await response.json();
    return payload.contactsEnabled;
  }).toBe(false);

  await page.reload();
  await expect(page.getByTestId("settings-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("whatsapp-integration-card")).toBeVisible();
  await expect(page.getByTestId("telegram-integration-card")).toContainText("Telegram");
  await expect(page.getByTestId("slack-integration-card")).toContainText("Slack");

  await saveArtifactScreenshot(page, "settings-integrations-clean.png");
});
