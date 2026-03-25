import { NextRequest } from "next/server";
import { NodeProcessHost, getRuntimeAdapter, listRuntimeAdapters } from "@clawjs/node";

interface ProgressEvent {
  phase: string;
  message?: string;
  percent?: number;
  status: string;
  operation: string;
}

const VALID_ADAPTER_IDS = new Set(
  listRuntimeAdapters().filter((a) => a.supportLevel !== "demo").map((a) => a.id),
);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const adapterId = typeof body?.adapter === "string" ? body.adapter : "";
  const operation = body?.operation === "uninstall" ? "uninstall" as const : "install" as const;

  if (!adapterId || !VALID_ADAPTER_IDS.has(adapterId)) {
    return new Response(JSON.stringify({ error: "Invalid adapter" }), { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const runner = new NodeProcessHost();
      const adapter = getRuntimeAdapter(adapterId);

      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const onProgress = (event: ProgressEvent) => {
        send({
          phase: event.phase,
          message: event.message ?? "",
          percent: event.percent ?? 0,
          status: event.status,
          operation: event.operation,
        });
      };

      try {
        if (operation === "install") {
          await adapter.install(runner, undefined, onProgress);
        } else {
          await adapter.uninstall(runner, undefined, onProgress);
        }
        send({ phase: "done", message: "Complete", percent: 100, status: "complete", operation });
      } catch (error) {
        send({
          phase: "error",
          message: error instanceof Error ? error.message : `${operation} failed`,
          percent: 0,
          status: "error",
          operation,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
