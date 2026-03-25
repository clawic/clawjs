import { NextRequest } from "next/server";
import {
  readCollection,
  writeCollection,
  generateId,
  type Routine,
  type RoutineExecution,
} from "@/lib/demo-store";

const ROUTINES = "routines";
const EXECUTIONS = "routine-executions";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET: list routines + recent executions ──
export async function GET() {
  try {
    const routines = readCollection<Routine>(ROUTINES);
    const executions = readCollection<RoutineExecution>(EXECUTIONS);
    // Return most recent 50 executions, sorted newest-first
    const recentExecutions = executions
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, 50);
    return json({ routines, executions: recentExecutions });
  } catch (err) {
    console.error("[api/routines] GET failed:", err);
    return json({ error: "Failed to load routines" }, 500);
  }
}

// ── POST: create a routine ──
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { label, description, schedule, channel, prompt } = body;

    if (!label || !schedule || !channel || !prompt) {
      return json({ error: "Missing required fields: label, schedule, channel, prompt" }, 400);
    }

    const now = Date.now();
    const routine: Routine = {
      id: generateId(),
      label,
      description: description || "",
      schedule,
      channel,
      prompt,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    const routines = readCollection<Routine>(ROUTINES);
    routines.push(routine);
    writeCollection(ROUTINES, routines);

    return json({ routine }, 201);
  } catch (err) {
    console.error("[api/routines] POST failed:", err);
    return json({ error: "Failed to create routine" }, 500);
  }
}

// ── PUT: update a routine (including toggle enabled) ──
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return json({ error: "Missing routine id" }, 400);
    }

    const routines = readCollection<Routine>(ROUTINES);
    const idx = routines.findIndex((r) => r.id === id);
    if (idx === -1) {
      return json({ error: "Routine not found" }, 404);
    }

    // If this is a "run now" request, create an execution record
    if (updates.runNow) {
      const executions = readCollection<RoutineExecution>(EXECUTIONS);
      const now = Date.now();
      const execution: RoutineExecution = {
        id: generateId(),
        routineId: id,
        status: "running",
        startedAt: now,
      };
      executions.push(execution);
      writeCollection(EXECUTIONS, executions);

      // Simulate completion after a short delay (demo purposes)
      // Mark the routine's lastRun
      routines[idx].lastRun = now;
      routines[idx].updatedAt = now;
      writeCollection(ROUTINES, routines);

      // Simulate async completion: update execution to success
      setTimeout(() => {
        const execs = readCollection<RoutineExecution>(EXECUTIONS);
        const eIdx = execs.findIndex((e) => e.id === execution.id);
        if (eIdx !== -1) {
          execs[eIdx].status = Math.random() > 0.15 ? "success" : "failure";
          execs[eIdx].completedAt = Date.now();
          execs[eIdx].output = execs[eIdx].status === "success"
            ? "Routine executed successfully."
            : "Simulated failure for demo.";
          if (execs[eIdx].status === "failure") {
            execs[eIdx].error = "Simulated error: channel timeout";
          }
          writeCollection(EXECUTIONS, execs);
        }
      }, 2000 + Math.random() * 3000);

      return json({ routine: routines[idx], execution });
    }

    // Normal field update
    const allowedFields = ["label", "description", "schedule", "channel", "prompt", "enabled"];
    for (const key of allowedFields) {
      if (key in updates) {
        (routines[idx] as unknown as Record<string, unknown>)[key] = updates[key];
      }
    }
    routines[idx].updatedAt = Date.now();
    writeCollection(ROUTINES, routines);

    return json({ routine: routines[idx] });
  } catch (err) {
    console.error("[api/routines] PUT failed:", err);
    return json({ error: "Failed to update routine" }, 500);
  }
}

// ── DELETE: remove a routine and its executions ──
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return json({ error: "Missing routine id" }, 400);
    }

    const routines = readCollection<Routine>(ROUTINES);
    const filtered = routines.filter((r) => r.id !== id);
    if (filtered.length === routines.length) {
      return json({ error: "Routine not found" }, 404);
    }
    writeCollection(ROUTINES, filtered);

    // Also clean up executions for this routine
    const executions = readCollection<RoutineExecution>(EXECUTIONS);
    writeCollection(EXECUTIONS, executions.filter((e) => e.routineId !== id));

    return json({ ok: true });
  } catch (err) {
    console.error("[api/routines] DELETE failed:", err);
    return json({ error: "Failed to delete routine" }, 500);
  }
}
