import { NextRequest } from "next/server";
import { isE2EEnabled } from "@/lib/e2e";

export async function POST(req: NextRequest) {
  try {
    const { botToken } = await req.json();

    if (isE2EEnabled()) {
      if (!botToken || typeof botToken !== "string") {
        return Response.json({ ok: false, error: "Missing bot token" }, { status: 400 });
      }
      return Response.json({
        ok: true,
        botUsername: "clawjs_demo_bot",
        botName: "ClawJS Demo Bot",
      });
    }

    if (!botToken || typeof botToken !== "string") {
      return Response.json({ ok: false, error: "Missing bot token" }, { status: 400 });
    }

    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();

    if (data.ok && data.result) {
      return Response.json({
        ok: true,
        botUsername: data.result.username,
        botName: data.result.first_name,
      });
    }

    return Response.json({
      ok: false,
      error: data.description || "Invalid token",
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "Connection failed",
    }, { status: 500 });
  }
}
