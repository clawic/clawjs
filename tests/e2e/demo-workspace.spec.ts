import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("notes CRUD persists across reloads", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/notes");
  await expect(page.getByTestId("notes-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("notes-create-button").click();
  await expect(page.getByTestId("notes-title-input")).toBeVisible();

  await page.getByTestId("notes-title-input").fill("Release cutover checklist");
  await page.getByTestId("notes-folder-input").fill("Operations");
  await page.getByTestId("notes-tags-input").fill("release, smoke");
  await page.getByTestId("notes-editor-content").fill("Validate smoke suite before cutting the release.");
  await page.getByTestId("notes-save-button").click();

  await page.reload();
  await expect(page.getByTestId("notes-page")).toBeVisible({ timeout: 20_000 });

  const createdNote = page.getByTestId("note-list-item").filter({ hasText: "Release cutover checklist" });
  await expect(createdNote).toHaveCount(1);
  await createdNote.first().click();
  await expect(page.getByTestId("notes-editor-content")).toHaveValue(/Validate smoke suite/);

  await saveArtifactScreenshot(page, "notes-crud.png");

  await page.getByTestId("notes-delete-button").click();
  await expect(page.getByTestId("note-list-item").filter({ hasText: "Release cutover checklist" })).toHaveCount(0);
});

test("tasks and goals move across columns and persist", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/tasks");
  await expect(page.getByTestId("tasks-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("tasks-add-goal-button").click();
  await page.getByTestId("tasks-goal-title-input").fill("Plan the spring launch");
  await page.getByTestId("tasks-goal-add-confirm").click();
  await expect(page.getByText("Plan the spring launch")).toBeVisible();

  await page.getByTestId("tasks-column-add-backlog").click();
  await page.getByTestId("tasks-new-title-input").fill("Close remaining browser gaps");
  await page.getByTestId("tasks-new-priority-select").selectOption("urgent");
  await page.getByTestId("tasks-new-add-button").click();

  const taskCard = page.getByTestId("task-card").filter({ hasText: "Close remaining browser gaps" });
  await expect(taskCard).toHaveCount(1);
  await taskCard.first().click();

  await expect(page.getByTestId("task-detail-panel")).toBeVisible();
  await page.getByText("Click to add description...").click();
  await page.getByTestId("task-detail-description-input").fill("Track the remaining pages and move them to the blocking suite.");
  await page.getByTestId("task-detail-save-button").click();
  await page.getByTestId("task-status-done").click();
  await page.getByTestId("task-detail-goal-select").selectOption({ label: "Plan the spring launch" });
  await page.getByTestId("task-detail-label-input").fill("blocking");
  await page.getByTestId("task-detail-label-input").press("Enter");

  await page.reload();
  await expect(page.getByTestId("tasks-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("tasks-column-done").getByText("Close remaining browser gaps")).toBeVisible();

  await page.getByTestId("task-card").filter({ hasText: "Close remaining browser gaps" }).first().click();
  await page.getByTestId("task-detail-delete-button").click();
  await expect(page.getByTestId("task-card").filter({ hasText: "Close remaining browser gaps" })).toHaveCount(0);
});

test("memory entries can be added, filtered, and deleted", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/memory");
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("memory-add-button").click();
  await page.getByTestId("memory-title-input").fill("Regression playbook");
  await page.getByTestId("memory-content-input").fill("Document reproducible browser flows before every release.");
  await page.getByTestId("memory-source-input").fill("qa-docs");
  await page.getByTestId("memory-tags-input").fill("release, browser");
  await page.getByTestId("memory-save-button").click();

  await page.reload();
  await expect(page.getByTestId("memory-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("memory-search-input").fill("Regression playbook");
  const entry = page.getByTestId("memory-entry").filter({ hasText: "Regression playbook" });
  await expect(entry).toHaveCount(1);
  await page.getByTestId("memory-filter-knowledge").click();
  await entry.first().getByTestId("memory-entry-toggle").click();
  await entry.first().getByTestId("memory-delete-button").click();
  await expect(page.getByTestId("memory-entry").filter({ hasText: "Regression playbook" })).toHaveCount(0);
});

test("inbox supports unread filtering, replies, and deletion", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/inbox");
  await expect(page.getByTestId("inbox-page")).toBeVisible({ timeout: 20_000 });

  await page.getByTestId("inbox-unread-toggle").click();
  await expect(page.getByTestId("inbox-message-item")).toHaveCount(1);
  await page.getByTestId("inbox-message-item").first().click();

  await page.getByTestId("inbox-toggle-read-button").click();
  await expect(page.getByText("No unread messages")).toBeVisible();

  await page.getByTestId("inbox-unread-toggle").click();
  await expect(page.getByTestId("inbox-message-item").filter({ hasText: "Release checklist" })).toHaveCount(1);
  await expect(page.getByTestId("inbox-reply-input")).toBeVisible();
  await page.getByTestId("inbox-reply-input").fill("Reply from the hermetic inbox test.");
  await page.getByTestId("inbox-send-button").click();
  await expect(page.getByText("Reply sent")).toBeVisible();

  await page.getByTestId("inbox-delete-button").click();
  await page.reload();
  await expect(page.getByTestId("inbox-page")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("inbox-message-item").filter({ hasText: "Release checklist" })).toHaveCount(0);
});
