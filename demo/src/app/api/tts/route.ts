import { NextRequest } from "next/server";
import { getUserConfig } from "@/lib/user-config";
import { getClaw } from "@/lib/claw";
import { isE2EEnabled } from "@/lib/e2e";

/**
 * POST /api/tts
 * Body: { text: string; lang?: string }
 * Returns audio/mpeg buffer.
 */
export async function POST(req: NextRequest) {
  if (isE2EEnabled()) {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Return a minimal valid WAV (silence, ~100ms at 22050Hz mono 16-bit)
    // so that AudioContext.decodeAudioData() succeeds in the browser.
    const sampleRate = 22050;
    const numSamples = Math.ceil(sampleRate * 0.1); // 100ms
    const dataSize = numSamples * 2; // 16-bit = 2 bytes/sample
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);       // PCM subchunk size
    header.writeUInt16LE(1, 20);        // PCM format
    header.writeUInt16LE(1, 22);        // mono
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28); // byte rate
    header.writeUInt16LE(2, 32);        // block align
    header.writeUInt16LE(16, 34);       // bits per sample
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);
    const wav = Buffer.concat([header, Buffer.alloc(dataSize)]); // silence
    return new Response(wav, {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  }

  try {
    const { text, lang } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(JSON.stringify({ error: "Missing text" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const config = getUserConfig();
    const claw = await getClaw();
    const tts = claw.tts.normalizeConfig(config.tts);

    const result = await claw.tts.synthesize({
      text,
      lang,
      provider: tts.provider ?? "local",
      apiKey: tts.apiKey,
      voice: tts.voice,
      model: tts.model,
      speed: tts.speed,
      stability: tts.stability,
      similarityBoost: tts.similarityBoost,
    });

    return new Response(new Uint8Array(result.audio), {
      headers: {
        "Content-Type": result.mimeType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/tts]", err);
    return new Response(
      JSON.stringify({
        error: "TTS failed",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
