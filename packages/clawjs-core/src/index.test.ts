import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAWJS_CANONICAL_HIERARCHY,
  CLAWJS_CANONICAL_TERMS,
  CLAWJS_NON_SYNONYMS,
  ClawError,
  auditEventSchema,
  createTtsPlaybackPlan,
  compatSnapshotSchema,
  createManifest,
  eventRecordSchema,
  linkedEntityRefSchema,
  segmentTextForTts,
  manifestSchema,
  maskCredential,
  noteRecordSchema,
  personIdentitySchema,
  taskRecordSchema,
  stripMarkdownForTts,
  summarizeReadiness,
  templatePackSchema,
  workspaceSearchQuerySchema,
} from "./index.ts";

test("createManifest returns a valid manifest", () => {
  const manifest = createManifest({
    appId: "demo-app",
    workspaceId: "demo-workspace",
    agentId: "demo-agent",
    rootDir: "/tmp/demo",
  }, "openclaw");

  assert.deepEqual(manifestSchema.parse(manifest), manifest);
});

test("maskCredential keeps only the tail", () => {
  assert.equal(maskCredential("sk-12345678"), "*******5678");
  assert.equal(maskCredential("abcd", 4), "****");
  assert.equal(maskCredential(""), null);
});

test("summarizeReadiness degrades until all tracked capabilities are ready", () => {
  const degraded = summarizeReadiness({
    runtime: { name: "runtime", status: "ready" },
    workspace: { name: "workspace", status: "ready" },
    auth: { name: "auth", status: "degraded", recommendedActions: ["login"] },
  });

  assert.equal(degraded.overallStatus, "degraded");
  assert.deepEqual(degraded.recommendedActions, ["login"]);

  const ready = summarizeReadiness({
    runtime: { name: "runtime", status: "ready" },
    workspace: { name: "workspace", status: "ready" },
    auth: { name: "auth", status: "ready" },
    models: { name: "models", status: "ready" },
    file_sync: { name: "file_sync", status: "ready" },
  });

  assert.equal(ready.overallStatus, "ready");
});

test("ClawError preserves code and repair hint", () => {
  const error = new ClawError({
    code: "runtime_not_found",
    message: "OpenClaw CLI is missing",
    capability: "runtime",
    repairHint: "Install the runtime first.",
  });

  assert.equal(error.code, "runtime_not_found");
  assert.equal(error.repairHint, "Install the runtime first.");
});

test("compat and template schemas validate normalized payloads", () => {
  const compat = compatSnapshotSchema.parse({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T10:00:00.000Z",
    capabilities: { status: true, doctor: false },
  });
  assert.equal(compat.runtimeAdapter, "openclaw");

  const templatePack = templatePackSchema.parse({
    schemaVersion: 1,
    id: "demo",
    name: "Demo",
    mutations: [
      {
        targetFile: "SOUL.md",
        mode: "managed_block",
        blockId: "core",
        content: "hello",
      },
    ],
  });
  assert.equal(templatePack.mutations[0]?.targetFile, "SOUL.md");

  const auditEvent = auditEventSchema.parse({
    timestamp: "2026-03-21T10:00:00.000Z",
    event: "files.binding_synced",
    capability: "file_sync",
    detail: { file: "SOUL.md" },
  });
  assert.equal(auditEvent.capability, "file_sync");
});

test("workspace productivity schemas validate linked records and search queries", () => {
  const link = linkedEntityRefSchema.parse({
    domain: "task",
    id: "task-1",
    relationship: "blocks",
  });
  assert.equal(link.domain, "task");

  const task = taskRecordSchema.parse({
    id: "task-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Ship workspace layer",
    status: "todo",
    priority: "high",
    labels: ["sdk"],
    watcherPersonIds: [],
    childTaskIds: [],
    checklist: [],
    links: [link],
  });
  assert.equal(task.priority, "high");

  const note = noteRecordSchema.parse({
    id: "note-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Context",
    blocks: [{ id: "block-1", type: "paragraph", text: "Workspace context." }],
    tags: ["workspace"],
    linkedEntityIds: ["task-1"],
    searchText: "Context Workspace context.",
  });
  assert.equal(note.blocks[0]?.type, "paragraph");

  const identity = personIdentitySchema.parse({
    channel: "telegram",
    handle: "@alice",
  });
  assert.equal(identity.channel, "telegram");

  const event = eventRecordSchema.parse({
    id: "event-1",
    createdAt: "2026-03-21T10:00:00.000Z",
    updatedAt: "2026-03-21T10:00:00.000Z",
    source: { kind: "local" },
    title: "Launch review",
    startsAt: "2026-03-22T09:00:00.000Z",
    attendeePersonIds: [],
    linkedTaskIds: ["task-1"],
    linkedNoteIds: ["note-1"],
    reminders: [{ id: "reminder-1", minutesBeforeStart: 30 }],
  });
  assert.equal(event.reminders[0]?.minutesBeforeStart, 30);

  const search = workspaceSearchQuerySchema.parse({
    query: "workspace",
    domains: ["tasks", "notes"],
    strategy: "hybrid",
    limit: 5,
  });
  assert.equal(search.strategy, "hybrid");
});

test("canonical terminology exports the agreed product vocabulary", () => {
  assert.equal(CLAWJS_CANONICAL_TERMS.runtimeAdapter, "runtime adapter");
  assert.equal(CLAWJS_CANONICAL_TERMS.agentProfile, "agent profile");
  assert.deepEqual(CLAWJS_CANONICAL_HIERARCHY, [
    "runtimeAdapter",
    "workspace",
    "agent",
    "agentProfile",
    "provider",
    "model",
    "gateway",
  ]);
  assert.deepEqual(CLAWJS_NON_SYNONYMS.gateway, ["runtime adapter"]);
  assert.deepEqual(CLAWJS_NON_SYNONYMS.workspace, ["agent"]);
  assert.deepEqual(CLAWJS_NON_SYNONYMS.provider, ["model"]);
});

test("tts helpers strip markdown and build a stable playback plan", () => {
  const plain = stripMarkdownForTts("## Hello\n\n**World** [link](https://example.com)\n- item");
  assert.equal(plain, "Hello. World link item");

  const segments = segmentTextForTts(
    "First sentence. Second sentence with, enough detail to split safely if needed.",
    { maxSegmentLength: 20 },
  );
  assert.deepEqual(segments, [
    "First sentence.",
    "Second sentence",
    "with, enough detail",
    "to split safely if",
    "needed.",
  ]);

  const plan = createTtsPlaybackPlan({
    text: "Paragraph one.\n\nParagraph two with `inline code`.",
  });
  assert.equal(plan.plainText, "Paragraph one. Paragraph two with inline code.");
  assert.deepEqual(
    plan.segments.map((segment) => segment.text),
    ["Paragraph one.", "Paragraph two with inline code."],
  );
});
