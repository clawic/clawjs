import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSessionTitle, sessionExists } from "@/lib/sessions";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;

  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const body = await request.json() as { title?: string };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const updated = updateSessionTitle(sessionId, body.title.trim());
  if (!updated) {
    return NextResponse.json({ error: "Failed to update title" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, title: body.title.trim() });
}
