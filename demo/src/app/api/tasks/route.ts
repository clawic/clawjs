import { NextResponse } from "next/server";
import { getWorkspaceClaw } from "@/lib/workspace-claw";
import { isE2EEnabled } from "@/lib/e2e";
import { readCollection, writeCollection, generateId, type Goal, type Task } from "@/lib/demo-store";

// Map SDK status to page status and vice versa
const SDK_TO_PAGE_STATUS: Record<string, string> = { todo: "backlog", in_progress: "in_progress", done: "done", blocked: "blocked", cancelled: "done" };
const PAGE_TO_SDK_STATUS: Record<string, string> = { backlog: "todo", in_progress: "in_progress", done: "done", blocked: "blocked" };

function taskToPage(t: any) {
  return {
    id: t.id,
    title: t.title,
    description: t.description || "",
    status: SDK_TO_PAGE_STATUS[t.status] || "backlog",
    priority: t.priority || "medium",
    goalId: t.metadata?.goalId as string | undefined,
    labels: t.labels || [],
    linkedSessionIds: (t.links || []).filter((l: any) => l.domain === "sessions").map((l: any) => l.entityId),
    createdAt: new Date(t.createdAt).getTime(),
    updatedAt: new Date(t.updatedAt).getTime(),
  };
}

export async function GET() {
  if (isE2EEnabled()) {
    return NextResponse.json({
      tasks: readCollection<Task>("tasks"),
      goals: readCollection<Goal>("goals"),
    });
  }

  try {
    const claw = await getWorkspaceClaw();
    const sdkTasks = await claw.tasks.list();
    const tasks = sdkTasks.map(taskToPage);
    const goals = readCollection<Goal>("goals");
    return NextResponse.json({ tasks, goals });
  } catch (err) {
    console.error("[api/tasks] GET failed:", err);
    return NextResponse.json({ tasks: [], goals: [] });
  }
}

export async function POST(request: Request) {
  const body = await request.json();

  if (body.type === "goal") {
    const goals = readCollection<Goal>("goals");
    const goal: Goal = {
      id: generateId(), title: body.title || "New Goal", description: body.description || "",
      parentId: body.parentId, progress: 0, status: "active", taskIds: [],
      createdAt: Date.now(), updatedAt: Date.now(),
    };
    goals.push(goal);
    writeCollection("goals", goals);
    return NextResponse.json(goal);
  }

  if (isE2EEnabled()) {
    const tasks = readCollection<Task>("tasks");
    const task: Task = {
      id: generateId(),
      title: body.title || "New Task",
      description: body.description || "",
      status: body.status || "backlog",
      priority: body.priority || "medium",
      goalId: body.goalId,
      labels: body.labels || [],
      linkedSessionIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    writeCollection("tasks", [...tasks, task]);
    return NextResponse.json(task);
  }

  try {
    const claw = await getWorkspaceClaw();
    const task = await claw.tasks.create({
      title: body.title || "New Task",
      description: body.description || undefined,
      status: (PAGE_TO_SDK_STATUS[body.status] || "todo") as any,
      priority: body.priority || "medium",
      labels: body.labels || [],
      metadata: body.goalId ? { goalId: body.goalId } : undefined,
    });
    return NextResponse.json(taskToPage(task));
  } catch (err) {
    console.error("[api/tasks] POST failed:", err);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();

  if (body.type === "goal") {
    const goals = readCollection<Goal>("goals");
    const idx = goals.findIndex(g => g.id === body.id);
    if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
    goals[idx] = { ...goals[idx], ...body, updatedAt: Date.now() };
    delete (goals[idx] as any).type;
    writeCollection("goals", goals);
    return NextResponse.json(goals[idx]);
  }

  if (isE2EEnabled()) {
    const tasks = readCollection<Task>("tasks");
    const index = tasks.findIndex((task) => task.id === body.id);
    if (index === -1) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    tasks[index] = {
      ...tasks[index],
      ...body,
      updatedAt: Date.now(),
    };
    delete (tasks[index] as Task & { type?: string }).type;
    writeCollection("tasks", tasks);
    return NextResponse.json(tasks[index]);
  }

  try {
    const claw = await getWorkspaceClaw();
    const updates: any = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = PAGE_TO_SDK_STATUS[body.status] || body.status;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.labels !== undefined) updates.labels = body.labels;
    if (body.goalId !== undefined) updates.metadata = { goalId: body.goalId };

    const task = await claw.tasks.update(body.id, updates);
    return NextResponse.json(taskToPage(task));
  } catch (err) {
    console.error("[api/tasks] PUT failed:", err);
    return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const type = searchParams.get("type");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  if (type === "goal") {
    const goals = readCollection<Goal>("goals");
    writeCollection("goals", goals.filter(g => g.id !== id));
    return NextResponse.json({ ok: true });
  }

  if (isE2EEnabled()) {
    const tasks = readCollection<Task>("tasks");
    writeCollection("tasks", tasks.filter((task) => task.id !== id));
    return NextResponse.json({ ok: true });
  }

  try {
    const claw = await getWorkspaceClaw();
    await claw.tasks.remove(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[api/tasks] DELETE failed:", err);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}
