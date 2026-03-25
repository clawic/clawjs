import { NextResponse } from "next/server";
import { isE2EEnabled } from "@/lib/e2e";
import { getWorkspaceClaw } from "@/lib/workspace-claw";

export async function GET() {
  if (isE2EEnabled()) {
    return NextResponse.json({
      surfaces: [],
      badges: [
        { id: "skills", value: 1 },
        { id: "inbox", value: 1 },
      ],
    });
  }

  const claw = await getWorkspaceClaw();

  const [surfaces, badges] = await Promise.all([
    Promise.resolve(claw.ui.surfaces()),
    claw.ui.badges(),
  ]);

  return NextResponse.json({ surfaces, badges });
}
