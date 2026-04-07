import { buildDatabaseApp } from "../server/app.ts";

const { app, config } = buildDatabaseApp();

await app.listen({
  host: config.host,
  port: config.port,
});

process.stdout.write(`database listening on http://${config.host}:${config.port}\n`);
