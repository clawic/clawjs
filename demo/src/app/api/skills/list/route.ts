import { getClaw } from "@/lib/claw";
import { isE2EEnabled, listE2ESkills } from "@/lib/e2e";

export async function GET() {
  if (isE2EEnabled()) {
    return Response.json({ skills: listE2ESkills() });
  }

  try {
    const claw = await getClaw();
    const skills = await claw.skills.list();
    return Response.json({ skills });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list skills";
    return Response.json({ error: message, skills: [] }, { status: 500 });
  }
}
