import { NextResponse } from "next/server";
import { generateId, readCollection, writeCollection } from "@/lib/demo-store";
import { isE2EEnabled } from "@/lib/e2e";
import { getWorkspaceClaw } from "@/lib/workspace-claw";

interface MemoryEntry {
  id: string;
  kind: "knowledge" | "session" | "file" | "index" | "store";
  title: string;
  content: string;
  source: string;
  sessionId?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

function toTimestamp(v: string | number | undefined): number {
  if (!v) return Date.now();
  if (typeof v === "number") return v;
  return new Date(v).getTime() || Date.now();
}

function noteToEntry(n: any): MemoryEntry {
  const content = n.blocks?.length
    ? n.blocks.map((b: any) => b.text).join("\n")
    : n.content || n.searchText || "";
  return {
    id: n.id,
    kind: "knowledge",
    title: n.title,
    content,
    source: "notes",
    tags: n.tags || [],
    createdAt: toTimestamp(n.createdAt),
    updatedAt: toTimestamp(n.updatedAt),
  };
}

function taskToEntry(t: any): MemoryEntry {
  return {
    id: t.id,
    kind: "index",
    title: t.title,
    content: t.description || "",
    source: "tasks",
    tags: t.labels || [],
    createdAt: toTimestamp(t.createdAt),
    updatedAt: toTimestamp(t.updatedAt),
  };
}

function searchResultToEntry(r: any, i: number): MemoryEntry {
  return {
    id: r.id || `search-${i}`,
    kind: r.domain === "notes" ? "knowledge" : r.domain === "tasks" ? "index" : "store",
    title: r.title || "Untitled",
    content: r.snippet || "",
    source: r.domain || "search",
    tags: [],
    createdAt: toTimestamp(r.updatedAt),
    updatedAt: toTimestamp(r.updatedAt),
  };
}

const SEED_NOTES = [
  { title: "Project Architecture Overview", content: "The project uses an npm-managed monorepo. Core contracts live in packages/clawjs-core, the SDK in packages/clawjs-node, the CLI in packages/clawjs, and the demo app in demo/.", tags: ["architecture", "monorepo"] },
  { title: "API Authentication Flow", content: "Authentication uses short-lived access credentials with rotation and local secret storage. Sensitive values should never be returned by public configuration endpoints.", tags: ["auth", "security"] },
  { title: "Debug: worker pool cleanup", content: "Root cause: event listeners were not removed when workers were recycled. The remediation was to unregister listeners during shutdown and add regression coverage for repeated restarts.", tags: ["debug", "memory"] },
  { title: "Notification system design", content: "Multi-channel support uses a provider pattern. Adapters for email, Slack, and Telegram share a common queue for reliable delivery.", tags: ["planning", "notifications"] },
  { title: "Configuration Reference", content: "Document runtime requirements in dedicated setup docs and keep secret material in a vault-backed flow, not in repo-local config snapshots.", tags: ["config", "env"] },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const kindFilter = searchParams.get("kind");
  const query = searchParams.get("q");

  if (isE2EEnabled()) {
    let entries = readCollection<MemoryEntry>("memory");
    if (query) {
      const needle = query.trim().toLowerCase();
      entries = entries.filter((entry) =>
        entry.title.toLowerCase().includes(needle)
        || entry.content.toLowerCase().includes(needle)
        || entry.tags.some((tag) => tag.toLowerCase().includes(needle)),
      );
    }
    if (kindFilter && kindFilter !== "all") {
      entries = entries.filter((entry) => entry.kind === kindFilter);
    }
    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ entries });
  }

  try {
    const claw = await getWorkspaceClaw();

    if (query) {
      const results = await claw.search.query({ query });
      let entries = results.map(searchResultToEntry);
      if (kindFilter && kindFilter !== "all") {
        entries = entries.filter((e) => e.kind === kindFilter);
      }
      return NextResponse.json({ entries });
    }

    const [notes, tasks] = await Promise.all([
      claw.notes.list(),
      claw.tasks.list(),
    ]);

    let entries: MemoryEntry[] = [
      ...notes.map(noteToEntry),
      ...tasks.map(taskToEntry),
    ];

    if (entries.length === 0) {
      for (const seed of SEED_NOTES) {
        await claw.notes.create(seed);
      }
      const seeded = await claw.notes.list();
      entries = seeded.map(noteToEntry);
    }

    if (kindFilter && kindFilter !== "all") {
      entries = entries.filter((e) => e.kind === kindFilter);
    }

    entries.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("[api/memory] GET failed:", err);
    return NextResponse.json({ entries: [] });
  }
}

export async function POST(request: Request) {
  if (isE2EEnabled()) {
    const body = await request.json();
    const entries = readCollection<MemoryEntry>("memory");
    const entry: MemoryEntry = {
      id: generateId(),
      kind: body.kind || "knowledge",
      title: body.title || "Untitled",
      content: body.content || "",
      source: body.source || "manual",
      tags: body.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    writeCollection("memory", [entry, ...entries]);
    return NextResponse.json(entry);
  }

  try {
    const body = await request.json();
    const claw = await getWorkspaceClaw();
    const note = await claw.notes.create({
      title: body.title || "Untitled",
      content: body.content || "",
      tags: body.tags || [],
    });
    return NextResponse.json(noteToEntry(note));
  } catch (err) {
    console.error("[api/memory] POST failed:", err);
    return NextResponse.json({ error: "Failed to create" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (isE2EEnabled()) {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const entries = readCollection<MemoryEntry>("memory");
    const index = entries.findIndex((entry) => entry.id === body.id);
    if (index === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    entries[index] = {
      ...entries[index],
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      ...(body.source !== undefined ? { source: body.source } : {}),
      updatedAt: Date.now(),
    };
    writeCollection("memory", entries);
    return NextResponse.json(entries[index]);
  }

  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const claw = await getWorkspaceClaw();
    const updated = await claw.notes.update(body.id, {
      title: body.title,
      content: body.content,
      tags: body.tags,
    });
    return NextResponse.json(noteToEntry(updated));
  } catch (err) {
    console.error("[api/memory] PUT failed:", err);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (isE2EEnabled()) {
    const entries = readCollection<MemoryEntry>("memory");
    writeCollection("memory", entries.filter((entry) => entry.id !== id));
    return NextResponse.json({ ok: true });
  }
  try {
    const claw = await getWorkspaceClaw();
    await claw.notes.remove(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/memory] DELETE failed:", err);
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
