import test from "node:test";
import assert from "node:assert/strict";

import { buildOrchestrationSnapshot } from "./orchestration.ts";
import { createMockRuntimeCompatReport, createMockRuntimeProbeStatus } from "./runtime/test-helpers.ts";

test("buildOrchestrationSnapshot produces readiness and actions", () => {
  const snapshot = buildOrchestrationSnapshot({
    runtime: createMockRuntimeProbeStatus({
      adapter: "openclaw",
      runtimeName: "OpenClaw",
      version: "1.2.3",
      cliAvailable: true,
      gatewayAvailable: true,
      capabilities: {
        version: true,
        modelsStatus: true,
        agentsList: true,
        gatewayCall: true,
      },
      diagnostics: {},
    }),
    compat: createMockRuntimeCompatReport({
      runtimeAdapter: "openclaw",
      runtimeVersion: "1.2.3",
      capabilities: {
        version: true,
        modelsStatus: true,
        agentsList: true,
        gatewayCall: true,
      },
      degraded: false,
      issues: [],
    }),
    doctor: {
      ok: true,
      runtime: createMockRuntimeProbeStatus({
        adapter: "openclaw",
        runtimeName: "OpenClaw",
        version: "1.2.3",
        cliAvailable: true,
        gatewayAvailable: true,
        capabilities: {
          version: true,
          modelsStatus: true,
          agentsList: true,
          gatewayCall: true,
        },
        diagnostics: {},
      }),
      compat: createMockRuntimeCompatReport({
        runtimeAdapter: "openclaw",
        runtimeVersion: "1.2.3",
        capabilities: {
          version: true,
          modelsStatus: true,
          agentsList: true,
          gatewayCall: true,
        },
        degraded: false,
        issues: [],
      }),
      issues: [],
      suggestedRepairs: [],
    },
    workspaceReady: true,
    authReady: false,
    modelReady: true,
    fileSyncReady: false,
  });

  assert.equal(snapshot.readiness.overallStatus, "degraded");
  assert.equal(snapshot.states.auth.status, "degraded");
  assert.match(snapshot.readiness.recommendedActions.join(" "), /Authenticate/);
});
