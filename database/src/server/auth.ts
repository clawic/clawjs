import { createHash, createSecretKey } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import type { DatabaseOperation } from "../shared/types.ts";

export interface AdminClaims {
  kind: "admin";
  sub: string;
  email: string;
}

export interface TokenClaims {
  kind: "token";
  tokenId: string;
  namespaceId: string;
  collectionName?: string | null;
  operations: DatabaseOperation[];
}

export type AuthPrincipal =
  | { kind: "admin"; adminId: string; email: string }
  | { kind: "token"; tokenId: string; namespaceId: string; collectionName?: string | null; operations: DatabaseOperation[] };

export class DatabaseAuthService {
  private readonly secret: Uint8Array<ArrayBufferLike>;

  constructor(secretText: string) {
    this.secret = createSecretKey(Buffer.from(secretText)).export();
  }

  async issueAdminToken(input: { adminId: string; email: string }): Promise<string> {
    return await new SignJWT({
      kind: "admin",
      email: input.email,
    } satisfies Omit<AdminClaims, "sub">)
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(input.adminId)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(this.secret);
  }

  async verifyAdminToken(token: string): Promise<AuthPrincipal | null> {
    try {
      const verified = await jwtVerify(token, this.secret);
      const payload = verified.payload as Partial<AdminClaims> & { sub?: string };
      if (payload.kind !== "admin" || typeof payload.sub !== "string" || typeof payload.email !== "string") {
        return null;
      }
      return {
        kind: "admin",
        adminId: payload.sub,
        email: payload.email,
      };
    } catch {
      return null;
    }
  }
}

export function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
}
