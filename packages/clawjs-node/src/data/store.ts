import fs from "fs";
import path from "path";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

type Decoder<T> = (value: unknown) => T;

export interface DataDocumentHandle<T = unknown> {
  path(): string;
  exists(): boolean;
  read(): T | null;
  decode<TResult>(decoder: Decoder<TResult>): TResult | null;
  write(value: T): T;
  remove(): void;
}

export interface DataCollectionHandle<T = unknown> {
  dir(): string;
  listIds(): string[];
  list(): T[];
  entries(): Array<{ id: string; value: T }>;
  get(id: string): T | null;
  decode<TResult>(id: string, decoder: Decoder<TResult>): TResult | null;
  put(id: string, value: T): T;
  remove(id: string): void;
}

export interface DataAssetHandle {
  path(): string;
  exists(): boolean;
  readText(): string | null;
  writeText(content: string): void;
  readBuffer(): Buffer | null;
  writeBuffer(content: Uint8Array): void;
  remove(): void;
}

export interface WorkspaceDataStore {
  rootDir(): string;
  document<T = unknown>(name: string): DataDocumentHandle<T>;
  collection<T = unknown>(name: string): DataCollectionHandle<T>;
  asset(relativePath: string): DataAssetHandle;
}

function assertSafeName(name: string, label: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    throw new Error(`${label} contains unsupported characters: ${name}`);
  }
  return trimmed;
}

function assertSafeRelativePath(relativePath: string): string {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Unsafe asset path: ${relativePath}`);
  }
  return normalized;
}

function decodeValue<T>(value: unknown, decoder: Decoder<T>): T {
  return decoder(value);
}

function readJsonFile<T>(filesystem: NodeFileSystemHost, filePath: string): T | null {
  try {
    return JSON.parse(filesystem.readText(filePath)) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(filesystem: NodeFileSystemHost, filePath: string, value: unknown): void {
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
  });
}

function resolveDataRoot(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "data");
}

function resolveDocumentsDir(workspaceDir: string): string {
  return path.join(resolveDataRoot(workspaceDir), "documents");
}

function resolveCollectionsDir(workspaceDir: string): string {
  return path.join(resolveDataRoot(workspaceDir), "collections");
}

function resolveAssetsDir(workspaceDir: string): string {
  return path.join(resolveDataRoot(workspaceDir), "assets");
}

export function createWorkspaceDataStore(
  workspaceDir: string,
  filesystem = new NodeFileSystemHost(),
): WorkspaceDataStore {
  return {
    rootDir: () => resolveDataRoot(workspaceDir),
    document: <T = unknown>(name: string): DataDocumentHandle<T> => {
      const safeName = assertSafeName(name, "document name");
      const filePath = path.join(resolveDocumentsDir(workspaceDir), `${safeName}.json`);
      return {
        path: () => filePath,
        exists: () => filesystem.exists(filePath),
        read: () => readJsonFile<unknown>(filesystem, filePath) as T | null,
        decode: (decoder) => {
          const value = readJsonFile<unknown>(filesystem, filePath);
          return value === null ? null : decodeValue(value, decoder);
        },
        write: (value) => {
          writeJsonFile(filesystem, filePath, value);
          return value;
        },
        remove: () => {
          filesystem.remove(filePath);
        },
      };
    },
    collection: <T = unknown>(name: string): DataCollectionHandle<T> => {
      const safeName = assertSafeName(name, "collection name");
      const dirPath = path.join(resolveCollectionsDir(workspaceDir), safeName);
      const resolveItemPath = (id: string) => path.join(dirPath, `${assertSafeName(id, "collection id")}.json`);

      return {
        dir: () => dirPath,
        listIds: () => {
          if (!filesystem.exists(dirPath)) return [];
          return fs.readdirSync(dirPath)
            .filter((entry) => entry.endsWith(".json"))
            .map((entry) => entry.slice(0, -".json".length))
            .sort((left, right) => left.localeCompare(right));
        },
        list: () => {
          if (!filesystem.exists(dirPath)) return [];
          return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map((entry) => entry.name.slice(0, -".json".length))
            .sort((left, right) => left.localeCompare(right))
            .map((id) => readJsonFile<unknown>(filesystem, resolveItemPath(id)))
            .filter((value): value is T => value !== null);
        },
        entries: () => {
          if (!filesystem.exists(dirPath)) return [];
          return fs.readdirSync(dirPath, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
            .map((entry) => entry.name.slice(0, -".json".length))
            .sort((left, right) => left.localeCompare(right))
            .map((id) => ({ id, value: readJsonFile<T>(filesystem, resolveItemPath(id)) }))
            .filter((entry): entry is { id: string; value: T } => entry.value !== null);
        },
        get: (id) => readJsonFile<T>(filesystem, resolveItemPath(id)),
        decode: (id, decoder) => {
          const value = readJsonFile<unknown>(filesystem, resolveItemPath(id));
          return value === null ? null : decodeValue(value, decoder);
        },
        put: (id, value) => {
          writeJsonFile(filesystem, resolveItemPath(id), value);
          return value;
        },
        remove: (id) => {
          filesystem.remove(resolveItemPath(id));
        },
      };
    },
    asset(relativePath) {
      const safeRelativePath = assertSafeRelativePath(relativePath);
      const filePath = path.join(resolveAssetsDir(workspaceDir), safeRelativePath);
      return {
        path: () => filePath,
        exists: () => filesystem.exists(filePath),
        readText: () => {
          try {
            return filesystem.readText(filePath);
          } catch {
            return null;
          }
        },
        writeText: (content) => {
          filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
            filesystem.writeTextAtomic(filePath, content);
          });
        },
        readBuffer: () => {
          try {
            return fs.readFileSync(filePath);
          } catch {
            return null;
          }
        },
        writeBuffer: (content) => {
          filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
            filesystem.ensureDir(path.dirname(filePath));
            fs.writeFileSync(filePath, Buffer.from(content));
          });
        },
        remove: () => {
          filesystem.remove(filePath);
        },
      };
    },
  };
}
