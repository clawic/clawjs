import { NextResponse } from "next/server";
import { searchSessions } from "@/lib/sessions";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  if (!query.trim()) {
    return NextResponse.json({ results: [] });
  }

  const results = searchSessions(query, limit);
  return NextResponse.json({ results });
}
