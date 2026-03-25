import { execFile } from "child_process";
import { NextResponse } from "next/server";
import Database from "better-sqlite3";
import { isE2EEnabled } from "@/lib/e2e";
import { getUserConfig, resolvePath } from "@/lib/user-config";
import { openDb } from "@/lib/safe-db";
import { findCommand } from "@/lib/platform";

export interface WhatsAppChat {
  name: string;
  isGroup: boolean;
  messageCount: number;
}

interface WacliChatEntry {
  JID: string;
  Kind: string;
  Name: string;
  LastMessageTS: string;
}

/** Fast path: ask wacli CLI for the chat list (available immediately after auth). */
async function chatsFromCli(): Promise<WhatsAppChat[] | null> {
  const binary = await findCommand("wacli");
  if (!binary) return null;

  return new Promise((resolve) => {
    execFile(
      binary,
      ["--json", "chats", "list", "--limit", "500"],
      { timeout: 10_000, maxBuffer: 5 * 1024 * 1024 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        try {
          const parsed = JSON.parse(stdout) as { success?: boolean; data?: WacliChatEntry[] };
          if (!parsed.success || !Array.isArray(parsed.data)) { resolve(null); return; }

          const chats: WhatsAppChat[] = parsed.data
            .filter((c) => c.Name && c.Name.length > 2 && !c.Name.includes("@"))
            .map((c) => ({
              name: c.Name,
              isGroup: c.Kind === "group",
              messageCount: 0,
            }));

          resolve(chats.length > 0 ? chats : null);
        } catch {
          resolve(null);
        }
      },
    );
  });
}

/** Slow path: query the messages table in the wacli SQLite DB. */
function chatsFromDb(): WhatsAppChat[] {
  const config = getUserConfig();
  const dbPath = resolvePath(config.dataSources.wacliDbPath);
  if (!dbPath) return [];

  let db: Database.Database;
  try {
    db = openDb(dbPath);
  } catch {
    return [];
  }

  try {
    const rows = db.prepare(`
      SELECT chat_name, chat_jid, COUNT(*) as msg_count
      FROM messages
      WHERE chat_name IS NOT NULL AND chat_name != ''
      GROUP BY chat_jid
      ORDER BY msg_count DESC
    `).all() as Array<{ chat_name: string; chat_jid: string; msg_count: number }>;

    return rows
      .filter((r) => r.chat_name && r.chat_name.length > 2 && !/^[\s.\-_!?]+$/.test(r.chat_name))
      .map((r) => ({
        name: r.chat_name,
        isGroup: r.chat_jid.endsWith("@g.us"),
        messageCount: r.msg_count,
      }));
  } finally {
    db.close();
  }
}

export async function GET() {
  try {
    if (isE2EEnabled()) {
      return NextResponse.json({
        chats: [
          { name: "Product Core", isGroup: true, messageCount: 24 },
          { name: "Nora", isGroup: false, messageCount: 12 },
          { name: "Research Ops", isGroup: true, messageCount: 9 },
        ],
      });
    }

    // Try CLI first (fast, works right after auth before sync completes)
    const cliChats = await chatsFromCli();
    if (cliChats) return NextResponse.json({ chats: cliChats });

    // Fallback to DB query
    const dbChats = chatsFromDb();
    return NextResponse.json({ chats: dbChats });
  } catch {
    return NextResponse.json({ chats: [] });
  }
}
