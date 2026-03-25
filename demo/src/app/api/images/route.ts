import { NextRequest, NextResponse } from "next/server";
import { getClaw } from "@/lib/claw";
import { createE2EImage, isE2EEnabled, listE2EImagesFiltered } from "@/lib/e2e";

export async function GET(request: NextRequest) {
  if (isE2EEnabled()) {
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const status = url.searchParams.get("status");
    const backendId = url.searchParams.get("backendId");
    return NextResponse.json({
      images: listE2EImagesFiltered({
        limit: limit ? Number(limit) : undefined,
        status,
        backendId,
      }),
    });
  }

  try {
    const claw = await getClaw();
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    const status = url.searchParams.get("status");
    const backendId = url.searchParams.get("backendId");

    const images = claw.image.list({
      ...(limit ? { limit: Number(limit) } : {}),
      ...(status === "succeeded" || status === "failed" ? { status } : {}),
      ...(backendId ? { backendId } : {}),
    });

    return NextResponse.json({ images });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (isE2EEnabled()) {
    const body = await request.json();
    const { prompt, backendId, model, title } = body;
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }
    return NextResponse.json({
      image: createE2EImage({
        prompt: prompt.trim(),
        backendId,
        model,
        title,
      }),
    });
  }

  try {
    const claw = await getClaw();
    const body = await request.json();
    const { prompt, backendId, model, metadata, title } = body;

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "prompt is required" }, { status: 400 });
    }

    const record = await claw.image.generate({
      prompt: prompt.trim(),
      ...(title ? { title } : {}),
      ...(backendId ? { backendId } : {}),
      ...(model ? { model } : {}),
      ...(metadata ? { metadata } : {}),
    });

    return NextResponse.json({ image: record });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
