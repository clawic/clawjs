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
        teamName: "ClawJS Demo Team",
      });
    }

    if (!botToken || typeof botToken !== "string") {
      return Response.json({ ok: false, error: "Missing bot token" }, { status: 400 });
    }

    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const data = await res.json();

    if (data.ok) {
      return Response.json({
        ok: true,
        botUsername: data.user,
        teamName: data.team,
      });
    }

    return Response.json({
      ok: false,
      error: data.error || "Invalid token",
    });
  } catch (e) {
    return Response.json({
      ok: false,
      error: e instanceof Error ? e.message : "Connection failed",
    }, { status: 500 });
  }
}
