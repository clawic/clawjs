import { test, expect, resetDemoState } from "./fixtures";

test("demo API contracts stay deterministic in hermetic mode", async ({ request }) => {
  await resetDemoState(request, "seeded");

  const statusResponse = await request.get("/api/e2e/status");
  expect(statusResponse.ok()).toBeTruthy();
  const statusPayload = await statusResponse.json();
  expect(statusPayload.enabled).toBe(true);
  expect(statusPayload.fixtureMode).toBe("hermetic");
  expect(statusPayload.paths.stateDir).toContain("/.tmp/e2e/openclaw-state");
  expect(statusPayload.paths.workspaceDir).toContain("/.tmp/e2e/workspace");
  expect(statusPayload.paths.agentDir).toContain("/.tmp/e2e/agent");
  expect(statusPayload.paths.conversationsDir).toContain("/.tmp/e2e/sessions");
  expect(statusPayload.paths.configDir).toContain("/.tmp/e2e/workspace/config");
  expect(statusPayload.paths.localSettingsPath).toContain("/.tmp/e2e/workspace/settings.json");
  for (const value of Object.values(statusPayload.paths)) {
    expect(String(value)).not.toContain("clawjs-legacy");
    expect(String(value)).not.toContain("CLAWLEN");
  }

  const integrationsResponse = await request.get("/api/integrations/status");
  expect(integrationsResponse.ok()).toBeTruthy();
  const integrationsPayload = await integrationsResponse.json();
  expect(integrationsPayload.openClaw.ready).toBe(true);
  expect(integrationsPayload.whatsapp.authenticated).toBe(true);

  const createNote = await request.post("/api/notes", {
    data: { title: "API note", content: "Validate note CRUD." },
  });
  expect(createNote.ok()).toBeTruthy();
  const createdNote = await createNote.json();

  const updateNote = await request.put("/api/notes", {
    data: { id: createdNote.id, title: "API note updated", content: "Updated content." },
  });
  expect(updateNote.ok()).toBeTruthy();

  const deleteNote = await request.delete(`/api/notes?id=${createdNote.id}`);
  expect(deleteNote.ok()).toBeTruthy();

  const createTask = await request.post("/api/tasks", {
    data: { title: "API task", status: "backlog", priority: "medium" },
  });
  expect(createTask.ok()).toBeTruthy();
  const createdTask = await createTask.json();

  const updateTask = await request.put("/api/tasks", {
    data: { id: createdTask.id, status: "done" },
  });
  expect(updateTask.ok()).toBeTruthy();

  const searchSkills = await request.get("/api/skills/search?q=checks&limit=5");
  expect(searchSkills.ok()).toBeTruthy();
  const searchPayload = await searchSkills.json();
  expect(searchPayload.entries.length).toBeGreaterThan(0);

  const installSkill = await request.post("/api/skills/install", {
    data: { ref: "registry:checks" },
  });
  expect(installSkill.ok()).toBeTruthy();

  const removeSkill = await request.post("/api/skills/remove", {
    data: { id: "checks" },
  });
  expect(removeSkill.ok()).toBeTruthy();

  const createImage = await request.post("/api/images", {
    data: { prompt: "Generate a product concept image." },
  });
  expect(createImage.ok()).toBeTruthy();
  const imagePayload = await createImage.json();
  expect(imagePayload.image.output.exists).toBe(true);

  const imageFile = await request.get(`/api/images/${imagePayload.image.id}/file`);
  expect(imageFile.ok()).toBeTruthy();
  expect(imageFile.headers()["content-type"]).toContain("image/jpeg");

  const authSave = await request.post("/api/integrations/auth", {
    data: { action: "apikey", provider: "openai", key: "e2e-key" },
  });
  expect(authSave.ok()).toBeTruthy();

  const authRead = await request.get("/api/integrations/auth");
  expect(authRead.ok()).toBeTruthy();
  const authPayload = await authRead.json();
  expect(authPayload.defaultModel === null || typeof authPayload.defaultModel === "string").toBe(true);
  expect(authPayload.providers.openai.hasProfileApiKey).toBe(true);
});

test("extended demo API contracts cover mutable surfaces and integration fixtures", async ({ request }) => {
  await resetDemoState(request, "seeded");

  const workspaceFiles = await request.get("/api/config/workspace-files");
  expect(workspaceFiles.ok()).toBeTruthy();
  const workspacePayload = await workspaceFiles.json();
  expect(Array.isArray(workspacePayload.files)).toBeTruthy();

  const updateWorkspaceFile = await request.put("/api/config/workspace-files", {
    data: {
      fileName: "AGENTS.md",
      content: "## Agents\n\nKeep changes covered by browser tests.",
    },
  });
  expect(updateWorkspaceFile.ok()).toBeTruthy();

  const readWorkspaceFile = await request.get("/api/config/workspace-files");
  const readWorkspacePayload = await readWorkspaceFile.json();
  expect(readWorkspacePayload.files.find((file: { fileName: string }) => file.fileName === "AGENTS.md")?.content).toContain("browser tests");

  const localSettings = await request.put("/api/config/local", {
    data: { locale: "es", sidebarOpen: false },
  });
  expect(localSettings.ok()).toBeTruthy();

  const localSettingsRead = await request.get("/api/config/local");
  const localSettingsPayload = await localSettingsRead.json();
  expect(localSettingsPayload.locale).toBe("es");
  expect(localSettingsPayload.sidebarOpen).toBe(false);

  const profileConfig = await request.put("/api/config/profile", {
    data: {
      profileConfig: {
        displayName: "API Taylor",
        profileBasics: { age: "34", gender: "female", location: "Madrid", occupation: "Operations Lead" },
      },
      sections: [
        {
          id: "overview",
          content: "## API profile\n\nFocus on clear priorities and follow-through.",
        },
      ],
    },
  });
  expect(profileConfig.ok()).toBeTruthy();

  const profileRead = await request.get("/api/config/profile");
  const profilePayload = await profileRead.json();
  expect(profilePayload.sections.some((section: { content: string }) => section.content.includes("clear priorities"))).toBe(true);

  const createPersona = await request.post("/api/personas", {
    data: { name: "API Persona", avatar: "🙂", role: "Advisor", systemPrompt: "Keep responses concise and practical.", channels: ["Chat"] },
  });
  expect(createPersona.ok()).toBeTruthy();
  const createdPersona = await createPersona.json();

  const updatePersona = await request.put("/api/personas", {
    data: { id: createdPersona.id, role: "Release QA", channels: ["Chat", "Email"] },
  });
  expect(updatePersona.ok()).toBeTruthy();

  const deletePersona = await request.delete(`/api/personas?id=${createdPersona.id}`);
  expect(deletePersona.ok()).toBeTruthy();

  const createPlugin = await request.post("/api/plugins", {
    data: { name: "api-plugin", config: { mode: "dry-run" } },
  });
  expect(createPlugin.ok()).toBeTruthy();
  const createdPlugin = await createPlugin.json();

  const updatePlugin = await request.put("/api/plugins", {
    data: { id: createdPlugin.id, status: "active", config: { mode: "active" } },
  });
  expect(updatePlugin.ok()).toBeTruthy();

  const deletePlugin = await request.delete(`/api/plugins?id=${createdPlugin.id}`);
  expect(deletePlugin.ok()).toBeTruthy();

  const createRoutine = await request.post("/api/routines", {
    data: {
      label: "API Routine",
      description: "Exercise the routine contract.",
      schedule: "0 12 * * *",
      channel: "chat",
      prompt: "Summarize today's priorities.",
    },
  });
  expect(createRoutine.ok()).toBeTruthy();
  const createdRoutinePayload = await createRoutine.json();
  const createdRoutineId = createdRoutinePayload.routine.id;

  const runRoutine = await request.put("/api/routines", {
    data: { id: createdRoutineId, runNow: true },
  });
  expect(runRoutine.ok()).toBeTruthy();

  const deleteRoutine = await request.delete("/api/routines", {
    data: { id: createdRoutineId },
  });
  expect(deleteRoutine.ok()).toBeTruthy();

  const updateBudget = await request.put("/api/usage", {
    data: { monthlyLimit: 200, warningThreshold: 60, enabled: true },
  });
  expect(updateBudget.ok()).toBeTruthy();

  const usage = await request.get("/api/usage");
  const usagePayload = await usage.json();
  expect(usagePayload.budget.monthlyLimit).toBe(200);
  expect(usagePayload.budget.warningThreshold).toBe(60);

  const activityBefore = await request.get("/api/activity?limit=20");
  expect(activityBefore.ok()).toBeTruthy();
  const activityBeforePayload = await activityBefore.json();
  expect(activityBeforePayload.events.length).toBeGreaterThan(0);

  const createActivity = await request.post("/api/activity", {
    data: {
      event: "api_contract_verified",
      capability: "skills",
      detail: "Extended contract test ran successfully.",
      status: "success",
    },
  });
  expect(createActivity.ok()).toBeTruthy();

  const activityAfter = await request.get("/api/activity?capability=skills&status=success&limit=20");
  const activityAfterPayload = await activityAfter.json();
  expect(activityAfterPayload.events.some((event: { event: string }) => event.event === "api_contract_verified")).toBe(true);

  const eventsBefore = await request.get("/api/events?upcoming=false&limit=20");
  expect(eventsBefore.ok()).toBeTruthy();
  const eventsBeforePayload = await eventsBefore.json();
  expect(eventsBeforePayload.events.length).toBeGreaterThan(0);

  const createCalendarEvent = await request.post("/api/events", {
    data: {
      title: "API calendar event",
      description: "Validate the hermetic calendar route.",
      location: "Lab 4",
      startsAt: Date.now() + 86_400_000,
      endsAt: Date.now() + 90_000_000,
    },
  });
  expect(createCalendarEvent.ok()).toBeTruthy();
  const createdCalendarEvent = await createCalendarEvent.json();

  const updateCalendarEvent = await request.put("/api/events", {
    data: {
      id: createdCalendarEvent.id,
      location: "Lab 5",
    },
  });
  expect(updateCalendarEvent.ok()).toBeTruthy();
  const updatedCalendarEvent = await updateCalendarEvent.json();
  expect(updatedCalendarEvent.location).toBe("Lab 5");

  const deleteCalendarEvent = await request.delete(`/api/events?id=${createdCalendarEvent.id}`);
  expect(deleteCalendarEvent.ok()).toBeTruthy();

  const health = await request.get("/api/health");
  expect(health.ok()).toBeTruthy();
  const healthPayload = await health.json();
  expect(healthPayload.capabilities.length).toBe(4);

  const repair = await request.post("/api/health", {
    data: { capability: "workspace" },
  });
  expect(repair.ok()).toBeTruthy();
  const repairPayload = await repair.json();
  expect(repairPayload.repaired.status).toBe("ready");

  const ttsProviders = await request.get("/api/tts/providers");
  expect(ttsProviders.ok()).toBeTruthy();
  const ttsCatalog = await ttsProviders.json();
  expect(ttsCatalog.providers.length).toBeGreaterThan(0);

  const tts = await request.post("/api/tts", {
    data: { text: "Hermetic TTS response" },
  });
  expect(tts.ok()).toBeTruthy();
  expect(tts.headers()["content-type"]).toContain("audio/wav");

  const installIntegration = await request.post("/api/integrations/install", {
    data: { adapter: "openclaw" },
  });
  expect(installIntegration.ok()).toBeTruthy();

  const setupIntegration = await request.post("/api/integrations/setup");
  expect(setupIntegration.ok()).toBeTruthy();

  const telegramTest = await request.post("/api/integrations/telegram/test", {
    data: { botToken: "fixture-bot-token" },
  });
  expect(telegramTest.ok()).toBeTruthy();

  const telegramConnect = await request.post("/api/integrations/telegram/connect", {
    data: { botToken: "fixture-bot-token" },
  });
  expect(telegramConnect.ok()).toBeTruthy();
  const configAfterTelegram = await request.get("/api/config");
  expect(configAfterTelegram.ok()).toBeTruthy();
  const configAfterTelegramPayload = await configAfterTelegram.json();
  expect(configAfterTelegramPayload.telegram?.botToken ?? "").toBe("");
  expect(configAfterTelegramPayload.telegram?.botUsername).toBe("clawjs_demo_bot");

  const whatsappConnect = await request.post("/api/integrations/whatsapp/connect", {
    data: { enabled: true },
  });
  expect(whatsappConnect.ok()).toBeTruthy();

  const whatsappChats = await request.get("/api/integrations/whatsapp/chats");
  expect(whatsappChats.ok()).toBeTruthy();
  const whatsappChatsPayload = await whatsappChats.json();
  expect(whatsappChatsPayload.chats.length).toBeGreaterThan(0);

  const whatsappCleanup = await request.post("/api/integrations/whatsapp/cleanup", {
    data: { deleteData: true, uninstallCli: true },
  });
  expect(whatsappCleanup.ok()).toBeTruthy();

  const sessions = await request.get("/api/chat/sessions");
  expect(sessions.ok()).toBeTruthy();
  const sessionsPayload = await sessions.json();
  const sessionId = sessionsPayload.sessions[0]?.sessionId;
  expect(typeof sessionId).toBe("string");

  const generateTitle = await request.post(`/api/chat/sessions/${sessionId}/generate-title`);
  expect(generateTitle.ok()).toBeTruthy();
  const generateTitlePayload = await generateTitle.json();
  expect(typeof generateTitlePayload.title).toBe("string");
  expect(generateTitlePayload.title.length).toBeGreaterThan(0);
});
