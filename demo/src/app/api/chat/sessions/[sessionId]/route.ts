import { NextRequest, NextResponse } from "next/server";
import { getSession, updateSessionTitle, sessionExists } from "@/lib/sessions";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ session }, { headers: NO_STORE_HEADERS });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;

  if (!sessionExists(sessionId)) {
    return NextResponse.json({ error: "Session not found" }, { status: 404, headers: NO_STORE_HEADERS });
  }

  const body = await request.json() as { title?: string };

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const updated = updateSessionTitle(sessionId, body.title.trim());
  if (!updated) {
    return NextResponse.json({ error: "Failed to update title" }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return NextResponse.json({ ok: true, title: body.title.trim() }, { headers: NO_STORE_HEADERS });
}
