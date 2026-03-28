import { NextRequest } from "next/server";
import { inspectManagedBlock } from "@clawjs/claw";
import { getClaw } from "@/lib/claw";
import { getE2EWorkspaceFiles, isE2EEnabled, updateE2EWorkspaceFile } from "@/lib/e2e";
import { SOUL_MANAGED_BLOCK_ID, USER_MANAGED_BLOCK_ID } from "@/lib/profile-context";

const SOUL_MANAGED_START = "<!-- OPEN_CLAWJS_SOUL_CONTEXT:START -->";
const SOUL_MANAGED_END = "<!-- OPEN_CLAWJS_SOUL_CONTEXT:END -->";
const USER_MANAGED_START = "<!-- OPEN_CLAWJS_USER_CONTEXT:START -->";
const USER_MANAGED_END = "<!-- OPEN_CLAWJS_USER_CONTEXT:END -->";

/**
 * Extract the managed block from a file's content.
 * Returns the full text between (and including) the start/end markers, or empty string.
 */
function extractManagedBlock(content: string, startMarker: string, endMarker: string): string {
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) return "";
  return content.slice(startIdx, endIdx + endMarker.length);
}

/**
 * Replace the managed block in new content with the original managed block,
 * so that user edits in the advanced editor cannot overwrite locked sections.
 */
function preserveManagedBlock(newContent: string, originalContent: string, blockId: string, startMarker: string, endMarker: string): string {
  const originalManaged = inspectManagedBlock(originalContent, blockId).content;
  const originalBlock = extractManagedBlock(originalContent, startMarker, endMarker);
  const preservedBlock = originalManaged || originalBlock;
  if (!preservedBlock) return newContent;

  const newManaged = inspectManagedBlock(newContent, blockId).content;
  if (newManaged) {
    return newContent.replace(newManaged, preservedBlock);
  }

  const newLegacyBlock = extractManagedBlock(newContent, startMarker, endMarker);
  if (newLegacyBlock) {
    return newContent.replace(newLegacyBlock, preservedBlock);
  }
  // If the user deleted the markers entirely, re-prepend the managed block
  return preservedBlock + "\n\n" + newContent;
}

const MAX_CONTENT_SIZE = 500 * 1024; // 500 KB

const EDITABLE_FILES = [
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "AGENTS.md",
  "TOOLS.md",
  "HEARTBEAT.md",
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  if (isE2EEnabled()) {
    return jsonResponse({ files: getE2EWorkspaceFiles() });
  }

  try {
    const claw = await getClaw();
    const files = EDITABLE_FILES.map((fileName) => {
      let content = "";
      try {
        content = claw.files.readWorkspaceFile(fileName) ?? "";
      } catch {
        // File may not exist yet
      }
      return { fileName, content };
    });
    return jsonResponse({ files });
  } catch {
    return jsonResponse({ error: "Failed to read workspace files" }, 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = (await req.json()) as { fileName?: string; content?: string };
    const { fileName, content } = body;

    if (
      typeof fileName !== "string" ||
      typeof content !== "string" ||
      !EDITABLE_FILES.includes(fileName)
    ) {
      return jsonResponse({ error: "Invalid file name" }, 400);
    }

    if (content.length > MAX_CONTENT_SIZE) {
      return jsonResponse({ error: "Content exceeds 500KB size limit" }, 400);
    }

    if (isE2EEnabled()) {
      updateE2EWorkspaceFile(fileName, content.replace(/\r\n/g, "\n"));
      return jsonResponse({ ok: true });
    }

    const claw = await getClaw();

    let finalContent = content.replace(/\r\n/g, "\n");

    // Preserve managed (locked) blocks so the user cannot overwrite them via the editor
    let originalContent = "";
    try { originalContent = claw.files.readWorkspaceFile(fileName) ?? ""; } catch { /* new file */ }

    if (fileName === "SOUL.md") {
      finalContent = preserveManagedBlock(finalContent, originalContent, SOUL_MANAGED_BLOCK_ID, SOUL_MANAGED_START, SOUL_MANAGED_END);
    } else if (fileName === "USER.md") {
      finalContent = preserveManagedBlock(finalContent, originalContent, USER_MANAGED_BLOCK_ID, USER_MANAGED_START, USER_MANAGED_END);
    }

    claw.files.writeWorkspaceFile(fileName, finalContent);

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: "Failed to save file" }, 500);
  }
}
