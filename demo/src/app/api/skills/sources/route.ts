import { getClaw } from "@/lib/claw";

export async function GET() {
  try {
    const claw = await getClaw();
    const sources = await claw.skills.sources();
    return Response.json({ sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list skill sources";
    return Response.json({ error: message, sources: [] }, { status: 500 });
  }
}
