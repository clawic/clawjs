import { NextResponse } from "next/server";
import {
  generateId,
  readCollection,
  writeCollection,
  type Note,
} from "@/lib/demo-store";
import { isE2EEnabled } from "@/lib/e2e";
import { getWorkspaceClaw } from "@/lib/workspace-claw";

function noteToPage(n: any) {
  const content = (n.blocks || []).map((b: any) => b.text).join("\n");
  const folderTag = (n.tags || []).find((t: string) => t.startsWith("folder:"));
  return {
    id: n.id,
    title: n.title,
    content,
    folder: folderTag ? folderTag.slice(7) : "",
    tags: (n.tags || []).filter((t: string) => !t.startsWith("folder:")),
    linkedTaskIds: (n.linkedEntityIds || []).filter((id: string) => id.startsWith("task:")),
    linkedSessionIds: (n.linkedEntityIds || []).filter((id: string) => id.startsWith("session:")),
    createdAt: new Date(n.createdAt).getTime(),
    updatedAt: new Date(n.updatedAt).getTime(),
  };
}

export async function GET() {
  if (isE2EEnabled()) {
    const notes = readCollection<Note>("notes").sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ notes });
  }

  try {
    const claw = await getWorkspaceClaw();
    const sdkNotes = await claw.notes.list();
    const notes = sdkNotes.map(noteToPage).sort((a: any, b: any) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("[api/notes] GET failed:", err);
    return NextResponse.json({ notes: [] });
  }
}

export async function POST(request: Request) {
  if (isE2EEnabled()) {
    const body = await request.json();
    const notes = readCollection<Note>("notes");
    const now = Date.now();
    const note: Note = {
      id: generateId(),
      title: body.title || "Untitled",
      content: body.content || "",
      folder: body.folder || "",
      tags: body.tags || [],
      linkedTaskIds: [],
      linkedSessionIds: [],
      createdAt: now,
      updatedAt: now,
    };
    writeCollection("notes", [note, ...notes]);
    return NextResponse.json(note);
  }

  try {
    const body = await request.json();
    const claw = await getWorkspaceClaw();
    const tags = [...(body.tags || [])];
    if (body.folder) tags.push(`folder:${body.folder}`);

    const note = await claw.notes.create({
      title: body.title || "Untitled",
      content: body.content || "",
      tags,
    });
    return NextResponse.json(noteToPage(note));
  } catch (err) {
    console.error("[api/notes] POST failed:", err);
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  if (isE2EEnabled()) {
    const body = await request.json();
    const notes = readCollection<Note>("notes");
    const index = notes.findIndex((note) => note.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: "Failed to update note" }, { status: 404 });
    }
    const updated: Note = {
      ...notes[index],
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: body.content } : {}),
      ...(body.folder !== undefined ? { folder: body.folder } : {}),
      ...(body.tags !== undefined ? { tags: body.tags } : {}),
      updatedAt: Date.now(),
    };
    notes[index] = updated;
    writeCollection("notes", notes);
    return NextResponse.json(updated);
  }

  try {
    const body = await request.json();
    const claw = await getWorkspaceClaw();
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.tags !== undefined || body.folder !== undefined) {
      const tags = [...(body.tags || [])];
      if (body.folder) tags.push(`folder:${body.folder}`);
      updates.tags = tags;
    }

    const note = await claw.notes.update(body.id, updates);
    return NextResponse.json(noteToPage(note));
  } catch (err) {
    console.error("[api/notes] PUT failed:", err);
    return NextResponse.json({ error: "Failed to update note" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (isE2EEnabled()) {
    const notes = readCollection<Note>("notes");
    writeCollection("notes", notes.filter((note) => note.id !== id));
    return NextResponse.json({ ok: true });
  }
  try {
    const claw = await getWorkspaceClaw();
    await claw.notes.remove(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/notes] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}
