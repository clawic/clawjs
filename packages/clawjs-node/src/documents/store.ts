import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { randomUUID, createHash } from "crypto";

import type { DocumentIndexStatus, DocumentOrigin, DocumentRecord, DocumentRef, DocumentSearchResult } from "@clawjs/core";

import { NodeFileSystemHost, resolveFileLockPath } from "../host/filesystem.ts";

interface DocumentManifest extends DocumentRecord {}

interface UploadSessionRecord {
  uploadId: string;
  name: string;
  mimeType: string;
  origin: DocumentOrigin;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  createdByMessageId?: string;
  filePath: string;
  createdAt: number;
}

export interface RegisterDocumentPathInput {
  filePath: string;
  name?: string;
  mimeType?: string;
  origin?: DocumentOrigin;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  createdByMessageId?: string;
}

export interface UploadDocumentInput {
  name: string;
  mimeType: string;
  data: string | Uint8Array;
  origin?: DocumentOrigin;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  createdByMessageId?: string;
}

export interface BeginDocumentUploadInput {
  name: string;
  mimeType: string;
  origin?: DocumentOrigin;
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  sessionId?: string;
  createdByMessageId?: string;
}

export interface DocumentDownloadResult {
  document: DocumentRecord;
  filePath: string;
  buffer: Buffer;
}

export interface DocumentSearchInput {
  query: string;
  limit?: number;
  sessionId?: string;
}

export interface DocumentStore {
  list(options?: { sessionId?: string }): DocumentRecord[];
  get(documentId: string): DocumentRecord | null;
  getMany(documentIds: string[]): DocumentRecord[];
  resolveRefs(documentIds: string[]): DocumentRef[];
  upload(input: UploadDocumentInput): DocumentRecord;
  registerPath(input: RegisterDocumentPathInput): DocumentRecord;
  beginUpload(input: BeginDocumentUploadInput): { uploadId: string };
  appendUploadChunk(uploadId: string, chunkBase64: string): { uploadId: string; appended: number };
  commitUpload(uploadId: string): DocumentRecord;
  download(documentId: string): DocumentDownloadResult | null;
  search(input: DocumentSearchInput): DocumentSearchResult[];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeWorkspacePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function documentsRoot(workspaceDir: string): string {
  return path.join(workspaceDir, ".clawjs", "documents");
}

function manifestsDir(workspaceDir: string): string {
  return documentsRoot(workspaceDir);
}

function manifestPath(workspaceDir: string, documentId: string): string {
  return path.join(manifestsDir(workspaceDir), `${documentId}.json`);
}

function uploadsDir(workspaceDir: string): string {
  return path.join(documentsRoot(workspaceDir), "uploads");
}

function uploadMetaPath(workspaceDir: string, uploadId: string): string {
  return path.join(uploadsDir(workspaceDir), `${uploadId}.json`);
}

function uploadDataPath(workspaceDir: string, uploadId: string): string {
  return path.join(uploadsDir(workspaceDir), `${uploadId}.bin`);
}

function documentBlobDir(workspaceDir: string): string {
  return path.join(workspaceDir, "documents", "blobs");
}

function documentBlobPath(workspaceDir: string, sha256: string, extension: string): string {
  return path.join(documentBlobDir(workspaceDir), `${sha256}${extension}`);
}

function documentIndexDir(workspaceDir: string): string {
  return path.join(documentsRoot(workspaceDir), "index");
}

function documentIndexPath(workspaceDir: string, documentId: string): string {
  return path.join(documentIndexDir(workspaceDir), `${documentId}.md`);
}

function safeFileName(name: string): string {
  return name.trim().replace(/[\/\\]/g, "-") || "document";
}

function inferExtension(name: string, mimeType: string): string {
  const fromName = path.extname(name || "").trim();
  if (fromName) return fromName.toLowerCase();

  switch (mimeType.toLowerCase()) {
    case "text/plain":
      return ".txt";
    case "text/markdown":
      return ".md";
    case "application/json":
      return ".json";
    case "text/csv":
      return ".csv";
    case "application/pdf":
      return ".pdf";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return ".docx";
    default:
      return "";
  }
}

function detectMimeType(filePath: string, fallback = "application/octet-stream"): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".txt":
      return "text/plain";
    case ".md":
      return "text/markdown";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return fallback;
  }
}

function toBuffer(data: string | Uint8Array): Buffer {
  if (typeof data !== "string") return Buffer.from(data);
  const trimmed = data.trim();
  if (trimmed.startsWith("data:")) {
    const [, base64Data = ""] = trimmed.split(",", 2);
    return Buffer.from(base64Data, "base64");
  }
  return Buffer.from(trimmed, "base64");
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function tryReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJson(filesystem: NodeFileSystemHost, filePath: string, value: unknown): void {
  filesystem.withLockRetry(resolveFileLockPath(filePath), () => {
    filesystem.writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
  });
}

function listManifestIds(workspaceDir: string): string[] {
  const dir = manifestsDir(workspaceDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith(".json"))
    .filter((entry) => !entry.includes(path.sep))
    .filter((entry) => entry !== "uploads")
    .map((entry) => entry.slice(0, -".json".length))
    .sort((left, right) => left.localeCompare(right));
}

function readManifest(workspaceDir: string, documentId: string): DocumentManifest | null {
  return tryReadJson<DocumentManifest>(manifestPath(workspaceDir, documentId));
}

function readUploadSession(workspaceDir: string, uploadId: string): UploadSessionRecord | null {
  return tryReadJson<UploadSessionRecord>(uploadMetaPath(workspaceDir, uploadId));
}

function stripXml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPdfText(filePath: string): string {
  try {
    return execFileSync("/usr/bin/strings", [filePath], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    }).trim();
  } catch {
    return "";
  }
}

function extractDocxText(filePath: string): string {
  try {
    const xml = execFileSync("/usr/bin/unzip", ["-p", filePath, "word/document.xml"], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return stripXml(xml);
  } catch {
    return "";
  }
}

function extractTextContent(filePath: string, mimeType: string): { status: DocumentIndexStatus; text: string } {
  const normalizedMime = mimeType.toLowerCase();

  try {
    if (
      normalizedMime === "text/plain"
      || normalizedMime === "text/markdown"
      || normalizedMime === "application/json"
      || normalizedMime === "text/csv"
    ) {
      return { status: "indexed", text: fs.readFileSync(filePath, "utf8").trim() };
    }

    if (normalizedMime === "application/pdf") {
      const text = extractPdfText(filePath);
      return text ? { status: "indexed", text } : { status: "unsupported", text: "" };
    }

    if (normalizedMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const text = extractDocxText(filePath);
      return text ? { status: "indexed", text } : { status: "unsupported", text: "" };
    }
  } catch {
    return { status: "error", text: "" };
  }

  return { status: "unsupported", text: "" };
}

function buildIndexMarkdown(document: DocumentRecord, text: string): string {
  return [
    `# ${document.name}`,
    "",
    `- Document ID: ${document.documentId}`,
    `- MIME Type: ${document.mimeType}`,
    `- SHA256: ${document.sha256 ?? ""}`,
    `- Storage Path: ${document.storage.path}`,
    "",
    text.trim(),
    "",
  ].join("\n");
}

function scoreTextMatch(text: string, query: string): number {
  if (!text || !query) return 0;
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  const occurrences = haystack.split(needle).length - 1;
  return occurrences > 0 ? occurrences * 10 : 0;
}

function snippetFromText(text: string, query: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  const queryLower = query.toLowerCase();
  const index = lower.indexOf(queryLower);
  if (index === -1) {
    return normalized.length > 180 ? `${normalized.slice(0, 177).trim()}...` : normalized;
  }
  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, index + query.length + 60);
  const snippet = normalized.slice(start, end).trim();
  return `${start > 0 ? "..." : ""}${snippet}${end < normalized.length ? "..." : ""}`;
}

function isInsideWorkspace(workspaceDir: string, targetPath: string): boolean {
  const resolvedWorkspace = path.resolve(workspaceDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget === resolvedWorkspace || resolvedTarget.startsWith(`${resolvedWorkspace}${path.sep}`);
}

function resolveDocumentRef(document: DocumentRecord): DocumentRef {
  return {
    documentId: document.documentId,
    name: document.name,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    ...(document.sha256 ? { sha256: document.sha256 } : {}),
  };
}

export function createDocumentStore(
  workspaceDir: string,
  filesystem = new NodeFileSystemHost(),
): DocumentStore {
  function ensureStructure(): void {
    filesystem.ensureDir(manifestsDir(workspaceDir));
    filesystem.ensureDir(documentIndexDir(workspaceDir));
    filesystem.ensureDir(documentBlobDir(workspaceDir));
    filesystem.ensureDir(uploadsDir(workspaceDir));
  }

  function listManifests(): DocumentManifest[] {
    ensureStructure();
    return listManifestIds(workspaceDir)
      .map((id) => readManifest(workspaceDir, id))
      .filter(Boolean) as DocumentManifest[];
  }

  function writeIndex(document: DocumentRecord, sourcePath: string): DocumentRecord {
    const extraction = extractTextContent(sourcePath, document.mimeType);
    const next: DocumentRecord = {
      ...document,
      indexStatus: extraction.status,
      ...(extraction.status === "indexed" ? { textPath: normalizeWorkspacePath(documentIndexPath(workspaceDir, document.documentId)) } : {}),
    };

    if (extraction.status === "indexed") {
      const indexPath = documentIndexPath(workspaceDir, document.documentId);
      filesystem.withLockRetry(resolveFileLockPath(indexPath), () => {
        filesystem.writeTextAtomic(indexPath, buildIndexMarkdown(next, extraction.text));
      });
    }

    return next;
  }

  function persistManifest(document: DocumentRecord): DocumentRecord {
    ensureStructure();
    writeJson(filesystem, manifestPath(workspaceDir, document.documentId), document);
    return document;
  }

  function registerResolvedPath(input: RegisterDocumentPathInput, resolvedPath: string, storagePath: string, storageKind: "workspace_path" | "blob"): DocumentRecord {
    const stats = fs.statSync(resolvedPath);
    const buffer = fs.readFileSync(resolvedPath);
    const sha256 = hashBuffer(buffer);
    const documentId = randomUUID();
    const name = safeFileName(input.name ?? path.basename(resolvedPath));
    const mimeType = input.mimeType ?? detectMimeType(resolvedPath);

    const base: DocumentRecord = {
      documentId,
      name,
      mimeType,
      sizeBytes: stats.size,
      sha256,
      origin: input.origin ?? "imported",
      storage: {
        kind: storageKind,
        path: normalizeWorkspacePath(storagePath),
      },
      createdAt: Date.now(),
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.createdByMessageId ? { createdByMessageId: input.createdByMessageId } : {}),
      indexStatus: "pending",
    };

    return persistManifest(writeIndex(base, resolvedPath));
  }

  function findDocument(documentId: string): DocumentManifest | null {
    return readManifest(workspaceDir, documentId);
  }

  return {
    list(options = {}) {
      return listManifests()
        .filter((document) => !options.sessionId || document.sessionId === options.sessionId)
        .sort((left, right) => (
          right.createdAt - left.createdAt
          || left.name.localeCompare(right.name)
        ));
    },
    get(documentId) {
      return findDocument(documentId);
    },
    getMany(documentIds) {
      return documentIds
        .map((documentId) => findDocument(documentId))
        .filter(Boolean) as DocumentRecord[];
    },
    resolveRefs(documentIds) {
      return this.getMany(documentIds).map((document) => resolveDocumentRef(document));
    },
    upload(input) {
      ensureStructure();
      const buffer = toBuffer(input.data);
      const sha256 = hashBuffer(buffer);
      const extension = inferExtension(input.name, input.mimeType);
      const blobPath = documentBlobPath(workspaceDir, sha256, extension);
      filesystem.withLockRetry(resolveFileLockPath(blobPath), () => {
        if (!filesystem.exists(blobPath)) {
          filesystem.ensureDir(path.dirname(blobPath));
          fs.writeFileSync(blobPath, buffer);
        }
      });
      return registerResolvedPath({
        ...input,
        origin: input.origin ?? "user_upload",
        filePath: blobPath,
      }, blobPath, blobPath, "blob");
    },
    registerPath(input) {
      ensureStructure();
      const resolvedPath = path.isAbsolute(input.filePath)
        ? path.resolve(input.filePath)
        : path.resolve(workspaceDir, input.filePath);
      if (!filesystem.exists(resolvedPath)) {
        throw new Error(`Document path does not exist: ${input.filePath}`);
      }

      if (isInsideWorkspace(workspaceDir, resolvedPath)) {
        return registerResolvedPath(input, resolvedPath, resolvedPath, "workspace_path");
      }

      const mimeType = input.mimeType ?? detectMimeType(resolvedPath);
      const name = input.name ?? path.basename(resolvedPath);
      const buffer = fs.readFileSync(resolvedPath);
      return this.upload({
        name,
        mimeType,
        data: buffer,
        origin: input.origin ?? "imported",
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.createdByMessageId ? { createdByMessageId: input.createdByMessageId } : {}),
      });
    },
    beginUpload(input) {
      ensureStructure();
      const uploadId = randomUUID();
      const record: UploadSessionRecord = {
        uploadId,
        name: safeFileName(input.name),
        mimeType: input.mimeType,
        origin: input.origin ?? "user_upload",
        filePath: uploadDataPath(workspaceDir, uploadId),
        createdAt: Date.now(),
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.agentId ? { agentId: input.agentId } : {}),
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        ...(input.createdByMessageId ? { createdByMessageId: input.createdByMessageId } : {}),
      };
      writeJson(filesystem, uploadMetaPath(workspaceDir, uploadId), record);
      fs.writeFileSync(record.filePath, Buffer.alloc(0));
      return { uploadId };
    },
    appendUploadChunk(uploadId, chunkBase64) {
      const record = readUploadSession(workspaceDir, uploadId);
      if (!record) {
        throw new Error(`Unknown upload session: ${uploadId}`);
      }
      const chunk = Buffer.from(chunkBase64, "base64");
      fs.appendFileSync(record.filePath, chunk);
      return { uploadId, appended: chunk.byteLength };
    },
    commitUpload(uploadId) {
      const record = readUploadSession(workspaceDir, uploadId);
      if (!record) {
        throw new Error(`Unknown upload session: ${uploadId}`);
      }
      const document = this.registerPath({
        filePath: record.filePath,
        name: record.name,
        mimeType: record.mimeType,
        origin: record.origin,
        ...(record.workspaceId ? { workspaceId: record.workspaceId } : {}),
        ...(record.projectId ? { projectId: record.projectId } : {}),
        ...(record.agentId ? { agentId: record.agentId } : {}),
        ...(record.sessionId ? { sessionId: record.sessionId } : {}),
        ...(record.createdByMessageId ? { createdByMessageId: record.createdByMessageId } : {}),
      });
      filesystem.remove(uploadMetaPath(workspaceDir, uploadId));
      filesystem.remove(record.filePath);
      return document;
    },
    download(documentId) {
      const document = findDocument(documentId);
      if (!document) return null;
      const filePath = path.isAbsolute(document.storage.path)
        ? document.storage.path
        : path.resolve(workspaceDir, document.storage.path);
      if (!filesystem.exists(filePath)) return null;
      return {
        document,
        filePath,
        buffer: fs.readFileSync(filePath),
      };
    },
    search(input) {
      const query = normalizeText(input.query);
      if (!query) return [];

      return this.list({ sessionId: input.sessionId })
        .map((document) => {
          if (document.indexStatus !== "indexed" || !document.textPath) return null;
          const indexPath = path.isAbsolute(document.textPath)
            ? document.textPath
            : path.resolve(workspaceDir, document.textPath);
          if (!filesystem.exists(indexPath)) return null;
          const text = fs.readFileSync(indexPath, "utf8");
          const score = scoreTextMatch(text, query);
          if (score <= 0) return null;
          return {
            ...document,
            snippet: snippetFromText(text, query),
            score,
            sourcePath: normalizeWorkspacePath(indexPath),
          } satisfies DocumentSearchResult;
        })
        .filter(Boolean)
        .sort((left, right) => (
          (right?.score ?? 0) - (left?.score ?? 0)
          || (right?.createdAt ?? 0) - (left?.createdAt ?? 0)
        ))
        .slice(0, Math.max(1, input.limit ?? 20)) as DocumentSearchResult[];
    },
  };
}

export function resolveLegacyDocumentRefs(messageId: string, attachments: Array<{ name: string; mimeType: string; data?: string }>): DocumentRef[] {
  return attachments.map((attachment, index) => {
    const payload = typeof attachment.data === "string" && attachment.data.trim()
      ? attachment.data.trim()
      : `${messageId}:${attachment.name}:${index}`;
    return {
      documentId: `legacy-${messageId}-${index}`,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: Buffer.byteLength(payload, "utf8"),
    };
  });
}

export function createTemporaryDownloadPath(document: DocumentRecord): string {
  return path.join(os.tmpdir(), `clawjs-document-${document.documentId}${inferExtension(document.name, document.mimeType)}`);
}
