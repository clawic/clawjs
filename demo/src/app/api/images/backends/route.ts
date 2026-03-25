import { NextResponse } from "next/server";
import { getClaw } from "@/lib/claw";
import { isE2EEnabled } from "@/lib/e2e";

export async function GET() {
  if (isE2EEnabled()) {
    return NextResponse.json({
      backends: [
        {
          id: "mock-image",
          label: "Mock image backend",
          supportedKinds: ["image"],
          available: true,
        },
      ],
    });
  }

  try {
    const claw = await getClaw();
    const backends = claw.image.backends();
    return NextResponse.json({ backends });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
