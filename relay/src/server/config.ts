import path from "node:path";

export interface RelayConfig {
  host: string;
  port: number;
  dbPath: string;
  jwtSecret: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  corsOrigins: string[];
  requestTimeoutMs: number;
  heartbeatIntervalMs: number;
}

export function loadRelayConfig(overrides: Partial<RelayConfig> = {}): RelayConfig {
  const cwd = process.cwd();
  const cors = process.env.RELAY_CORS_ORIGINS?.split(",").map((entry) => entry.trim()).filter(Boolean) ?? [];

  return {
    host: overrides.host ?? process.env.RELAY_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.PORT ?? "4410"),
    dbPath: overrides.dbPath ?? process.env.RELAY_DB_PATH ?? path.join(cwd, "relay.sqlite"),
    jwtSecret: overrides.jwtSecret ?? process.env.RELAY_JWT_SECRET ?? "relay-dev-secret-change-me",
    accessTokenTtlSec: overrides.accessTokenTtlSec ?? Number(process.env.RELAY_ACCESS_TTL_SEC ?? "900"),
    refreshTokenTtlSec: overrides.refreshTokenTtlSec ?? Number(process.env.RELAY_REFRESH_TTL_SEC ?? `${60 * 60 * 24 * 30}`),
    corsOrigins: overrides.corsOrigins ?? cors,
    requestTimeoutMs: overrides.requestTimeoutMs ?? Number(process.env.RELAY_REQUEST_TIMEOUT_MS ?? "30000"),
    heartbeatIntervalMs: overrides.heartbeatIntervalMs ?? Number(process.env.RELAY_HEARTBEAT_INTERVAL_MS ?? "10000"),
  };
}
