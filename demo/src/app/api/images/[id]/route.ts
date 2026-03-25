import { NextRequest, NextResponse } from "next/server";
import { getClaw } from "@/lib/claw";
import { getE2EImage, isE2EEnabled, removeE2EImage } from "@/lib/e2e";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isE2EEnabled()) {
    const { id } = await params;
    const image = getE2EImage(id);
    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ image });
  }

  try {
    const { id } = await params;
    const claw = await getClaw();
    const image = claw.image.get(id);
    if (!image) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ image });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isE2EEnabled()) {
    const { id } = await params;
    if (!removeE2EImage(id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  try {
    const { id } = await params;
    const claw = await getClaw();
    const removed = claw.image.remove(id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
