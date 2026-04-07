import { afterEach, before } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { test } from "node:test";

import { startDatabaseServer } from "./helpers.ts";

const execFileAsync = promisify(execFile);
const servers: Array<Awaited<ReturnType<typeof startDatabaseServer>>> = [];
let databaseDistCli = "";
let clawBin = "";

before(async () => {
  const repoRoot = path.resolve(process.cwd(), "..");
  await execFileAsync("npm", ["run", "build"], { cwd: process.cwd() });
  await execFileAsync("npm", ["run", "build:packages"], { cwd: repoRoot });
  databaseDistCli = path.join(process.cwd(), "dist", "cli.js");
  clawBin = path.join(repoRoot, "packages", "clawjs", "bin", "clawjs.mjs");
});

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop();
    if (server) await server.close();
  }
});

async function boot() {
  const server = await startDatabaseServer("database-cli");
  servers.push(server);
  return server;
}

test("dedicated CLI and claw bridge hit the same database service", async () => {
  const server = await boot();

  const login = await execFileAsync("node", [
    databaseDistCli,
    "login",
    "--url",
    server.baseUrl,
    "--email",
    "admin@database.local",
    "--password",
    "database-admin",
    "--json",
  ], { cwd: process.cwd() });
  const loginPayload = JSON.parse(login.stdout) as { accessToken: string };
  assert.ok(loginPayload.accessToken);

  await execFileAsync("node", [
    databaseDistCli,
    "namespace",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--id",
    "sales",
    "--display-name",
    "Sales",
    "--json",
  ], { cwd: process.cwd() });

  await execFileAsync("node", [
    databaseDistCli,
    "collection",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "sales",
    "--name",
    "accounts",
    "--fields",
    JSON.stringify([{ name: "name", type: "text", required: true }]),
    "--json",
  ], { cwd: process.cwd() });

  await execFileAsync("node", [
    databaseDistCli,
    "record",
    "create",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "sales",
    "--collection",
    "accounts",
    "--data",
    JSON.stringify({ name: "Acme" }),
    "--json",
  ], { cwd: process.cwd() });

  const listed = await execFileAsync("node", [
    clawBin,
    "database",
    "record",
    "list",
    "--url",
    server.baseUrl,
    "--token",
    loginPayload.accessToken,
    "--namespace",
    "sales",
    "--collection",
    "accounts",
    "--json",
  ], {
    cwd: path.resolve(process.cwd(), ".."),
    env: {
      ...process.env,
      CLAWJS_DATABASE_DIR: process.cwd(),
    },
  });
  const listedPayload = JSON.parse(listed.stdout) as { total: number; items: Array<{ name: string }> };
  assert.equal(listedPayload.total, 1);
  assert.equal(listedPayload.items[0]?.name, "Acme");
});
