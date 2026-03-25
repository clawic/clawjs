import assert from "node:assert/strict";

import { assertValidOutput, exampleInput } from "./contract.js";
import { runSkill, skillMetadata } from "./index.js";

async function main() {
  const output = await runSkill(exampleInput);
  assertValidOutput(output);
  assert.equal(skillMetadata.id, "__APP_SLUG__");
  assert.equal(skillMetadata.name, "__APP_TITLE__");
  assert.match(output.summary, /Customer cannot reset password/);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    skillId: skillMetadata.id,
    verified: true,
  }, null, 2)}\n`);
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
