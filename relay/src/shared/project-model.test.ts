import test from "node:test";
import assert from "node:assert/strict";

import {
  buildEffectiveAccessPolicy,
  deriveAssignmentWorkspaceId,
  deriveRuntimeAgentId,
} from "./project-model.ts";

test("derive assignment ids stays stable and bounded", () => {
  assert.equal(deriveAssignmentWorkspaceId("mobile-app", "designer"), "mobile-app-designer");
  assert.equal(deriveRuntimeAgentId("mobile-app", "designer"), "designer-mobile-app");

  const longProject = "project-with-a-very-long-name-that-needs-to-be-shortened-because-openclaw-ids-should-stay-bounded";
  const longAgent = "agent-with-an-even-longer-role-name-that-needs-a-stable-hash-suffix";
  const workspaceId = deriveAssignmentWorkspaceId(longProject, longAgent);
  const runtimeAgentId = deriveRuntimeAgentId(longProject, longAgent);

  assert.equal(workspaceId.length <= 64, true);
  assert.equal(runtimeAgentId.length <= 64, true);
  assert.equal(workspaceId, deriveAssignmentWorkspaceId(longProject, longAgent));
  assert.equal(runtimeAgentId, deriveRuntimeAgentId(longProject, longAgent));
});

test("effective access policy preserves deny precedence", () => {
  const policy = buildEffectiveAccessPolicy({
    projectResourceRefs: [
      { id: "docs", mode: "allow", label: "Docs" },
      { id: "logs", mode: "allow" },
    ],
    agentResourceRefs: [
      { id: "deploy", mode: "allow" },
      { id: "logs", mode: "deny" },
    ],
    assignmentSecretRefs: [
      { id: "cloudflare", mode: "allow" },
      { id: "slack", mode: "deny" },
    ],
    projectSecretRefs: [
      { id: "slack", mode: "allow" },
    ],
  });

  assert.deepEqual(policy.resources, [
    { id: "deploy", mode: "allow" },
    { id: "docs", mode: "allow", label: "Docs" },
    { id: "logs", mode: "deny" },
  ]);
  assert.deepEqual(policy.secrets, [
    { id: "cloudflare", mode: "allow" },
    { id: "slack", mode: "deny" },
  ]);
});
