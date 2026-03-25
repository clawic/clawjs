import { NextResponse } from "next/server";
import { createSession, listSessions } from "@/lib/sessions";

export async function GET() {
  return NextResponse.json({ sessions: listSessions() });
}

export async function POST(req: Request) {
  let title: string | undefined;

  try {
    const body = await req.json() as { title?: unknown };
    if (typeof body.title === "string" && body.title.trim()) {
      title = body.title.trim();
    }
  } catch {
    title = undefined;
  }

  const session = createSession(title);
  return NextResponse.json({ session });
}
