import { getClaw } from "@/lib/claw";
import { getE2ETtsCatalog, isE2EEnabled } from "@/lib/e2e";

export async function GET() {
  if (isE2EEnabled()) {
    return new Response(JSON.stringify(getE2ETtsCatalog(), null, 2), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  try {
    const claw = await getClaw();
    return new Response(JSON.stringify(claw.tts.catalog(), null, 2), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[api/tts/providers]", error);
    return new Response(
      JSON.stringify({
        error: "Failed to load TTS providers",
        detail: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
