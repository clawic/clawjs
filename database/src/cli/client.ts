import fs from "node:fs";

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export interface DatabaseCliOptions {
  baseUrl: string;
  token?: string;
}

export class DatabaseApiClient {
  constructor(private readonly options: DatabaseCliOptions) {}

  private async request(path: string, init: RequestInit = {}): Promise<JsonValue> {
    const headers = new Headers(init.headers);
    if (this.options.token) {
      headers.set("authorization", `Bearer ${this.options.token}`);
    }
    if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await fetch(new URL(path, this.options.baseUrl), {
      ...init,
      headers,
    });
    const isJson = response.headers.get("content-type")?.includes("application/json");
    const payload = isJson ? await response.json() as JsonValue : await response.text();
    if (!response.ok) {
      throw new Error(typeof payload === "string" ? payload : JSON.stringify(payload));
    }
    return payload;
  }

  async login(email: string, password: string): Promise<JsonValue> {
    return await this.request("/v1/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  async listNamespaces(): Promise<JsonValue> {
    return await this.request("/v1/namespaces");
  }

  async createNamespace(input: { id?: string; displayName: string }): Promise<JsonValue> {
    return await this.request("/v1/namespaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async listCollections(namespaceId: string): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/collections`);
  }

  async createCollection(namespaceId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/collections`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateCollection(namespaceId: string, collectionName: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/collections/${collectionName}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  async listRecords(namespaceId: string, collectionName: string, options: { filter?: string; sort?: string } = {}): Promise<JsonValue> {
    const url = new URL(`/v1/namespaces/${namespaceId}/collections/${collectionName}/records`, this.options.baseUrl);
    if (options.filter) url.searchParams.set("filter", options.filter);
    if (options.sort) url.searchParams.set("sort", options.sort);
    return await this.request(url.pathname + url.search);
  }

  async createRecord(namespaceId: string, collectionName: string, payload: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/collections/${collectionName}/records`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async updateRecord(namespaceId: string, collectionName: string, recordId: string, payload: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/collections/${collectionName}/records/${recordId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async deleteRecord(namespaceId: string, collectionName: string, recordId: string): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/collections/${collectionName}/records/${recordId}`, {
      method: "DELETE",
    });
  }

  async listTokens(namespaceId: string): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/tokens`);
  }

  async createToken(namespaceId: string, input: Record<string, unknown>): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/tokens`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async revokeToken(namespaceId: string, tokenId: string): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/tokens/${tokenId}/revoke`, {
      method: "POST",
    });
  }

  async listFiles(namespaceId: string): Promise<JsonValue> {
    return await this.request(`/v1/namespaces/${namespaceId}/files`);
  }

  async uploadFile(input: {
    namespaceId: string;
    filePath: string;
    collectionName?: string;
    recordId?: string;
  }): Promise<JsonValue> {
    const form = new FormData();
    form.set("namespaceId", input.namespaceId);
    if (input.collectionName) form.set("collectionName", input.collectionName);
    if (input.recordId) form.set("recordId", input.recordId);
    form.set("file", new Blob([fs.readFileSync(input.filePath)]), input.filePath.split("/").pop() || "upload.bin");
    return await this.request("/v1/files", {
      method: "POST",
      body: form,
    });
  }

  async deleteFile(fileId: string): Promise<JsonValue> {
    return await this.request(`/v1/files/${fileId}`, {
      method: "DELETE",
    });
  }
}
