import path from "node:path";

export interface DatabaseServiceConfig {
  host: string;
  port: number;
  dbPath: string;
  dataDir: string;
  filesDir: string;
  jwtSecret: string;
  corsOrigins: string[];
}

export function loadDatabaseConfig(overrides: Partial<DatabaseServiceConfig> = {}): DatabaseServiceConfig {
  const cwd = process.cwd();
  const dataDir = overrides.dataDir ?? process.env.DATABASE_DATA_DIR ?? path.join(cwd, ".data");
  return {
    host: overrides.host ?? process.env.DATABASE_HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.DATABASE_PORT ?? process.env.PORT ?? "4510"),
    dbPath: overrides.dbPath ?? process.env.DATABASE_DB_PATH ?? path.join(dataDir, "database.sqlite"),
    dataDir,
    filesDir: overrides.filesDir ?? process.env.DATABASE_FILES_DIR ?? path.join(dataDir, "files"),
    jwtSecret: overrides.jwtSecret ?? process.env.DATABASE_JWT_SECRET ?? "database-dev-secret-change-me",
    corsOrigins: overrides.corsOrigins ?? (process.env.DATABASE_CORS_ORIGINS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}
