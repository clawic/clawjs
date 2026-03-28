import { NextResponse } from "next/server";
import { createSession, listSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  return NextResponse.json({ sessions: listSessions() }, { headers: NO_STORE_HEADERS });
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
  return NextResponse.json({ session }, { headers: NO_STORE_HEADERS });
}
