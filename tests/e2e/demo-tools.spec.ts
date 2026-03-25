import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("images generation and deletion stay hermetic", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/images");
  await expect(page.getByTestId("images-page")).toBeVisible({ timeout: 20_000 });

  const initialCards = await page.getByTestId("image-card").count();
  await page.getByTestId("images-prompt").fill("Generate a hermetic launch diagram.");
  await page.getByTestId("images-generate-button").click();
  await expect(page.getByTestId("image-card")).toHaveCount(initialCards + 1);

  const newestCard = page.getByTestId("image-card").first();
  await newestCard.hover();
  await newestCard.getByTestId("image-delete-trigger").click();
  await page.getByTestId("images-delete-confirm").click();
  await expect(page.getByTestId("image-card")).toHaveCount(initialCards);
});

test("skills can be searched, installed, and removed", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/skills");
  await expect(page.getByTestId("skills-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("skills-search-input").fill("checks");
  await expect(page.getByTestId("skills-search-input")).toHaveValue("checks");

  await page.getByRole("button", { name: "Install from reference" }).click();
  await page.getByTestId("skills-install-ref-input").fill("registry:release-notes");
  await page.getByTestId("skills-install-ref-button").click();
  await expect(page.getByTestId("installed-skill-item").filter({ hasText: "Release Notes" })).toHaveCount(1);

  await page.reload();
  await expect(page.getByTestId("skills-page")).toBeVisible({ timeout: 20_000 });
  const installedReleaseNotes = page.getByTestId("installed-skill-item").filter({ hasText: "Release Notes" });
  await expect(installedReleaseNotes).toHaveCount(1);
  await installedReleaseNotes.getByTestId("installed-skill-remove-button").click();
  await expect(page.getByTestId("installed-skill-item").filter({ hasText: "Release Notes" })).toHaveCount(0);
});

test("personas can be created, edited, and deleted with confirmation", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/personas");
  await expect(page.getByTestId("personas-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("personas-new-button").click();
  await expect(page.getByTestId("persona-name-input")).toBeVisible();
  await page.getByTestId("persona-name-input").fill("Release Captain");
  await page.getByTestId("persona-role-input").fill("QA Lead");
  await page.getByTestId("persona-system-prompt-input").fill("Keep responses concise and action-oriented.");
  await page.getByTestId("persona-channel-email").click();
  await page.getByTestId("persona-save-button").click();

  await page.reload();
  await expect(page.getByTestId("personas-page")).toBeVisible({ timeout: 20_000 });
  const newPersona = page.getByTestId("persona-card").filter({ hasText: "Release Captain" });
  await expect(newPersona).toHaveCount(1);
  await newPersona.getByTestId("persona-expand-button").click();
  await newPersona.getByTestId("persona-delete-button").click();
  await newPersona.getByTestId("persona-delete-cancel").click();
  await newPersona.getByTestId("persona-delete-button").click();
  await newPersona.getByTestId("persona-delete-confirm").click();
  await expect(page.getByTestId("persona-card").filter({ hasText: "Release Captain" })).toHaveCount(0);
});

test("plugins install, persist config, and uninstall cleanly", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/plugins");
  await expect(page.getByTestId("plugins-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("plugins-install-input").fill("fixture-plugin");
  await page.getByTestId("plugins-install-button").click();

  const plugin = page.getByTestId("plugin-item").filter({ hasText: "fixture-plugin" });
  await expect(plugin).toHaveCount(1);
  await plugin.getByTestId("plugin-expand-button").click();
  await plugin.getByTestId("plugin-config-input").fill("{\n  \"mode\": \"dry-run\"\n}");
  await plugin.getByTestId("plugin-save-config-button").click();
  await plugin.getByTestId("plugin-toggle-button").click();

  await page.reload();
  await expect(page.getByTestId("plugins-page")).toBeVisible({ timeout: 20_000 });
  const persistedPlugin = page.getByTestId("plugin-item").filter({ hasText: "fixture-plugin" });
  await persistedPlugin.getByTestId("plugin-expand-button").click();
  await expect(persistedPlugin.getByTestId("plugin-config-input")).toHaveValue(/dry-run/);
  await persistedPlugin.getByTestId("plugin-uninstall-button").click();
  await expect(page.getByTestId("plugin-item").filter({ hasText: "fixture-plugin" })).toHaveCount(0);
});

test("routines can be created, executed, toggled, and removed", async ({ page, request }) => {
  await resetDemoState(request, "seeded");
  const routineLabel = "Release checklist";

  await page.goto("/routines");
  await expect(page.getByTestId("routines-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("routines-new-button").click();
  await page.getByTestId("routines-label-input").fill(routineLabel);
  await page.getByTestId("routines-description-input").fill("Run a brief daily summary.");
  await page.getByTestId("routines-schedule-input").fill("0 18 * * *");
  await page.getByTestId("routines-prompt-input").fill("Summarize today's priorities.");
  await page.getByTestId("routines-create-button").click();

  await page.reload();
  await expect(page.getByTestId("routines-page")).toBeVisible({ timeout: 20_000 });
  const routine = page.getByTestId("routine-item").filter({ hasText: routineLabel });
  await expect(routine).toHaveCount(1);
  await routine.getByTestId("routine-toggle-button").click();
  await routine.getByTestId("routine-toggle-button").click();
  await routine.getByTestId("routine-run-button").click();
  await expect(page.getByText(routineLabel)).toBeVisible();

  await saveArtifactScreenshot(page, "routines-hermetic.png");

  await routine.getByTestId("routine-delete-button").click();
  await expect(page.getByTestId("routine-item").filter({ hasText: routineLabel })).toHaveCount(0);
});
