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
  await expect(page.getByText("Relationship notes and custom context files")).toHaveCount(1);
  await saveArtifactScreenshot(page, "settings-reset-modal-clean.png");
  await page.getByTestId("reset-workspace-confirm").click();

  await expect(page.getByTestId("onboarding-flow")).toBeVisible({ timeout: 20_000 });

  const notesResponse = await request.get("/api/notes");
  expect(notesResponse.ok()).toBeTruthy();
  const notesPayload = await notesResponse.json();
  expect(notesPayload.notes).toEqual([]);
});
