import { buildRelayApp } from "./app.ts";

export async function startRelayServer() {
  const built = await buildRelayApp();
  await built.app.listen({
    host: built.config.host,
    port: built.config.port,
  });
  built.logger.info(`Relay listening on http://${built.config.host}:${built.config.port}`);
  return built;
}
