import { NextResponse } from "next/server";
import type { CapabilityHealth } from "@/lib/demo-store";
import { isE2EEnabled } from "@/lib/e2e";

const CAPABILITIES = [
  "runtime", "workspace", "auth", "models", "conversations",
  "scheduler", "memory", "skills", "channels", "plugins",
  "file_sync", "orchestration",
];

function pickStatus(): CapabilityHealth["status"] {
  const r = Math.random();
  if (r < 0.65) return "ready";
  if (r < 0.85) return "degraded";
  if (r < 0.95) return "error";
  return "unknown";
}

const DETAILS: Record<string, Record<string, string>> = {
  runtime: { ready: "All processes nominal", degraded: "High memory usage detected", error: "Worker process crashed" },
  workspace: { ready: "Workspace synced", degraded: "Sync delayed by 2m", error: "Workspace lock file stale" },
  auth: { ready: "All tokens valid", degraded: "Token refresh pending", error: "OAuth token expired" },
  models: { ready: "3 models available", degraded: "1 model slow to respond", error: "Primary model unavailable" },
  conversations: { ready: "Session store healthy", degraded: "Slow query response", error: "Index corrupted" },
  scheduler: { ready: "12 routines scheduled", degraded: "2 routines delayed", error: "Cron daemon unresponsive" },
  memory: { ready: "Vector store indexed", degraded: "Re-indexing in progress", error: "Embedding service down" },
  skills: { ready: "8 skills loaded", degraded: "1 skill failed health check", error: "Skill registry unreachable" },
  channels: { ready: "All channels connected", degraded: "WhatsApp reconnecting", error: "Telegram webhook failed" },
  plugins: { ready: "3 plugins active", degraded: "1 plugin high latency", error: "Plugin sandbox crashed" },
  file_sync: { ready: "Files up to date", degraded: "Large file queue pending", error: "Sync conflict unresolved" },
  orchestration: { ready: "Agent pool healthy", degraded: "Queue backlog growing", error: "Orchestrator timeout" },
};

function generateHealth(): CapabilityHealth[] {
  const now = Date.now();
  return CAPABILITIES.map((name) => {
    const status = pickStatus();
    const detailMap = DETAILS[name] || {};
    return {
      name,
      status,
      lastChecked: now - Math.floor(Math.random() * 60000),
      details: detailMap[status] || `Status: ${status}`,
      actions: status === "degraded" || status === "error" ? ["repair"] : [],
    };
  });
}

export async function GET() {
  if (isE2EEnabled()) {
    const now = Date.now();
    return NextResponse.json({
      capabilities: [
        { name: "runtime", status: "ready", lastChecked: now, details: "All processes nominal", actions: [] },
        { name: "workspace", status: "degraded", lastChecked: now - 1_000, details: "Workspace index is rebuilding", actions: ["repair"] },
        { name: "channels", status: "error", lastChecked: now - 2_000, details: "Telegram webhook failed", actions: ["repair"] },
        { name: "skills", status: "ready", lastChecked: now - 3_000, details: "Registry fixtures loaded", actions: [] },
      ],
      checkedAt: now,
    });
  }
  const capabilities = generateHealth();
  return NextResponse.json({ capabilities, checkedAt: Date.now() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const name = body.capability;
  if (!name) return NextResponse.json({ error: "Missing capability" }, { status: 400 });
  if (isE2EEnabled()) {
    const repaired: CapabilityHealth = {
      name,
      status: "ready",
      lastChecked: Date.now(),
      details: `${name} repaired successfully`,
      actions: [],
    };
    return NextResponse.json({ repaired });
  }
  // Simulate repair
  await new Promise((r) => setTimeout(r, 200));
  const repaired: CapabilityHealth = {
    name,
    status: "ready",
    lastChecked: Date.now(),
    details: `${name} repaired successfully`,
    actions: [],
  };
  return NextResponse.json({ repaired });
}
