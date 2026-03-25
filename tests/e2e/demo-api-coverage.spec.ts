import { test, expect, resetDemoState } from "./fixtures";

test("GET list endpoints return seeded data for all collections", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET /api/notes – list all seeded notes
  const notes = await request.get("/api/notes");
  expect(notes.ok()).toBeTruthy();
  const notesPayload = await notes.json();
  expect(notesPayload.notes.length).toBeGreaterThan(0);

  // GET /api/tasks – list all seeded tasks
  const tasks = await request.get("/api/tasks");
  expect(tasks.ok()).toBeTruthy();
  const tasksPayload = await tasks.json();
  expect(tasksPayload.tasks.length).toBeGreaterThan(0);

  // GET /api/personas – list seeded personas
  const personas = await request.get("/api/personas");
  expect(personas.ok()).toBeTruthy();
  const personasPayload = await personas.json();
  expect(personasPayload.personas.length).toBeGreaterThan(0);

  // GET /api/plugins – list seeded plugins
  const plugins = await request.get("/api/plugins");
  expect(plugins.ok()).toBeTruthy();
  const pluginsPayload = await plugins.json();
  expect(pluginsPayload.plugins.length).toBeGreaterThan(0);

  // GET /api/routines – list seeded routines
  const routines = await request.get("/api/routines");
  expect(routines.ok()).toBeTruthy();
  const routinesPayload = await routines.json();
  expect(routinesPayload.routines.length).toBeGreaterThan(0);

  // GET /api/memory – list seeded memory entries
  const memory = await request.get("/api/memory");
  expect(memory.ok()).toBeTruthy();
  const memoryPayload = await memory.json();
  expect(memoryPayload.entries.length).toBeGreaterThan(0);

  // GET /api/inbox – list seeded inbox messages
  const inbox = await request.get("/api/inbox");
  expect(inbox.ok()).toBeTruthy();
  const inboxPayload = await inbox.json();
  expect(inboxPayload.messages.length).toBeGreaterThan(0);
});

test("images read endpoints return seeded data and support CRUD", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET /api/images – list
  const images = await request.get("/api/images");
  expect(images.ok()).toBeTruthy();
  const imagesPayload = await images.json();
  expect(imagesPayload.images.length).toBeGreaterThan(0);

  const firstImage = imagesPayload.images[0];

  // GET /api/images/[id] – detail
  const imageDetail = await request.get(`/api/images/${firstImage.id}`);
  expect(imageDetail.ok()).toBeTruthy();
  const imageDetailPayload = await imageDetail.json();
  expect(imageDetailPayload.image.id).toBe(firstImage.id);

  // GET /api/images/backends
  const backends = await request.get("/api/images/backends");
  expect(backends.ok()).toBeTruthy();
  const backendsPayload = await backends.json();
  expect(backendsPayload.backends.length).toBeGreaterThan(0);
  expect(backendsPayload.backends[0].available).toBe(true);

  // POST + DELETE – create and delete an image
  const createImage = await request.post("/api/images", {
    data: { prompt: "Coverage test image" },
  });
  expect(createImage.ok()).toBeTruthy();
  const createdImage = await createImage.json();

  const deleteImage = await request.delete(`/api/images/${createdImage.image.id}`);
  expect(deleteImage.ok()).toBeTruthy();
});

test("skills list and sources endpoints return seeded data", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET /api/skills/list
  const skills = await request.get("/api/skills/list");
  expect(skills.ok()).toBeTruthy();
  const skillsPayload = await skills.json();
  expect(skillsPayload.skills.length).toBeGreaterThan(0);

  // GET /api/skills/sources
  const sources = await request.get("/api/skills/sources");
  expect(sources.ok()).toBeTruthy();
  const sourcesPayload = await sources.json();
  expect(sourcesPayload.sources.length).toBeGreaterThan(0);
});

test("memory API CRUD operates correctly in hermetic mode", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // POST – create memory entry
  const createMemory = await request.post("/api/memory", {
    data: {
      title: "API Memory Entry",
      content: "Created during E2E coverage.",
      source: "e2e-test",
      tags: ["coverage", "api"],
    },
  });
  expect(createMemory.ok()).toBeTruthy();
  const created = await createMemory.json();
  expect(created.id || created.entry?.id).toBeTruthy();
  const memoryId = created.id ?? created.entry?.id;

  // PUT – update memory entry
  const updateMemory = await request.put("/api/memory", {
    data: { id: memoryId, content: "Updated E2E coverage content." },
  });
  expect(updateMemory.ok()).toBeTruthy();

  // DELETE – remove memory entry
  const deleteMemory = await request.delete(`/api/memory?id=${memoryId}`);
  expect(deleteMemory.ok()).toBeTruthy();
});

test("inbox API supports read toggle and deletion at API level", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET – list inbox
  const inbox = await request.get("/api/inbox");
  expect(inbox.ok()).toBeTruthy();
  const inboxPayload = await inbox.json();
  const firstMessage = inboxPayload.messages[0];
  expect(firstMessage).toBeTruthy();

  // PUT – toggle read status
  const toggleRead = await request.put("/api/inbox", {
    data: { id: firstMessage.id, read: !firstMessage.read },
  });
  expect(toggleRead.ok()).toBeTruthy();

  // DELETE – remove message
  const deleteMsg = await request.delete(`/api/inbox?id=${firstMessage.id}`);
  expect(deleteMsg.ok()).toBeTruthy();

  // Verify it was removed
  const inboxAfter = await request.get("/api/inbox");
  const afterPayload = await inboxAfter.json();
  expect(afterPayload.messages.find((m: { id: string }) => m.id === firstMessage.id)).toBeFalsy();
});

test("tasks DELETE works at API level", async ({ request }) => {
  await resetDemoState(request, "seeded");

  const createTask = await request.post("/api/tasks", {
    data: { title: "Deletable task", status: "backlog", priority: "low" },
  });
  expect(createTask.ok()).toBeTruthy();
  const created = await createTask.json();

  const deleteTask = await request.delete(`/api/tasks?id=${created.id}`);
  expect(deleteTask.ok()).toBeTruthy();
});

test("chat session detail, patch, search, and feedback work hermetically", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET /api/chat – bootstrap config
  const chatConfig = await request.get("/api/chat");
  // Chat GET may return 200 or redirect; just verify it doesn't error
  expect(chatConfig.status()).toBeLessThan(500);

  // GET /api/chat/sessions – list
  const sessions = await request.get("/api/chat/sessions");
  expect(sessions.ok()).toBeTruthy();
  const sessionsPayload = await sessions.json();
  expect(sessionsPayload.sessions.length).toBeGreaterThan(0);

  const sessionId = sessionsPayload.sessions[0].sessionId;

  // GET /api/chat/sessions/[id] – detail
  const sessionDetail = await request.get(`/api/chat/sessions/${sessionId}`);
  expect(sessionDetail.ok()).toBeTruthy();
  const sessionDetailPayload = await sessionDetail.json();
  expect(sessionDetailPayload.session).toBeTruthy();

  // PATCH /api/chat/sessions/[id] – update title
  const patchSession = await request.patch(`/api/chat/sessions/${sessionId}`, {
    data: { title: "E2E Renamed Session" },
  });
  expect(patchSession.ok()).toBeTruthy();
  const patchPayload = await patchSession.json();
  expect(patchPayload.title).toBe("E2E Renamed Session");

  // GET /api/chat/sessions/search
  const searchSessions = await request.get("/api/chat/sessions/search?q=E2E&limit=5");
  expect(searchSessions.ok()).toBeTruthy();
  const searchPayload = await searchSessions.json();
  expect(Array.isArray(searchPayload.results)).toBeTruthy();

  // POST /api/chat/feedback
  const feedback = await request.post("/api/chat/feedback", {
    data: { sessionId, messageId: "msg-1", rating: "positive", comment: "E2E feedback" },
  });
  expect(feedback.ok()).toBeTruthy();
});

test("integration enable, Slack test/connect, and status endpoints work hermetically", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // POST /api/integrations/enable – calendar
  const enableCalendar = await request.post("/api/integrations/enable", {
    data: { integration: "calendar", enabled: true },
  });
  expect(enableCalendar.ok()).toBeTruthy();
  const calPayload = await enableCalendar.json();
  expect(calPayload.ok).toBe(true);

  // POST /api/integrations/enable – email
  const enableEmail = await request.post("/api/integrations/enable", {
    data: { integration: "email", enabled: true },
  });
  expect(enableEmail.ok()).toBeTruthy();

  // Disable email
  const disableEmail = await request.post("/api/integrations/enable", {
    data: { integration: "email", enabled: false },
  });
  expect(disableEmail.ok()).toBeTruthy();

  // POST /api/integrations/slack/test
  const slackTest = await request.post("/api/integrations/slack/test", {
    data: { botToken: "xoxb-fixture-token" },
  });
  expect(slackTest.ok()).toBeTruthy();
  const slackTestPayload = await slackTest.json();
  expect(slackTestPayload.ok).toBe(true);
  expect(slackTestPayload.botUsername).toBeTruthy();

  // POST /api/integrations/slack/connect
  const slackConnect = await request.post("/api/integrations/slack/connect", {
    data: { botToken: "xoxb-fixture-token" },
  });
  expect(slackConnect.ok()).toBeTruthy();
  const slackConnectPayload = await slackConnect.json();
  expect(slackConnectPayload.ok).toBe(true);
  expect(slackConnectPayload.state).toBe("connected");

  // Disconnect Slack
  const slackDisconnect = await request.post("/api/integrations/slack/connect", {
    data: { enabled: false },
  });
  expect(slackDisconnect.ok()).toBeTruthy();
});

test("system admin endpoints: auth token, UI config, e2e seed, and config reset", async ({ request }) => {
  await resetDemoState(request, "seeded");

  // GET /api/auth/token
  const authToken = await request.get("/api/auth/token");
  expect(authToken.ok()).toBeTruthy();
  const tokenPayload = await authToken.json();
  expect(typeof tokenPayload.token).toBe("string");

  // GET /api/ui
  const ui = await request.get("/api/ui");
  expect(ui.ok()).toBeTruthy();
  const uiPayload = await ui.json();
  expect(Array.isArray(uiPayload.badges)).toBeTruthy();

  // POST /api/e2e/seed
  const seed = await request.post("/api/e2e/seed", {
    data: { profile: "seeded" },
  });
  expect(seed.ok()).toBeTruthy();
  const seedPayload = await seed.json();
  expect(seedPayload.ok).toBe(true);
  expect(seedPayload.profile).toBe("seeded");

  // POST /api/config/reset – in hermetic mode resets to fresh
  const configReset = await request.post("/api/config/reset");
  expect(configReset.ok()).toBeTruthy();
  const resetPayload = await configReset.json();
  expect(resetPayload.ok).toBe(true);
});

test("GET /api/config redacts secrets and PUT /api/config preserves non-exposed values", async ({ request }) => {
  await resetDemoState(request, "seeded");

  const config = await request.get("/api/config");
  expect(config.ok()).toBeTruthy();
  const configPayload = await config.json();
  expect(typeof configPayload).toBe("object");
  expect(typeof configPayload.displayName).toBe("string");
  expect(configPayload.telegram?.botToken ?? "").toBe("");
  expect(configPayload.slack?.botToken ?? "").toBe("");

  const updatedConfig = {
    ...configPayload,
    displayName: "API Config User",
  };
  const updateConfig = await request.put("/api/config", {
    data: updatedConfig,
  });
  expect(updateConfig.ok()).toBeTruthy();

  const configAfter = await request.get("/api/config");
  const afterPayload = await configAfter.json();
  expect(afterPayload.displayName).toBe("API Config User");
  expect(afterPayload.telegram?.botToken ?? "").toBe("");
  expect(afterPayload.slack?.botToken ?? "").toBe("");
});
