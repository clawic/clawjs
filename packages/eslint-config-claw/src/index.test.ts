import test from "node:test";
import assert from "node:assert/strict";

import claw, { javascript, recommended } from "./index.ts";

function isNamedConfig(value: object): value is {
  name: string;
  ignores?: string[];
  rules?: Record<string, unknown>;
} {
  return "name" in value && typeof value.name === "string";
}

function findNamedConfig(configs: object[], name: string) {
  return configs.find((entry): entry is {
    name: string;
    ignores?: string[];
    rules?: Record<string, unknown>;
  } => isNamedConfig(entry) && entry.name === name);
}

test("default export matches the recommended preset", () => {
  assert.deepEqual(claw, recommended);
});

test("javascript preset excludes typescript-eslint rules", () => {
  const javascriptConfig = findNamedConfig(javascript, "claw/base");
  assert.ok(javascriptConfig?.rules);
  assert.equal(javascriptConfig.rules["prefer-const"], "error");

  const hasTypeScriptPreset = javascript.some((entry) => isNamedConfig(entry) && entry.name === "claw/typescript");
  assert.equal(hasTypeScriptPreset, false);
});

test("recommended preset includes TypeScript linting and common ignores", () => {
  const ignoresConfig = findNamedConfig(recommended, "claw/ignores");
  assert.ok(ignoresConfig?.ignores);
  assert.equal(ignoresConfig.ignores.includes("**/dist/**"), true);

  const typeScriptConfig = findNamedConfig(recommended, "claw/typescript");
  assert.ok(typeScriptConfig?.rules);
  assert.equal(typeScriptConfig.rules["no-unused-vars"], "off");
  assert.equal(typeScriptConfig.rules["@typescript-eslint/consistent-type-imports"], "error");
});
