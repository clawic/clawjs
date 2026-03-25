import { getClaw } from "@/lib/claw";

async function getGatewayStatus() {
  const claw = await getClaw();
  return claw.runtime.gateway.status();
}

export async function POST() {
  try {
    const claw = await getClaw();

    try {
      await claw.runtime.gateway.start();
    } catch {
      await claw.runtime.gateway.restart();
    }

    const status = await claw.runtime.gateway.waitUntilReady({ timeoutMs: 5_000, intervalMs: 1_000 });
    return Response.json({
      ok: true,
      reachable: status.available,
      ...(status.config ? { port: status.config.port } : {}),
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Gateway start failed",
    }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const claw = await getClaw();
    await claw.runtime.gateway.stop();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({
      ok: false,
      error: error instanceof Error ? error.message : "Gateway stop failed",
    }, { status: 500 });
  }
}

export async function GET() {
  const status = await getGatewayStatus();
  return Response.json({
    reachable: status.available,
    ...(status.config ? { port: status.config.port } : { port: 18789 }),
  });
}
