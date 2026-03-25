import { getClaw } from "@/lib/claw";
import { NextRequest } from "next/server";
import { installE2ESkill, isE2EEnabled } from "@/lib/e2e";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { ref?: string; source?: string };
    const ref = body.ref?.trim();
    if (!ref) {
      return Response.json({ error: "Field 'ref' is required" }, { status: 400 });
    }

    if (isE2EEnabled()) {
      const skill = installE2ESkill(ref);
      return Response.json({ ok: true, skill });
    }

    const claw = await getClaw();
    const result = await claw.skills.install(ref, { source: body.source });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Install failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
