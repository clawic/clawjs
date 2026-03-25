import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { getClaw } from "@/lib/claw";
import { getE2EImage, isE2EEnabled } from "@/lib/e2e";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isE2EEnabled()) {
    const { id } = await params;
    const image = getE2EImage(id);
    if (!image?.output?.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const buffer = fs.readFileSync(image.output.filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.output.mimeType || "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  try {
    const { id } = await params;
    const claw = await getClaw();
    const image = claw.image.get(id);

    if (!image || !image.output || !image.output.exists) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(image.output.filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": image.output.mimeType || "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
