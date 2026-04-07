import fs from "node:fs";
import path from "node:path";

export class WorkspaceCompatStore {
  private readonly rootDir: string;

  constructor(workspaceDir: string) {
    this.rootDir = path.join(workspaceDir, ".clawjs", "relay-compat");
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  collectionPath(name: string): string {
    return path.join(this.rootDir, `${name}.json`);
  }

  readCollection<T>(name: string, fallback: T[] = []): T[] {
    const filePath = this.collectionPath(name);
    if (!fs.existsSync(filePath)) return [...fallback];
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      return Array.isArray(parsed) ? parsed as T[] : [...fallback];
    } catch {
      return [...fallback];
    }
  }

  writeCollection<T>(name: string, entries: T[]): void {
    fs.writeFileSync(this.collectionPath(name), `${JSON.stringify(entries, null, 2)}\n`);
  }
}
