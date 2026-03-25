import type { FileMutationMode } from "@clawjs/core";

export interface ManagedBlockMarkers {
  start: string;
  end: string;
}

export interface TextMutationInput {
  originalContent: string;
  mode: FileMutationMode;
  content: string;
  anchor?: string;
  blockId?: string;
}

export interface DiffPreview {
  changed: boolean;
  before: string;
  after: string;
}

export interface ManagedBlockInspection {
  blockId: string;
  markers: ManagedBlockMarkers;
  exists: boolean;
  startIndex: number;
  endIndex: number;
  content: string;
  innerContent: string;
}

export interface ManagedBlockPreview extends DiffPreview {
  blockId: string;
  markers: ManagedBlockMarkers;
  exists: boolean;
}

export interface ManagedBlockProblem {
  blockId: string;
  kind: "duplicate_start" | "duplicate_end" | "missing_start" | "missing_end";
  message: string;
}

export interface MergeManagedBlocksOptions {
  blockIds?: string[];
  missingStrategy?: "prepend" | "append";
}

export function managedBlockMarkers(blockId: string): ManagedBlockMarkers {
  return {
    start: `<!-- CLAWJS:${blockId}:START -->`,
    end: `<!-- CLAWJS:${blockId}:END -->`,
  };
}

export function extractManagedBlock(content: string, blockId: string): string {
  return inspectManagedBlock(content, blockId).content;
}

export function renderManagedBlock(blockId: string, blockContent: string): string {
  const markers = managedBlockMarkers(blockId);
  return `${markers.start}\n${blockContent.trim()}\n${markers.end}`;
}

export function inspectManagedBlock(content: string, blockId: string): ManagedBlockInspection {
  const markers = managedBlockMarkers(blockId);
  const startIndex = content.indexOf(markers.start);
  if (startIndex === -1) {
    return {
      blockId,
      markers,
      exists: false,
      startIndex: -1,
      endIndex: -1,
      content: "",
      innerContent: "",
    };
  }

  const searchFrom = startIndex + markers.start.length;
  const endIndex = content.indexOf(markers.end, searchFrom);
  if (endIndex === -1 || endIndex < searchFrom) {
    return {
      blockId,
      markers,
      exists: false,
      startIndex,
      endIndex: -1,
      content: "",
      innerContent: "",
    };
  }

  return {
    blockId,
    markers,
    exists: true,
    startIndex,
    endIndex: endIndex + markers.end.length,
    content: content.slice(startIndex, endIndex + markers.end.length),
    innerContent: normalizeManagedBlockInnerContent(content.slice(searchFrom, endIndex)),
  };
}

function normalizeManagedBlockInnerContent(content: string): string {
  if (content.startsWith("\n")) {
    content = content.slice(1);
  }
  if (content.endsWith("\n")) {
    content = content.slice(0, -1);
  }
  return content;
}

export function listManagedBlocks(content: string): ManagedBlockInspection[] {
  const blocks: ManagedBlockInspection[] = [];
  const startPattern = /<!-- CLAWJS:([^:]+):START -->/g;
  for (const match of content.matchAll(startPattern)) {
    const blockId = match[1];
    const startIndex = match.index ?? content.indexOf(match[0]);
    const inspection = inspectManagedBlock(content.slice(startIndex), blockId);
    if (!inspection.exists) continue;
    blocks.push({
      ...inspection,
      startIndex: inspection.startIndex + startIndex,
      endIndex: inspection.endIndex + startIndex,
    });
  }
  return blocks;
}

export function listManagedBlockProblems(content: string): ManagedBlockProblem[] {
  const lines = content.replace(/\r\n/g, "\n");
  const startMatches = [...lines.matchAll(/<!-- CLAWJS:([^:]+):START -->/g)];
  const endMatches = [...lines.matchAll(/<!-- CLAWJS:([^:]+):END -->/g)];
  const blockIds = new Set([
    ...startMatches.map((match) => match[1]),
    ...endMatches.map((match) => match[1]),
  ]);

  const problems: ManagedBlockProblem[] = [];
  for (const blockId of blockIds) {
    const startCount = startMatches.filter((match) => match[1] === blockId).length;
    const endCount = endMatches.filter((match) => match[1] === blockId).length;

    if (startCount === 0 && endCount > 0) {
      problems.push({
        blockId,
        kind: "missing_start",
        message: `Managed block ${blockId} has an end marker without a start marker.`,
      });
    }
    if (endCount === 0 && startCount > 0) {
      problems.push({
        blockId,
        kind: "missing_end",
        message: `Managed block ${blockId} has a start marker without an end marker.`,
      });
    }
    if (startCount > 1) {
      problems.push({
        blockId,
        kind: "duplicate_start",
        message: `Managed block ${blockId} has duplicate start markers.`,
      });
    }
    if (endCount > 1) {
      problems.push({
        blockId,
        kind: "duplicate_end",
        message: `Managed block ${blockId} has duplicate end markers.`,
      });
    }
  }

  return problems;
}

export function previewManagedBlockMutation(originalContent: string, blockId: string, blockContent: string): ManagedBlockPreview {
  const before = originalContent.replace(/\r\n/g, "\n");
  const after = applyTextMutation({
    originalContent: before,
    mode: "managed_block",
    content: blockContent,
    blockId,
  });
  const inspection = inspectManagedBlock(before, blockId);
  return {
    blockId,
    markers: inspection.markers,
    exists: inspection.exists,
    ...previewDiff(before, after),
  };
}

export function mergeManagedBlocks(
  originalContent: string,
  editedContent: string,
  options: MergeManagedBlocksOptions = {},
): string {
  const original = originalContent.replace(/\r\n/g, "\n");
  let edited = editedContent.replace(/\r\n/g, "\n");
  const blockIds = options.blockIds
    ? [...options.blockIds]
    : listManagedBlocks(original).map((block) => block.blockId);
  const missingBlocks: string[] = [];

  for (const blockId of blockIds) {
    const originalInspection = inspectManagedBlock(original, blockId);
    if (!originalInspection.exists) continue;

    const editedInspection = inspectManagedBlock(edited, blockId);
    if (editedInspection.exists) {
      edited = edited.replace(editedInspection.content, originalInspection.content);
      continue;
    }

    missingBlocks.push(originalInspection.content);
  }

  if (missingBlocks.length === 0) {
    return edited;
  }

  const serializedMissing = missingBlocks.join("\n\n");
  if (options.missingStrategy === "append") {
    return edited.trim()
      ? `${edited.trimEnd()}\n\n${serializedMissing}\n`
      : `${serializedMissing}\n`;
  }

  return edited.trim()
    ? `${serializedMissing}\n\n${edited.trimStart()}`
    : `${serializedMissing}\n`;
}

function replaceManagedBlock(originalContent: string, blockId: string, blockContent: string): string {
  const existing = inspectManagedBlock(originalContent, blockId).content;
  const nextBlock = renderManagedBlock(blockId, blockContent);
  if (!existing) {
    return originalContent.trim()
      ? `${originalContent.trimEnd()}\n\n${nextBlock}\n`
      : `${nextBlock}\n`;
  }
  return `${originalContent.replace(existing, nextBlock).trimEnd()}\n`;
}

function insertRelativeToAnchor(originalContent: string, anchor: string, content: string, direction: "before" | "after"): string {
  const index = originalContent.indexOf(anchor);
  if (index === -1) {
    throw new Error(`Anchor not found: ${anchor}`);
  }

  if (direction === "before") {
    return `${originalContent.slice(0, index)}${content}${originalContent.slice(index)}`;
  }
  return `${originalContent.slice(0, index + anchor.length)}${content}${originalContent.slice(index + anchor.length)}`;
}

export function applyTextMutation(input: TextMutationInput): string {
  const original = input.originalContent.replace(/\r\n/g, "\n");
  const nextContent = input.content.replace(/\r\n/g, "\n");

  switch (input.mode) {
    case "seed_if_missing":
      return original.trim() ? original : `${nextContent.trimEnd()}\n`;
    case "replace_full":
      return `${nextContent.trimEnd()}\n`;
    case "prepend":
      return original.startsWith(nextContent)
        ? original
        : `${nextContent}${original}`;
    case "append":
      return original.endsWith(nextContent)
        ? original
        : `${original}${nextContent}`;
    case "insert_before_anchor":
      if (!input.anchor) throw new Error("anchor is required for insert_before_anchor");
      return insertRelativeToAnchor(original, input.anchor, nextContent, "before");
    case "insert_after_anchor":
      if (!input.anchor) throw new Error("anchor is required for insert_after_anchor");
      return insertRelativeToAnchor(original, input.anchor, nextContent, "after");
    case "managed_block":
      if (!input.blockId) throw new Error("blockId is required for managed_block");
      return replaceManagedBlock(original, input.blockId, nextContent);
    default:
      return original;
  }
}

export function previewDiff(before: string, after: string): DiffPreview {
  return {
    changed: before !== after,
    before,
    after,
  };
}
