import { randomUUID } from "node:crypto";

import type { WebSocket } from "ws";

import type {
  ConnectorAuthContext,
  ConnectorInboundEnvelope,
  ConnectorOutboundEnvelope,
  ErrorEnvelope,
  HelloEnvelope,
  StreamEnvelope,
} from "../shared/protocol.ts";
import type { RelayDatabase } from "./db.ts";
import type { RelayLogger } from "./logger.ts";

export class OfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineError";
  }
}

interface ActiveConnection {
  sessionId: string;
  socket: WebSocket;
  auth: ConnectorAuthContext;
  capabilities: string[];
  version: string;
}

interface PendingInvocation {
  resolve: (value: Record<string, unknown>) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
  onStream?: (payload: StreamEnvelope) => void;
}

export class ConnectorRegistry {
  private readonly connections = new Map<string, ActiveConnection>();
  private readonly pending = new Map<string, PendingInvocation>();

  constructor(
    private readonly db: RelayDatabase,
    private readonly logger: RelayLogger,
    private readonly requestTimeoutMs: number,
  ) {}

  private key(tenantId: string, agentId: string): string {
    return `${tenantId}:${agentId}`;
  }

  attach(socket: WebSocket, auth: ConnectorAuthContext): void {
    const sessionId = randomUUID();

    socket.on("message", (buffer) => {
      try {
        const raw = buffer.toString();
        const message = JSON.parse(raw) as ConnectorInboundEnvelope;
        this.handleMessage(socket, sessionId, auth, message);
      } catch (error) {
        this.logger.error(`Failed to parse connector frame: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    socket.on("close", () => {
      this.teardown(sessionId, auth);
    });

    socket.on("error", (error) => {
      this.logger.error(`Connector socket error for ${auth.agentId}: ${error.message}`);
      this.teardown(sessionId, auth);
    });
  }

  private handleMessage(socket: WebSocket, sessionId: string, auth: ConnectorAuthContext, message: ConnectorInboundEnvelope): void {
    switch (message.type) {
      case "hello":
        this.handleHello(socket, sessionId, auth, message);
        return;
      case "heartbeat":
        this.db.touchConnectorSession(sessionId);
        return;
      case "stream": {
        const pending = this.pending.get(message.requestId);
        if (pending?.onStream) pending.onStream(message);
        return;
      }
      case "result": {
        const pending = this.pending.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.resolve(message.payload);
        return;
      }
      case "error": {
        const pending = message.requestId ? this.pending.get(message.requestId) : null;
        const text = `${message.code}: ${message.message}`;
        this.logger.error(`Connector error for ${auth.agentId}: ${text}`);
        if (!pending || !message.requestId) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.requestId);
        pending.reject(this.normalizeError(message));
        return;
      }
      case "event":
        this.db.appendActivity({
          tenantId: auth.tenantId,
          agentId: auth.agentId,
          workspaceId: typeof message.payload.workspaceId === "string" ? message.payload.workspaceId : undefined,
          capability: message.event,
          status: "info",
          detail: JSON.stringify(message.payload),
        });
        return;
      case "ack":
        return;
      default:
        return;
    }
  }

  private handleHello(socket: WebSocket, sessionId: string, auth: ConnectorAuthContext, message: HelloEnvelope): void {
    if (message.payload.tenantId !== auth.tenantId || message.payload.agentId !== auth.agentId) {
      this.logger.error(`Connector hello mismatch for ${auth.agentId}`);
      socket.close();
      return;
    }

    this.db.upsertAgent(auth.tenantId, auth.agentId, auth.agentId);
    this.db.upsertWorkspaces(auth.tenantId, auth.agentId, message.payload.workspaces);
    this.db.markConnectorOnline({
      sessionId,
      credentialId: auth.credentialId,
      tenantId: auth.tenantId,
      agentId: auth.agentId,
      capabilities: message.payload.capabilities,
      version: message.payload.version,
    });
    this.connections.set(this.key(auth.tenantId, auth.agentId), {
      sessionId,
      socket,
      auth,
      capabilities: message.payload.capabilities,
      version: message.payload.version,
    });
    const ack: ConnectorOutboundEnvelope = { type: "ack", payload: { sessionId } };
    socket.send(JSON.stringify(ack));
  }

  private teardown(sessionId: string, auth: ConnectorAuthContext): void {
    const key = this.key(auth.tenantId, auth.agentId);
    const current = this.connections.get(key);
    if (current?.sessionId === sessionId) {
      this.connections.delete(key);
    }
    this.db.markConnectorOffline(sessionId);
  }

  private normalizeError(message: ErrorEnvelope): Error {
    const detail = message.details ? ` ${JSON.stringify(message.details)}` : "";
    return new Error(`${message.code}: ${message.message}${detail}`);
  }

  async invoke(input: {
    tenantId: string;
    agentId: string;
    workspaceId?: string;
    operation: string;
    payload?: Record<string, unknown>;
    onStream?: (payload: StreamEnvelope) => void;
  }): Promise<Record<string, unknown>> {
    const connection = this.connections.get(this.key(input.tenantId, input.agentId));
    if (!connection) {
      throw new OfflineError(`No active connector for ${input.agentId}`);
    }

    const requestId = randomUUID();
    const envelope: ConnectorOutboundEnvelope = {
      type: "invoke",
      requestId,
      tenantId: input.tenantId,
      agentId: input.agentId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      operation: input.operation,
      payload: input.payload,
    };

    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Timed out waiting for connector response to ${input.operation}`));
      }, this.requestTimeoutMs);

      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        onStream: input.onStream,
      });

      connection.socket.send(JSON.stringify(envelope), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error);
      });
    });
  }
}
