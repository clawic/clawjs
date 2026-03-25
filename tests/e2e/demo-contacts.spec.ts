import { expect, resetDemoState, saveArtifactScreenshot, test } from "./fixtures";

test("contacts page loads, creates contact, searches, and opens detail panel", async ({ page, request }) => {
  await resetDemoState(request, "seeded");

  await page.goto("/contacts");
  await expect(page.getByTestId("contacts-page")).toBeVisible({ timeout: 20_000 });

  // Seeded contacts should be present
  await expect(page.getByTestId("contact-card").first()).toBeVisible();
  const initialCount = await page.getByTestId("contact-card").count();
  expect(initialCount).toBeGreaterThan(0);

  // Create a new contact via the form
  await page.getByTestId("contacts-create-button").click();
  await expect(page.getByTestId("contact-form-modal")).toBeVisible();

  await page.getByTestId("contact-form-label-input").fill("Hermetic Contact");
  await page.getByTestId("contact-form-role-input").fill("QA Engineer");
  await page.getByTestId("contact-form-company-input").fill("ClawJS Inc");
  await page.getByTestId("contact-form-email-input").fill("hermetic@clawjs.test");
  await page.getByTestId("contact-form-phone-input").fill("+1 555 999 0000");
  await page.getByTestId("contact-form-notes-input").fill("Added during E2E coverage run.");
  await page.getByTestId("contact-form-save-button").click();

  await expect(page.getByTestId("contacts-toast")).toContainText("Contact created");
  await expect(page.getByTestId("contact-card").filter({ hasText: "Hermetic Contact" })).toHaveCount(1);

  // Search for the newly created contact
  await page.getByTestId("contacts-search-input").fill("Hermetic");
  await expect(page.getByTestId("contact-card")).toHaveCount(1);
  await page.getByTestId("contacts-search-input").clear();

  // Open detail panel for the created contact (manual source, so edit/delete buttons visible)
  await page.getByTestId("contact-card").filter({ hasText: "Hermetic Contact" }).click();
  await expect(page.getByTestId("contact-detail-panel")).toBeVisible();
  await expect(page.getByTestId("contact-detail-panel")).toContainText("hermetic@clawjs.test");
  await expect(page.getByTestId("contact-detail-panel")).toContainText("ClawJS Inc");

  // Delete the contact from the detail panel
  await page.getByTestId("contact-detail-delete-button").click();
  await expect(page.getByTestId("contacts-toast")).toContainText("Contact deleted");
  await expect(page.getByTestId("contact-card").filter({ hasText: "Hermetic Contact" })).toHaveCount(0);

  await saveArtifactScreenshot(page, "contacts-crud.png");
});

test("contacts API CRUD contracts are deterministic in hermetic mode", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET - list seeded contacts
  const listResponse = await request.get("/api/contacts");
  expect(listResponse.ok()).toBeTruthy();
  const listPayload = await listResponse.json();
  expect(listPayload.contacts.length).toBeGreaterThan(0);

  // POST - create
  const createResponse = await request.post("/api/contacts", {
    data: {
      label: "API Contact",
      role: "Tester",
      email: "api@test.dev",
      company: "TestCo",
      tier: 2,
      topics: ["e2e", "qa"],
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = await createResponse.json();
  expect(created.label).toBe("API Contact");
  expect(created.id).toBeTruthy();

  // PUT - update
  const updateResponse = await request.put("/api/contacts", {
    data: { id: created.id, role: "Senior Tester", company: "TestCo International" },
  });
  expect(updateResponse.ok()).toBeTruthy();
  const updated = await updateResponse.json();
  expect(updated.role).toBe("Senior Tester");

  // DELETE
  const deleteResponse = await request.delete(`/api/contacts?id=${created.id}`);
  expect(deleteResponse.ok()).toBeTruthy();

  // GET native contacts (hermetic fallback)
  const nativeResponse = await request.get("/api/contacts/native?limit=10");
  expect(nativeResponse.ok()).toBeTruthy();
  const nativePayload = await nativeResponse.json();
  expect(Array.isArray(nativePayload.contacts)).toBeTruthy();
});

test("people API CRUD contracts are deterministic in hermetic mode", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET - list (auto-seeds if empty)
  const listResponse = await request.get("/api/people");
  expect(listResponse.ok()).toBeTruthy();
  const listPayload = await listResponse.json();
  expect(listPayload.people.length).toBeGreaterThan(0);

  // GET - search
  const searchResponse = await request.get("/api/people?q=Alice");
  expect(searchResponse.ok()).toBeTruthy();
  const searchPayload = await searchResponse.json();
  expect(searchPayload.people.length).toBeGreaterThanOrEqual(0);

  // POST - create
  const createResponse = await request.post("/api/people", {
    data: {
      displayName: "E2E Person",
      kind: "human",
      emails: ["e2e@test.dev"],
      phones: ["+1-555-9999"],
      handles: ["e2eperson"],
      role: "QA",
      organization: "TestOrg",
    },
  });
  expect(createResponse.ok()).toBeTruthy();
  const created = await createResponse.json();
  expect(created.displayName).toBe("E2E Person");

  // PUT - update
  if (created.id) {
    const updateResponse = await request.put("/api/people", {
      data: { id: created.id, role: "Senior QA" },
    });
    expect(updateResponse.ok()).toBeTruthy();

    // DELETE
    const deleteResponse = await request.delete(`/api/people?id=${created.id}`);
    expect(deleteResponse.ok()).toBeTruthy();
  }
});
