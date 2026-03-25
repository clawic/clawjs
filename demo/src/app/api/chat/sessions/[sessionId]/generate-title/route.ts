import { NextResponse } from "next/server";
import { getClaw } from "@/lib/claw";
import { isE2EEnabled } from "@/lib/e2e";
import { getSession, updateSessionTitle } from "@/lib/sessions";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function POST(_: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = getSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.messages.length < 2) {
    return NextResponse.json({ error: "Session needs at least 2 messages" }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const firstUserMessage = session.messages.find((message) => message.role === "user")?.content || "New chat";
    const generatedTitle = firstUserMessage.replace(/\s+/g, " ").trim().slice(0, 48);
    updateSessionTitle(sessionId, generatedTitle);
    return NextResponse.json({ title: generatedTitle });
  }

  try {
    const claw = await getClaw();
    const generatedTitle = await claw.conversations.generateTitle({
      sessionId,
      transport: "auto",
    });
    return NextResponse.json({ title: generatedTitle });
  } catch {
    return NextResponse.json({ error: "Failed to generate title" }, { status: 500 });
  }
}
