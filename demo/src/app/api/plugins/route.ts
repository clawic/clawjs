import { NextResponse } from "next/server";
import { readCollection, writeCollection, generateId, type Plugin } from "@/lib/demo-store";

const COLLECTION = "plugins";

function seedPlugins(): Plugin[] {
  const now = Date.now();
  const plugins: Plugin[] = [
    {
      id: generateId(),
      name: "web-search",
      version: "1.2.0",
      description: "Search the web using multiple providers and return summarized results.",
      status: "active",
      config: { provider: "google", maxResults: 10, safeSearch: true },
      installedAt: now - 86400000 * 14,
      lastActivity: now - 3600000,
    },
    {
      id: generateId(),
      name: "calendar-sync",
      version: "0.9.1",
      description: "Bi-directional sync with Google Calendar and Outlook.",
      status: "active",
      config: { syncInterval: 300, calendars: ["primary"], notifications: true },
      installedAt: now - 86400000 * 7,
      lastActivity: now - 1800000,
    },
    {
      id: generateId(),
      name: "code-runner",
      version: "2.0.3",
      description: "Execute code snippets in sandboxed containers (Python, Node, Go).",
      status: "inactive",
      config: { timeout: 30, allowedLanguages: ["python", "javascript", "go"], memoryLimit: "512MB" },
      installedAt: now - 86400000 * 30,
      lastActivity: now - 86400000 * 3,
    },
  ];
  writeCollection(COLLECTION, plugins);
  return plugins;
}

export async function GET() {
  let plugins = readCollection<Plugin>(COLLECTION);
  if (plugins.length === 0) {
    plugins = seedPlugins();
  }
  return NextResponse.json({ plugins });
}

export async function POST(request: Request) {
  const body = await request.json();
  const plugins = readCollection<Plugin>(COLLECTION);
  const plugin: Plugin = {
    id: generateId(),
    name: body.name || "unnamed-plugin",
    version: body.version || "0.1.0",
    description: body.description || "",
    status: "inactive",
    config: body.config || {},
    installedAt: Date.now(),
  };
  plugins.push(plugin);
  writeCollection(COLLECTION, plugins);
  return NextResponse.json(plugin);
}

export async function PUT(request: Request) {
  const body = await request.json();
  const plugins = readCollection<Plugin>(COLLECTION);
  const idx = plugins.findIndex((p) => p.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  plugins[idx] = { ...plugins[idx], ...body, lastActivity: Date.now() };
  writeCollection(COLLECTION, plugins);
  return NextResponse.json(plugins[idx]);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const plugins = readCollection<Plugin>(COLLECTION);
  writeCollection(COLLECTION, plugins.filter((p) => p.id !== id));
  return NextResponse.json({ ok: true });
}
