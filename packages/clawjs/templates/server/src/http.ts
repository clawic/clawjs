import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function sendText(response: ServerResponse, statusCode: number, body: string) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "text/plain; charset=utf-8");
  response.end(body);
}

export async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object.");
  }

  return parsed as Record<string, unknown>;
}

export function withRouteParams(pathname: string, pattern: RegExp): RegExpExecArray | null {
  return pattern.exec(pathname);
}

export function sendSseHeaders(response: ServerResponse) {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream; charset=utf-8");
  response.setHeader("cache-control", "no-cache, no-transform");
  response.setHeader("connection", "keep-alive");
}

export function writeSseEvent(response: ServerResponse, eventName: string, payload: unknown) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}
