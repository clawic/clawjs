import { getClaw } from "@/lib/claw";
import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import { resolveClawJSWorkspaceDir } from "@/lib/claw";
import { isE2EEnabled, listE2ESkills, removeE2ESkill } from "@/lib/e2e";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { id?: string };
    const id = body.id?.trim();
    if (!id) {
      return Response.json({ error: "Field 'id' is required" }, { status: 400 });
    }

    if (isE2EEnabled()) {
      if (!removeE2ESkill(id)) {
        return Response.json({ error: "Skill not found" }, { status: 404 });
      }
      return Response.json({ removed: id, skills: listE2ESkills() });
    }

    const workspaceDir = resolveClawJSWorkspaceDir();
    const skillDir = path.join(workspaceDir, "skills", id);

    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }

    const claw = await getClaw();
    const skills = await claw.skills.sync();

    return Response.json({ removed: id, skills });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Remove failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
