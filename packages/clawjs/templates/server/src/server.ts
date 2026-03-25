import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { getClawSnapshot, requireInitializedClaw } from "./claw.js";
import {
  readJsonBody,
  sendJson,
  sendSseHeaders,
  sendText,
  withRouteParams,
  writeSseEvent,
} from "./http.js";

const port = Number(process.env.PORT || "3001");
type ConversationTransport = "auto" | "cli" | "gateway";
type ConversationRole = "user" | "system" | "assistant" | "tool";

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeRole(value: unknown): ConversationRole {
  return value === "system" || value === "assistant" || value === "tool" ? value : "user";
}

async function handleRequest(request: IncomingMessage, response: ServerResponse) {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);

  if (method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      service: "__APP_NAME__",
      uptimeSeconds: Math.round(process.uptime()),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/") {
    sendJson(response, 200, {
      ok: true,
      service: "__APP_NAME__",
      routes: [
        "GET /health",
        "GET /api/claw/status",
        "GET /api/sessions",
        "POST /api/sessions",
        "GET /api/sessions/:sessionId",
        "POST /api/sessions/:sessionId/messages",
        "POST /api/sessions/:sessionId/reply",
        "POST /api/sessions/:sessionId/stream",
      ],
    });
    return;
  }

  if (method === "GET" && url.pathname === "/api/claw/status") {
    try {
      sendJson(response, 200, await getClawSnapshot());
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load Claw status.",
      });
    }
    return;
  }

  if (url.pathname === "/api/sessions") {
    const ready = await requireInitializedClaw();
    if (!ready.ok) {
      sendJson(response, 409, ready);
      return;
    }

    if (method === "GET") {
      sendJson(response, 200, {
        ok: true,
        sessions: ready.claw.conversations.listSessions(),
      });
      return;
    }

    if (method === "POST") {
      try {
        const body = await readJsonBody(request);
        const title = normalizeString(body.title);
        const message = normalizeString(body.message);

        const session = ready.claw.conversations.createSession(title);
        if (message) {
          ready.claw.conversations.appendMessage(session.sessionId, {
            role: "user",
            content: message,
          });
        }

        sendJson(response, 201, {
          ok: true,
          session: ready.claw.conversations.getSession(session.sessionId),
        });
      } catch (error) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to create session.",
        });
      }
      return;
    }
  }

  const sessionMatch = withRouteParams(url.pathname, /^\/api\/sessions\/([^/]+)$/);
  if (method === "GET" && sessionMatch) {
    const ready = await requireInitializedClaw();
    if (!ready.ok) {
      sendJson(response, 409, ready);
      return;
    }

    const session = ready.claw.conversations.getSession(sessionMatch[1] ?? "");
    if (!session) {
      sendJson(response, 404, { ok: false, error: "Session not found." });
      return;
    }

    sendJson(response, 200, { ok: true, session });
    return;
  }

  const messageMatch = withRouteParams(url.pathname, /^\/api\/sessions\/([^/]+)\/messages$/);
  if (method === "POST" && messageMatch) {
    const ready = await requireInitializedClaw();
    if (!ready.ok) {
      sendJson(response, 409, ready);
      return;
    }

    try {
      const body = await readJsonBody(request);
      const content = normalizeString(body.content);
      const role = normalizeRole(body.role);

      if (!content) {
        sendJson(response, 400, { ok: false, error: "`content` is required." });
        return;
      }

      const session = ready.claw.conversations.appendMessage(messageMatch[1] ?? "", {
        role,
        content,
      });
      sendJson(response, 200, { ok: true, session });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to append message.",
      });
    }
    return;
  }

  const replyMatch = withRouteParams(url.pathname, /^\/api\/sessions\/([^/]+)\/reply$/);
  if (method === "POST" && replyMatch) {
    const ready = await requireInitializedClaw();
    if (!ready.ok) {
      sendJson(response, 409, ready);
      return;
    }

    try {
      const body = await readJsonBody(request);
      const message = normalizeString(body.message);
      const systemPrompt = normalizeString(body.systemPrompt);
      const transport = normalizeString(body.transport) as ConversationTransport | undefined;
      const sessionId = replyMatch[1] ?? "";

      if (message) {
        ready.claw.conversations.appendMessage(sessionId, {
          role: "user",
          content: message,
        });
      }

      let reply = "";
      for await (const chunk of ready.claw.conversations.streamAssistantReply({
        sessionId,
        systemPrompt,
        transport,
      })) {
        if (!chunk.done) {
          reply += chunk.delta;
        }
      }

      sendJson(response, 200, {
        ok: true,
        reply: reply.trim(),
        session: ready.claw.conversations.getSession(sessionId),
      });
    } catch (error) {
      sendJson(response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to generate reply.",
      });
    }
    return;
  }

  const streamMatch = withRouteParams(url.pathname, /^\/api\/sessions\/([^/]+)\/stream$/);
  if (method === "POST" && streamMatch) {
    const ready = await requireInitializedClaw();
    if (!ready.ok) {
      sendJson(response, 409, ready);
      return;
    }

    try {
      const body = await readJsonBody(request);
      const message = normalizeString(body.message);
      const systemPrompt = normalizeString(body.systemPrompt);
      const transport = normalizeString(body.transport) as ConversationTransport | undefined;
      const sessionId = streamMatch[1] ?? "";

      if (message) {
        ready.claw.conversations.appendMessage(sessionId, {
          role: "user",
          content: message,
        });
      }

      const controller = new AbortController();
      request.on("close", () => controller.abort());

      sendSseHeaders(response);
      writeSseEvent(response, "ready", { ok: true, sessionId });

      for await (const event of ready.claw.conversations.streamAssistantReplyEvents({
        sessionId,
        systemPrompt,
        transport,
        signal: controller.signal,
      })) {
        writeSseEvent(response, event.type, event);
      }

      response.end();
    } catch (error) {
      if (!response.headersSent) {
        sendJson(response, 400, {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to stream reply.",
        });
        return;
      }

      writeSseEvent(response, "error", {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to stream reply.",
      });
      response.end();
    }
    return;
  }

  sendText(response, 404, "Not found\n");
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, () => {
  process.stdout.write(`__APP_TITLE__ listening on http://localhost:${port}\n`);
});
