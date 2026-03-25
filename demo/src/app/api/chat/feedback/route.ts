import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    await request.json().catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
