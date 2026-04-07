import { randomUUID } from "node:crypto";

export interface ConnectorWorkspaceDescriptor {
  workspaceId: string;
  displayName: string;
}

export interface ConnectorHelloPayload {
  tenantId: string;
  agentId: string;
  version: string;
  capabilities: string[];
  workspaces: ConnectorWorkspaceDescriptor[];
}

export interface ConnectorEnvelopeBase {
  type: "hello" | "heartbeat" | "invoke" | "stream" | "result" | "error" | "event" | "ack";
  requestId?: string;
  subscriptionId?: string;
}

export interface InvokeEnvelope extends ConnectorEnvelopeBase {
  type: "invoke";
  requestId: string;
  tenantId: string;
  agentId: string;
  workspaceId?: string;
  operation: string;
  payload?: Record<string, unknown>;
}

export interface StreamEnvelope extends ConnectorEnvelopeBase {
  type: "stream";
  requestId: string;
  event: string;
  payload: Record<string, unknown>;
}

export interface ResultEnvelope extends ConnectorEnvelopeBase {
  type: "result";
  requestId: string;
  payload: Record<string, unknown>;
}

export interface ErrorEnvelope extends ConnectorEnvelopeBase {
  type: "error";
  requestId?: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AckEnvelope extends ConnectorEnvelopeBase {
  type: "ack";
  requestId?: string;
  payload?: Record<string, unknown>;
}

export interface EventEnvelope extends ConnectorEnvelopeBase {
  type: "event";
  event: string;
  payload: Record<string, unknown>;
}

export interface HeartbeatEnvelope extends ConnectorEnvelopeBase {
  type: "heartbeat";
  payload?: { timestamp: number };
}

export interface HelloEnvelope extends ConnectorEnvelopeBase {
  type: "hello";
  payload: ConnectorHelloPayload;
}

export type ConnectorInboundEnvelope =
  | HelloEnvelope
  | HeartbeatEnvelope
  | StreamEnvelope
  | ResultEnvelope
  | ErrorEnvelope
  | AckEnvelope
  | EventEnvelope;

export type ConnectorOutboundEnvelope = InvokeEnvelope | AckEnvelope;

export interface AuthClaims {
  sub: string;
  email: string;
  tenantId: string;
  role: "admin" | "user";
  scopes: string[];
  agentId?: string;
  workspaceId?: string;
}

export interface ConnectorAuthContext {
  credentialId: string;
  tenantId: string;
  agentId: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

export interface EnrollmentResult {
  tenantId: string;
  agentId: string;
  connectorToken: string;
}

export interface ActivityRecord {
  id: string;
  tenantId: string;
  agentId?: string | null;
  workspaceId?: string | null;
  capability: string;
  status: "success" | "error" | "info";
  detail: string;
  createdAt: number;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  agentId?: string | null;
  workspaceId?: string | null;
  tokensIn: number;
  tokensOut: number;
  estimatedCostUsd: number;
  createdAt: number;
}

export function generateOpaqueToken(prefix: string): { tokenId: string; token: string; secret: string } {
  const tokenId = randomUUID();
  const secret = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  return {
    tokenId,
    secret,
    token: `${prefix}_${tokenId}.${secret}`,
  };
}

export function parseOpaqueToken(prefix: string, token: string): { tokenId: string; secret: string } | null {
  const match = token.match(new RegExp(`^${prefix}_([^.]+)\\.(.+)$`));
  if (!match) return null;
  return { tokenId: match[1] ?? "", secret: match[2] ?? "" };
}
