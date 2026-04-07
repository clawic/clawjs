import { buildDatabaseApp } from "../server/app.ts";
import { DatabaseApiClient } from "../cli/client.ts";

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > 2) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags[token.slice(2)] = "true";
      continue;
    }
    flags[token.slice(2)] = next;
    index += 1;
  }
  return flags;
}

function positionals(argv: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      values.push(token);
      continue;
    }
    if (token.includes("=")) continue;
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) index += 1;
  }
  return values;
}

function parseJsonFlag<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

function parseCsvFlag(value: string | undefined): string[] {
  return (value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
}

function write(payload: unknown, wantsJson: boolean): void {
  if (wantsJson) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${typeof payload === "string" ? payload : JSON.stringify(payload, null, 2)}\n`);
}

const argv = process.argv.slice(2);
const flags = parseFlags(argv);
const wantsJson = argv.includes("--json");
const [group, command, subcommand] = positionals(argv);

if (argv.includes("--help") || argv.includes("-h") || !group) {
  process.stdout.write([
    "Usage: database <command> [options]",
    "",
    "Commands:",
    "  database serve [--host HOST] [--port PORT]",
    "  database login --url URL --email EMAIL --password PASSWORD",
    "  database namespace list|create",
    "  database collection list|create|update",
    "  database record list|create|update|delete",
    "  database token list|create|revoke",
    "  database file list|upload|delete",
  ].join("\n") + "\n");
  process.exit(0);
}

async function main() {
  if (group === "serve") {
    const { app } = buildDatabaseApp({
      config: {
        ...(flags.host ? { host: flags.host } : {}),
        ...(flags.port ? { port: Number(flags.port) } : {}),
        ...(flags["data-dir"] ? { dataDir: flags["data-dir"] } : {}),
        ...(flags["db-path"] ? { dbPath: flags["db-path"] } : {}),
        ...(flags["files-dir"] ? { filesDir: flags["files-dir"] } : {}),
        ...(flags.secret ? { jwtSecret: flags.secret } : {}),
      },
    });
    const address = await app.listen({
      host: flags.host ?? "127.0.0.1",
      port: flags.port ? Number(flags.port) : 4510,
    });
    process.stdout.write(`${address}\n`);
    return;
  }

  const baseUrl = flags.url ?? "http://127.0.0.1:4510";
  const client = new DatabaseApiClient({
    baseUrl,
    token: flags.token,
  });

  if (group === "login") {
    const payload = await client.login(flags.email ?? "", flags.password ?? "");
    write(payload, wantsJson);
    return;
  }

  if (group === "namespace" && command === "list") {
    write(await client.listNamespaces(), wantsJson);
    return;
  }

  if (group === "namespace" && command === "create") {
    write(await client.createNamespace({
      id: flags.id,
      displayName: flags["display-name"] ?? subcommand ?? "",
    }), wantsJson);
    return;
  }

  if (group === "collection" && command === "list") {
    write(await client.listCollections(flags.namespace ?? ""), wantsJson);
    return;
  }

  if (group === "collection" && command === "create") {
    write(await client.createCollection(flags.namespace ?? "", {
      name: flags.name ?? subcommand ?? "",
      displayName: flags["display-name"],
      fields: parseJsonFlag(flags.fields, []),
      indexes: parseJsonFlag(flags.indexes, []),
    }), wantsJson);
    return;
  }

  if (group === "collection" && command === "update") {
    write(await client.updateCollection(flags.namespace ?? "", flags.name ?? subcommand ?? "", {
      displayName: flags["display-name"],
      ...(flags.fields ? { fields: parseJsonFlag(flags.fields, []) } : {}),
      ...(flags.indexes ? { indexes: parseJsonFlag(flags.indexes, []) } : {}),
    }), wantsJson);
    return;
  }

  if (group === "record" && command === "list") {
    write(await client.listRecords(flags.namespace ?? "", flags.collection ?? "", {
      filter: flags.filter,
      sort: flags.sort,
    }), wantsJson);
    return;
  }

  if (group === "record" && command === "create") {
    write(await client.createRecord(flags.namespace ?? "", flags.collection ?? "", parseJsonFlag(flags.data, {})), wantsJson);
    return;
  }

  if (group === "record" && command === "update") {
    write(await client.updateRecord(flags.namespace ?? "", flags.collection ?? "", flags.id ?? subcommand ?? "", parseJsonFlag(flags.data, {})), wantsJson);
    return;
  }

  if (group === "record" && command === "delete") {
    write(await client.deleteRecord(flags.namespace ?? "", flags.collection ?? "", flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "token" && command === "list") {
    write(await client.listTokens(flags.namespace ?? ""), wantsJson);
    return;
  }

  if (group === "token" && command === "create") {
    write(await client.createToken(flags.namespace ?? "", {
      label: flags.label ?? "token",
      collectionName: flags.collection,
      operations: parseCsvFlag(flags.operations),
    }), wantsJson);
    return;
  }

  if (group === "token" && command === "revoke") {
    write(await client.revokeToken(flags.namespace ?? "", flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  if (group === "file" && command === "list") {
    write(await client.listFiles(flags.namespace ?? ""), wantsJson);
    return;
  }

  if (group === "file" && command === "upload") {
    write(await client.uploadFile({
      namespaceId: flags.namespace ?? "",
      filePath: flags.file ?? "",
      collectionName: flags.collection,
      recordId: flags["record-id"],
    }), wantsJson);
    return;
  }

  if (group === "file" && command === "delete") {
    write(await client.deleteFile(flags.id ?? subcommand ?? ""), wantsJson);
    return;
  }

  process.stderr.write("Unknown command.\n");
  process.exit(64);
}

try {
  await main();
  process.exit(0);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
