import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTextMutation,
  extractManagedBlock,
  inspectManagedBlock,
  listManagedBlockProblems,
  listManagedBlocks,
  mergeManagedBlocks,
  previewDiff,
  previewManagedBlockMutation,
  renderManagedBlock,
} from "./managed-blocks.ts";

test("managed block mutation replaces the owned block without touching the rest", () => {
  const original = [
    "# SOUL",
    "",
    renderManagedBlock("persona", "old"),
    "",
    "user text",
  ].join("\n");

  const after = applyTextMutation({
    originalContent: original,
    mode: "managed_block",
    blockId: "persona",
    content: "new",
  });

  assert.match(after, /new/);
  assert.match(after, /user text/);
  assert.match(extractManagedBlock(after, "persona"), /new/);
});

test("anchor-based insertion throws when the anchor is missing", () => {
  assert.throws(() => applyTextMutation({
    originalContent: "hello",
    mode: "insert_before_anchor",
    anchor: "missing",
    content: "x",
  }));
});

test("previewDiff reports changes", () => {
  const diff = previewDiff("a", "b");
  assert.equal(diff.changed, true);
  assert.equal(diff.before, "a");
  assert.equal(diff.after, "b");
});

test("inspectManagedBlock and listManagedBlocks expose block ranges and inner content", () => {
  const content = [
    "header",
    renderManagedBlock("persona", "alpha"),
    "",
    renderManagedBlock("rules", "beta"),
  ].join("\n");

  const block = inspectManagedBlock(content, "persona");
  assert.equal(block.exists, true);
  assert.equal(block.blockId, "persona");
  assert.match(block.content, /alpha/);
  assert.equal(block.innerContent, "alpha");

  const blocks = listManagedBlocks(content);
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((entry) => entry.blockId), ["persona", "rules"]);
});

test("previewManagedBlockMutation reports the final block diff", () => {
  const preview = previewManagedBlockMutation(
    renderManagedBlock("persona", "old"),
    "persona",
    "new"
  );

  assert.equal(preview.blockId, "persona");
  assert.equal(preview.changed, true);
  assert.equal(preview.exists, true);
  assert.match(preview.after, /new/);
});

test("listManagedBlockProblems detects malformed and duplicate markers", () => {
  const content = [
    "<!-- CLAWJS:tone:START -->",
    "kind",
    "<!-- CLAWJS:tone:START -->",
    "extra",
    "<!-- CLAWJS:tone:END -->",
    "<!-- CLAWJS:persona:END -->",
  ].join("\n");

  const problems = listManagedBlockProblems(content);
  assert.deepEqual(problems.map((problem) => problem.kind), [
    "duplicate_start",
    "missing_start",
  ]);
});

test("mergeManagedBlocks preserves original managed content when the edited file changes it", () => {
  const original = [
    "# USER",
    "",
    renderManagedBlock("persona", "trusted"),
    "",
    "free text",
  ].join("\n");
  const edited = [
    "# USER",
    "",
    renderManagedBlock("persona", "overwritten"),
    "",
    "updated free text",
  ].join("\n");

  const merged = mergeManagedBlocks(original, edited);
  assert.match(merged, /trusted/);
  assert.doesNotMatch(merged, /overwritten/);
  assert.match(merged, /updated free text/);
});

test("mergeManagedBlocks restores missing managed blocks when they were deleted from the edited file", () => {
  const original = [
    renderManagedBlock("persona", "trusted"),
    "",
    "free text",
  ].join("\n");

  const merged = mergeManagedBlocks(original, "free text changed");
  assert.match(merged, /trusted/);
  assert.match(merged, /free text changed/);
});
