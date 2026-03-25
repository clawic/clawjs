import { getClaw } from "@/lib/claw";
import { NextRequest } from "next/server";
import { isE2EEnabled, searchE2ESkills } from "@/lib/e2e";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q") ?? "";
  const source = request.nextUrl.searchParams.get("source") ?? undefined;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  if (!query.trim()) {
    return Response.json({ error: "Query parameter 'q' is required", entries: [] }, { status: 400 });
  }

  if (isE2EEnabled()) {
    const entries = searchE2ESkills(query, limit);
    return Response.json({ entries, query, source: source ?? null });
  }

  try {
    const claw = await getClaw();
    const result = await claw.skills.search(query, { source, limit });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return Response.json({ error: message, entries: [], sources: [], query }, { status: 500 });
  }
}
