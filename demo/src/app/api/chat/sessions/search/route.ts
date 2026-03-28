import { NextResponse } from "next/server";
import { searchSessions } from "@/lib/sessions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "";
  const limit = parseInt(searchParams.get("limit") ?? "20", 10);

  if (!query.trim()) {
    return NextResponse.json({ results: [] }, { headers: NO_STORE_HEADERS });
  }

  const results = searchSessions(query, limit);
  return NextResponse.json({ results }, { headers: NO_STORE_HEADERS });
}
