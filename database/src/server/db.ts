import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import Database from "better-sqlite3";

import { generateOpaqueToken, hashSecret } from "./auth.ts";
import type {
  CollectionDefinition,
  DatabaseOperation,
  FieldDefinition,
  FileAsset,
  IndexDefinition,
  NamespaceRecord,
  RecordEnvelope,
  ScopedTokenRecord,
} from "../shared/types.ts";

interface CollectionRow {
  namespace_id: string;
  name: string;
  display_name: string;
  fields_json: string;
  indexes_json: string;
  builtin: number;
  protected: number;
  core_fields_json: string;
  created_at: string;
  updated_at: string;
}

interface RecordRow {
  id: string;
  data_json: string;
  created_at: string;
  updated_at: string;
}

interface TokenRow {
  id: string;
  label: string;
  namespace_id: string;
  collection_name: string | null;
  operations_json: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface FileRow {
  id: string;
  namespace_id: string;
  collection_name: string | null;
  record_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_path: string;
  created_at: string;
}

const SYSTEM_FIELDS = ["id", "createdAt", "updatedAt"] as const;
const VALID_OPERATIONS = new Set<DatabaseOperation>([
  "schema:read",
  "schema:write",
  "records:list",
  "records:read",
  "records:create",
  "records:update",
  "records:delete",
  "files:read",
  "files:write",
  "realtime:subscribe",
  "tokens:issue",
  "tokens:revoke",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || randomUUID().slice(0, 8);
}

function assertCollectionName(name: string): void {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) {
    throw new Error("Collection names must match ^[a-z][a-z0-9_]*$.");
  }
}

function assertNamespaceId(value: string): void {
  if (!/^[a-z0-9][a-z0-9-_]*$/.test(value)) {
    throw new Error("Namespace ids must contain only lowercase letters, numbers, dashes, and underscores.");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeField(field: FieldDefinition): FieldDefinition {
  if (!field.name || SYSTEM_FIELDS.includes(field.name as typeof SYSTEM_FIELDS[number])) {
    throw new Error(`Invalid field name ${field.name || "<empty>"}.`);
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field.name)) {
    throw new Error(`Field ${field.name} must match ^[a-zA-Z][a-zA-Z0-9_]*$.`);
  }
  return {
    name: field.name,
    type: field.type,
    ...(field.required ? { required: true } : {}),
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.relation ? { relation: { collectionName: field.relation.collectionName } } : {}),
  };
}

function normalizeIndex(index: IndexDefinition): IndexDefinition {
  if (!index.name?.trim()) {
    throw new Error("Index name is required.");
  }
  if (!Array.isArray(index.fields) || index.fields.length === 0) {
    throw new Error(`Index ${index.name} requires at least one field.`);
  }
  return {
    name: index.name.trim(),
    fields: [...new Set(index.fields)],
    ...(index.unique ? { unique: true } : {}),
  };
}

function validateFields(fields: FieldDefinition[]): FieldDefinition[] {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new Error("Collections require at least one custom field.");
  }
  const normalized = fields.map(normalizeField);
  const names = new Set<string>();
  for (const field of normalized) {
    if (names.has(field.name)) {
      throw new Error(`Field ${field.name} is duplicated.`);
    }
    names.add(field.name);
    if (field.type === "select" && (!field.options || field.options.length === 0)) {
      throw new Error(`Field ${field.name} requires options.`);
    }
    if (field.type === "relation" && !field.relation?.collectionName) {
      throw new Error(`Field ${field.name} requires relation.collectionName.`);
    }
  }
  return normalized;
}

function serializeCollection(row: CollectionRow): CollectionDefinition {
  return {
    namespaceId: row.namespace_id,
    name: row.name,
    displayName: row.display_name,
    fields: parseJson<FieldDefinition[]>(row.fields_json, []),
    indexes: parseJson<IndexDefinition[]>(row.indexes_json, []),
    builtin: Boolean(row.builtin),
    protected: Boolean(row.protected),
    coreFieldNames: parseJson<string[]>(row.core_fields_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeRecord(row: RecordRow): RecordEnvelope {
  const data = parseJson<Record<string, unknown>>(row.data_json, {});
  return {
    id: row.id,
    ...data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeToken(row: TokenRow): ScopedTokenRecord {
  return {
    id: row.id,
    label: row.label,
    namespaceId: row.namespace_id,
    collectionName: row.collection_name,
    operations: parseJson<DatabaseOperation[]>(row.operations_json, []),
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

function serializeFile(row: FileRow): FileAsset {
  return {
    id: row.id,
    namespaceId: row.namespace_id,
    collectionName: row.collection_name,
    recordId: row.record_id,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    downloadPath: `/v1/files/${row.id}`,
  };
}

function validateFieldValue(field: FieldDefinition, value: unknown): void {
  if (value === null || value === undefined) {
    if (field.required) throw new Error(`Field ${field.name} is required.`);
    return;
  }

  switch (field.type) {
    case "text":
      if (typeof value !== "string") throw new Error(`Field ${field.name} must be text.`);
      return;
    case "email":
      if (typeof value !== "string" || !value.includes("@")) throw new Error(`Field ${field.name} must be an email.`);
      return;
    case "url":
      if (typeof value !== "string" || !/^https?:\/\//.test(value)) throw new Error(`Field ${field.name} must be a url.`);
      return;
    case "number":
      if (typeof value !== "number" || Number.isNaN(value)) throw new Error(`Field ${field.name} must be a number.`);
      return;
    case "boolean":
      if (typeof value !== "boolean") throw new Error(`Field ${field.name} must be a boolean.`);
      return;
    case "date":
      if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new Error(`Field ${field.name} must be an ISO date string.`);
      return;
    case "json":
      if (!isPlainObject(value) && !Array.isArray(value)) throw new Error(`Field ${field.name} must be an object or array.`);
      return;
    case "select":
      if (typeof value !== "string" || !field.options?.includes(value)) throw new Error(`Field ${field.name} must match one of the allowed options.`);
      return;
    case "relation":
      if (typeof value !== "string" || !value.trim()) throw new Error(`Field ${field.name} must be a related record id.`);
      return;
    case "file":
      if (typeof value !== "string" || !value.trim()) throw new Error(`Field ${field.name} must be a file asset id.`);
      return;
  }
}

function builtInCollections(): Array<{
  name: string;
  displayName: string;
  coreFieldNames: string[];
  fields: FieldDefinition[];
  indexes: IndexDefinition[];
}> {
  return [
    {
      name: "people",
      displayName: "People",
      coreFieldNames: ["displayName", "email"],
      fields: [
        { name: "displayName", type: "text", required: true },
        { name: "email", type: "email", required: true },
        { name: "phone", type: "text" },
        { name: "role", type: "text" },
        { name: "organization", type: "text" },
      ],
      indexes: [{ name: "people_email_unique", fields: ["email"], unique: true }],
    },
    {
      name: "tasks",
      displayName: "Tasks",
      coreFieldNames: ["title", "status"],
      fields: [
        { name: "title", type: "text", required: true },
        { name: "status", type: "select", required: true, options: ["todo", "in_progress", "done"] },
        { name: "priority", type: "select", options: ["low", "medium", "high", "urgent"] },
        { name: "dueAt", type: "date" },
        { name: "assignee", type: "relation", relation: { collectionName: "people" } },
      ],
      indexes: [{ name: "tasks_status_idx", fields: ["status"] }],
    },
    {
      name: "events",
      displayName: "Events",
      coreFieldNames: ["title", "startsAt"],
      fields: [
        { name: "title", type: "text", required: true },
        { name: "startsAt", type: "date", required: true },
        { name: "endsAt", type: "date" },
        { name: "location", type: "text" },
        { name: "notes", type: "text" },
      ],
      indexes: [{ name: "events_starts_at_idx", fields: ["startsAt"] }],
    },
    {
      name: "notes",
      displayName: "Notes",
      coreFieldNames: ["title", "content"],
      fields: [
        { name: "title", type: "text", required: true },
        { name: "content", type: "text", required: true },
        { name: "tags", type: "json" },
      ],
      indexes: [{ name: "notes_title_idx", fields: ["title"] }],
    },
  ];
}

export class DatabaseServiceStore {
  readonly sqlite: Database.Database;

  constructor(
    dbPath: string,
    private readonly filesDir: string,
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.mkdirSync(filesDir, { recursive: true });
    this.sqlite = new Database(dbPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.init();
    this.seed();
  }

  close(): void {
    this.sqlite.close();
  }

  private init(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS namespaces (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS collections (
        namespace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        display_name TEXT NOT NULL,
        fields_json TEXT NOT NULL,
        indexes_json TEXT NOT NULL,
        builtin INTEGER NOT NULL DEFAULT 0,
        protected INTEGER NOT NULL DEFAULT 0,
        core_fields_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_id, name),
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS records (
        namespace_id TEXT NOT NULL,
        collection_name TEXT NOT NULL,
        id TEXT NOT NULL,
        data_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (namespace_id, collection_name, id),
        FOREIGN KEY (namespace_id, collection_name) REFERENCES collections(namespace_id, name) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS scoped_tokens (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        namespace_id TEXT NOT NULL,
        collection_name TEXT,
        operations_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_used_at TEXT,
        revoked_at TEXT,
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        namespace_id TEXT NOT NULL,
        collection_name TEXT,
        record_id TEXT,
        filename TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (namespace_id) REFERENCES namespaces(id) ON DELETE CASCADE
      );
    `);
  }

  private seed(): void {
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT OR IGNORE INTO admins (id, email, password_hash, created_at)
      VALUES (?, ?, ?, ?)
    `).run("admin-main", "admin@database.local", hashSecret("database-admin"), now);
    if (this.listNamespaces().length === 0) {
      this.createNamespace({ id: "main", displayName: "Main" });
    }
  }

  verifyAdmin(email: string, password: string): { id: string; email: string } | null {
    const row = this.sqlite.prepare(`
      SELECT id, email, password_hash
      FROM admins
      WHERE email = ?
    `).get(email) as { id: string; email: string; password_hash: string } | undefined;
    if (!row) return null;
    return row.password_hash === hashSecret(password) ? { id: row.id, email: row.email } : null;
  }

  listNamespaces(): NamespaceRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, display_name, created_at, updated_at
      FROM namespaces
      ORDER BY id ASC
    `).all() as Array<{ id: string; display_name: string; created_at: string; updated_at: string }>).map((row) => ({
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  getNamespace(namespaceId: string): NamespaceRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, display_name, created_at, updated_at
      FROM namespaces
      WHERE id = ?
    `).get(namespaceId) as { id: string; display_name: string; created_at: string; updated_at: string } | undefined;
    if (!row) return null;
    return {
      id: row.id,
      displayName: row.display_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  createNamespace(input: { id?: string; displayName: string }): NamespaceRecord {
    const id = input.id ? slugify(input.id) : slugify(input.displayName);
    assertNamespaceId(id);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO namespaces (id, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, input.displayName.trim() || id, now, now);
    for (const builtIn of builtInCollections()) {
      this.createCollection(id, {
        name: builtIn.name,
        displayName: builtIn.displayName,
        fields: builtIn.fields,
        indexes: builtIn.indexes,
        builtin: true,
        protected: true,
        coreFieldNames: builtIn.coreFieldNames,
      });
    }
    return this.getNamespace(id)!;
  }

  private readCollectionRow(namespaceId: string, name: string): CollectionRow | undefined {
    return this.sqlite.prepare(`
      SELECT namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      FROM collections
      WHERE namespace_id = ? AND name = ?
    `).get(namespaceId, name) as CollectionRow | undefined;
  }

  getCollection(namespaceId: string, name: string): CollectionDefinition | null {
    const row = this.readCollectionRow(namespaceId, name);
    return row ? serializeCollection(row) : null;
  }

  listCollections(namespaceId: string): CollectionDefinition[] {
    return (this.sqlite.prepare(`
      SELECT namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      FROM collections
      WHERE namespace_id = ?
      ORDER BY builtin DESC, name ASC
    `).all(namespaceId) as CollectionRow[]).map(serializeCollection);
  }

  createCollection(namespaceId: string, input: {
    name: string;
    displayName?: string;
    fields: FieldDefinition[];
    indexes?: IndexDefinition[];
    builtin?: boolean;
    protected?: boolean;
    coreFieldNames?: string[];
  }): CollectionDefinition {
    if (!this.getNamespace(namespaceId)) {
      throw new Error(`Namespace ${namespaceId} does not exist.`);
    }
    assertCollectionName(input.name);
    const fields = validateFields(input.fields);
    const indexes = (input.indexes ?? []).map(normalizeIndex);
    const coreFieldNames = [...new Set((input.coreFieldNames ?? []).map((entry) => entry.trim()).filter(Boolean))];
    for (const fieldName of coreFieldNames) {
      if (!fields.some((field) => field.name === fieldName)) {
        throw new Error(`Protected core field ${fieldName} is missing from collection ${input.name}.`);
      }
    }
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO collections (
        namespace_id, name, display_name, fields_json, indexes_json, builtin, protected, core_fields_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      namespaceId,
      input.name,
      input.displayName?.trim() || input.name,
      JSON.stringify(fields),
      JSON.stringify(indexes),
      input.builtin ? 1 : 0,
      input.protected ? 1 : 0,
      JSON.stringify(coreFieldNames),
      now,
      now,
    );
    return this.getCollection(namespaceId, input.name)!;
  }

  updateCollection(namespaceId: string, name: string, input: {
    displayName?: string;
    fields?: FieldDefinition[];
    indexes?: IndexDefinition[];
  }): CollectionDefinition {
    const current = this.getCollection(namespaceId, name);
    if (!current) throw new Error(`Collection ${name} does not exist.`);
    const fields = input.fields ? validateFields(input.fields) : current.fields;
    for (const fieldName of current.coreFieldNames) {
      if (!fields.some((field) => field.name === fieldName)) {
        throw new Error(`Protected collection ${name} cannot remove core field ${fieldName}.`);
      }
    }
    const indexes = input.indexes ? input.indexes.map(normalizeIndex) : current.indexes;
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE collections
      SET display_name = ?, fields_json = ?, indexes_json = ?, updated_at = ?
      WHERE namespace_id = ? AND name = ?
    `).run(
      input.displayName?.trim() || current.displayName,
      JSON.stringify(fields),
      JSON.stringify(indexes),
      now,
      namespaceId,
      name,
    );
    return this.getCollection(namespaceId, name)!;
  }

  deleteCollection(namespaceId: string, name: string): boolean {
    const current = this.getCollection(namespaceId, name);
    if (!current) return false;
    if (current.protected) {
      throw new Error(`Collection ${name} is protected and cannot be deleted.`);
    }
    return this.sqlite.prepare(`
      DELETE FROM collections
      WHERE namespace_id = ? AND name = ?
    `).run(namespaceId, name).changes > 0;
  }

  private validateRecordPayload(collection: CollectionDefinition, payload: Record<string, unknown>, mode: "create" | "update"): Record<string, unknown> {
    const allowed = new Set(collection.fields.map((field) => field.name));
    for (const key of Object.keys(payload)) {
      if (SYSTEM_FIELDS.includes(key as typeof SYSTEM_FIELDS[number])) {
        throw new Error(`System field ${key} cannot be mutated.`);
      }
      if (!allowed.has(key)) {
        throw new Error(`Unknown field ${key} for collection ${collection.name}.`);
      }
    }
    for (const field of collection.fields) {
      const value = payload[field.name];
      if (mode === "create" || value !== undefined) {
        validateFieldValue(field, value);
      }
    }
    return payload;
  }

  listRecords(namespaceId: string, collectionName: string, options: {
    filter?: Record<string, unknown>;
    sort?: string;
    limit?: number;
    offset?: number;
  } = {}): { total: number; items: RecordEnvelope[] } {
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    let items = (this.sqlite.prepare(`
      SELECT id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ?
    `).all(namespaceId, collectionName) as RecordRow[]).map(serializeRecord);

    if (options.filter && isPlainObject(options.filter)) {
      items = items.filter((item) => Object.entries(options.filter ?? {}).every(([key, value]) => item[key] === value));
    }

    if (options.sort) {
      const desc = options.sort.startsWith("-");
      const key = desc ? options.sort.slice(1) : options.sort;
      items.sort((left, right) => {
        const a = left[key];
        const b = right[key];
        if (a === b) return 0;
        if (a === undefined) return 1;
        if (b === undefined) return -1;
        return `${a}`.localeCompare(`${b}`) * (desc ? -1 : 1);
      });
    } else {
      items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    }

    const total = items.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    items = items.slice(offset, offset + limit);
    return { total, items };
  }

  getRecord(namespaceId: string, collectionName: string, id: string): RecordEnvelope | null {
    const row = this.sqlite.prepare(`
      SELECT id, data_json, created_at, updated_at
      FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).get(namespaceId, collectionName, id) as RecordRow | undefined;
    return row ? serializeRecord(row) : null;
  }

  createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): RecordEnvelope {
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const normalized = this.validateRecordPayload(collection, payload, "create");
    const id = randomUUID();
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO records (namespace_id, collection_name, id, data_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(namespaceId, collectionName, id, JSON.stringify(normalized), now, now);
    return this.getRecord(namespaceId, collectionName, id)!;
  }

  updateRecord(namespaceId: string, collectionName: string, id: string, payload: Record<string, unknown>): RecordEnvelope {
    const current = this.getRecord(namespaceId, collectionName, id);
    if (!current) throw new Error(`Record ${id} does not exist.`);
    const collection = this.getCollection(namespaceId, collectionName);
    if (!collection) throw new Error(`Collection ${collectionName} does not exist.`);
    const merged = {
      ...Object.fromEntries(Object.entries(current).filter(([key]) => !SYSTEM_FIELDS.includes(key as typeof SYSTEM_FIELDS[number]))),
      ...payload,
    };
    const normalized = this.validateRecordPayload(collection, merged, "update");
    const now = nowIso();
    this.sqlite.prepare(`
      UPDATE records
      SET data_json = ?, updated_at = ?
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).run(JSON.stringify(normalized), now, namespaceId, collectionName, id);
    return this.getRecord(namespaceId, collectionName, id)!;
  }

  deleteRecord(namespaceId: string, collectionName: string, id: string): boolean {
    return this.sqlite.prepare(`
      DELETE FROM records
      WHERE namespace_id = ? AND collection_name = ? AND id = ?
    `).run(namespaceId, collectionName, id).changes > 0;
  }

  createScopedToken(input: {
    label: string;
    namespaceId: string;
    collectionName?: string | null;
    operations: DatabaseOperation[];
  }): { record: ScopedTokenRecord; token: string } {
    if (!this.getNamespace(input.namespaceId)) {
      throw new Error(`Namespace ${input.namespaceId} does not exist.`);
    }
    if (input.collectionName && !this.getCollection(input.namespaceId, input.collectionName)) {
      throw new Error(`Collection ${input.collectionName} does not exist.`);
    }
    const operations = [...new Set(input.operations)];
    if (operations.length === 0) {
      throw new Error("Scoped tokens require at least one operation.");
    }
    for (const operation of operations) {
      if (!VALID_OPERATIONS.has(operation)) {
        throw new Error(`Unknown operation ${operation}.`);
      }
    }
    const id = randomUUID();
    const token = generateOpaqueToken("dbtk");
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO scoped_tokens (
        id, label, token_hash, namespace_id, collection_name, operations_json, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.label.trim() || "token",
      hashSecret(token),
      input.namespaceId,
      input.collectionName ?? null,
      JSON.stringify(operations),
      now,
    );
    return {
      record: this.getScopedToken(id)!,
      token,
    };
  }

  listScopedTokens(namespaceId: string): ScopedTokenRecord[] {
    return (this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE namespace_id = ?
      ORDER BY created_at DESC
    `).all(namespaceId) as TokenRow[]).map(serializeToken);
  }

  getScopedToken(id: string): ScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE id = ?
    `).get(id) as TokenRow | undefined;
    return row ? serializeToken(row) : null;
  }

  revokeScopedToken(namespaceId: string, tokenId: string): boolean {
    return this.sqlite.prepare(`
      UPDATE scoped_tokens
      SET revoked_at = ?
      WHERE namespace_id = ? AND id = ? AND revoked_at IS NULL
    `).run(nowIso(), namespaceId, tokenId).changes > 0;
  }

  authenticateScopedToken(rawToken: string): ScopedTokenRecord | null {
    const row = this.sqlite.prepare(`
      SELECT id, label, namespace_id, collection_name, operations_json, created_at, last_used_at, revoked_at
      FROM scoped_tokens
      WHERE token_hash = ?
    `).get(hashSecret(rawToken)) as TokenRow | undefined;
    if (!row || row.revoked_at) return null;
    this.sqlite.prepare(`
      UPDATE scoped_tokens
      SET last_used_at = ?
      WHERE id = ?
    `).run(nowIso(), row.id);
    return serializeToken({
      ...row,
      last_used_at: nowIso(),
    });
  }

  saveFile(input: {
    namespaceId: string;
    filename: string;
    contentType: string;
    bytes: Buffer;
    collectionName?: string | null;
    recordId?: string | null;
  }): FileAsset {
    if (!this.getNamespace(input.namespaceId)) {
      throw new Error(`Namespace ${input.namespaceId} does not exist.`);
    }
    if (input.collectionName && !this.getCollection(input.namespaceId, input.collectionName)) {
      throw new Error(`Collection ${input.collectionName} does not exist.`);
    }
    if (input.collectionName && input.recordId && !this.getRecord(input.namespaceId, input.collectionName, input.recordId)) {
      throw new Error(`Record ${input.recordId} does not exist.`);
    }
    const id = randomUUID();
    const storedFileName = `${id}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const relativePath = path.join(input.namespaceId, storedFileName);
    const absolutePath = path.join(this.filesDir, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, input.bytes);
    const now = nowIso();
    this.sqlite.prepare(`
      INSERT INTO files (
        id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.namespaceId,
      input.collectionName ?? null,
      input.recordId ?? null,
      input.filename,
      input.contentType || "application/octet-stream",
      input.bytes.byteLength,
      relativePath,
      now,
    );
    return this.getFile(id)!;
  }

  listFiles(namespaceId: string): FileAsset[] {
    return (this.sqlite.prepare(`
      SELECT id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      FROM files
      WHERE namespace_id = ?
      ORDER BY created_at DESC
    `).all(namespaceId) as FileRow[]).map(serializeFile);
  }

  getFile(id: string): (FileAsset & { storagePath: string }) | null {
    const row = this.sqlite.prepare(`
      SELECT id, namespace_id, collection_name, record_id, filename, content_type, size_bytes, storage_path, created_at
      FROM files
      WHERE id = ?
    `).get(id) as FileRow | undefined;
    if (!row) return null;
    return {
      ...serializeFile(row),
      storagePath: path.join(this.filesDir, row.storage_path),
    };
  }

  deleteFile(id: string): boolean {
    const file = this.getFile(id);
    if (!file) return false;
    if (fs.existsSync(file.storagePath)) {
      fs.unlinkSync(file.storagePath);
    }
    return this.sqlite.prepare(`
      DELETE FROM files
      WHERE id = ?
    `).run(id).changes > 0;
  }
}
