import { createSecretKey } from "node:crypto";

import { SignJWT, jwtVerify } from "jose";

import type { AuthClaims, TokenPair } from "../shared/protocol.ts";
import type { RelayConfig } from "./config.ts";
import type { RelayDatabase } from "./db.ts";

export class RelayAuthService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly config: RelayConfig,
    private readonly db: RelayDatabase,
  ) {
    this.secret = createSecretKey(Buffer.from(config.jwtSecret)).export() as Uint8Array;
  }

  async issueTokenPair(input: {
    userId: string;
    email: string;
    role: "admin" | "user";
    tenantId: string;
    scopes: string[];
    agentId?: string;
    workspaceId?: string;
  }): Promise<TokenPair> {
    const claims: AuthClaims = {
      sub: input.userId,
      email: input.email,
      role: input.role,
      tenantId: input.tenantId,
      scopes: input.scopes,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
    };

    const accessToken = await new SignJWT(claims as unknown as Record<string, unknown>)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlSec}s`)
      .sign(this.secret);

    const refreshToken = this.db.createRefreshToken({
      userId: input.userId,
      tenantId: input.tenantId,
      scopes: input.scopes,
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ttlSec: this.config.refreshTokenTtlSec,
    });

    return {
      accessToken,
      refreshToken,
      expiresInSec: this.config.accessTokenTtlSec,
    };
  }

  async verifyAccessToken(token: string): Promise<AuthClaims> {
    const verified = await jwtVerify(token, this.secret);
    return verified.payload as unknown as AuthClaims;
  }
}
