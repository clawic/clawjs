import test from "node:test";
import assert from "node:assert/strict";

import { createTemplateRenderer, renderSettingsTemplate } from "./render.ts";

test("renderSettingsTemplate resolves placeholders deterministically", () => {
  const rendered = renderSettingsTemplate("tone={{tone}}\nprofile={{profile}}\nflags={{flags}}", {
    tone: "direct",
    profile: { b: 2, a: 1 },
    flags: ["x", "y"],
  });

  assert.equal(rendered.includes("tone=direct"), true);
  assert.equal(rendered.includes('"a": 1'), true);
  assert.equal(rendered.includes('["x","y"]'), true);
});

test("createTemplateRenderer returns a reusable deterministic renderer", () => {
  const render = createTemplateRenderer("enabled={{nested.enabled}}");
  assert.equal(render({ nested: { enabled: true } }), "enabled=true");
});
