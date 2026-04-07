import type { WebSocket } from "ws";

import type { AuthPrincipal } from "./auth.ts";
import type { DatabaseOperation, RecordChangeEvent } from "../shared/types.ts";

interface Subscription {
  namespaceId: string;
  collectionName: string;
}

interface ClientState {
  socket: WebSocket;
  principal: AuthPrincipal;
  subscriptions: Subscription[];
}

function hasRealtimePermission(
  principal: AuthPrincipal,
  namespaceId: string,
  collectionName: string,
  operation: DatabaseOperation,
): boolean {
  if (principal.kind === "admin") return true;
  return principal.namespaceId === namespaceId
    && (!principal.collectionName || principal.collectionName === collectionName)
    && principal.operations.includes(operation);
}

export class RealtimeHub {
  private readonly clients = new Set<ClientState>();

  attach(socket: WebSocket, principal: AuthPrincipal): void {
    const client: ClientState = { socket, principal, subscriptions: [] };
    this.clients.add(client);

    socket.on("message", (buffer) => {
      try {
        const payload = JSON.parse(buffer.toString()) as {
          type?: string;
          namespaceId?: string;
          collectionName?: string;
        };
        if (payload.type !== "subscribe" || !payload.namespaceId || !payload.collectionName) {
          socket.send(JSON.stringify({ type: "error", message: "Invalid subscription payload." }));
          return;
        }
        if (!hasRealtimePermission(principal, payload.namespaceId, payload.collectionName, "realtime:subscribe")) {
          socket.send(JSON.stringify({ type: "error", message: "Forbidden" }));
          return;
        }
        client.subscriptions = client.subscriptions.filter((entry) => !(entry.namespaceId === payload.namespaceId && entry.collectionName === payload.collectionName));
        client.subscriptions.push({
          namespaceId: payload.namespaceId,
          collectionName: payload.collectionName,
        });
        socket.send(JSON.stringify({ type: "subscribed", namespaceId: payload.namespaceId, collectionName: payload.collectionName }));
      } catch {
        socket.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      }
    });

    socket.on("close", () => {
      this.clients.delete(client);
    });

    socket.on("error", () => {
      this.clients.delete(client);
    });
  }

  broadcast(event: RecordChangeEvent): void {
    const payload = JSON.stringify({ type: "event", event });
    for (const client of this.clients) {
      const matchesSubscription = client.subscriptions.some((entry) => entry.namespaceId === event.namespaceId && entry.collectionName === event.collectionName);
      if (!matchesSubscription) continue;
      if (!hasRealtimePermission(client.principal, event.namespaceId, event.collectionName, "realtime:subscribe")) continue;
      client.socket.send(payload);
    }
  }
}
