export type FieldType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "json"
  | "select"
  | "relation"
  | "file"
  | "email"
  | "url";

export type DatabaseOperation =
  | "schema:read"
  | "schema:write"
  | "records:list"
  | "records:read"
  | "records:create"
  | "records:update"
  | "records:delete"
  | "files:read"
  | "files:write"
  | "realtime:subscribe"
  | "tokens:issue"
  | "tokens:revoke";

export interface FieldDefinition {
  name: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  relation?: {
    collectionName: string;
  };
}

export interface IndexDefinition {
  name: string;
  fields: string[];
  unique?: boolean;
}

export interface CollectionDefinition {
  namespaceId: string;
  name: string;
  displayName: string;
  fields: FieldDefinition[];
  indexes: IndexDefinition[];
  builtin: boolean;
  protected: boolean;
  coreFieldNames: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordEnvelope {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

export interface NamespaceRecord {
  id: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScopedTokenRecord {
  id: string;
  label: string;
  namespaceId: string;
  collectionName?: string | null;
  operations: DatabaseOperation[];
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

export interface FileAsset {
  id: string;
  namespaceId: string;
  collectionName?: string | null;
  recordId?: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  downloadPath: string;
}

export interface RecordChangeEvent {
  type: "record.created" | "record.updated" | "record.deleted";
  namespaceId: string;
  collectionName: string;
  recordId: string;
  record?: RecordEnvelope;
  at: string;
}

export interface AccessPolicy {
  namespaceId: string;
  collectionName?: string | null;
  operations: DatabaseOperation[];
}
