import test from "node:test";
import assert from "node:assert/strict";

import { buildCompatDriftReport } from "./drift.ts";
import { createMockRuntimeCompatReport, createMockRuntimeProbeStatus } from "../runtime/test-helpers.ts";

test("buildCompatDriftReport stays clean when snapshot matches the current runtime", () => {
  const report = buildCompatDriftReport({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-21T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: true,
    },
    diagnostics: {
      versionFamily: "1.2",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }, createMockRuntimeProbeStatus({
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
    diagnostics: {
      versionFamily: "1.2",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }), createMockRuntimeCompatReport({
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
    diagnostics: {
      versionFamily: "1.2",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }));

  assert.equal(report.drifted, false);
  assert.deepEqual(report.issues, []);
});

test("buildCompatDriftReport flags version-family and capability drift", () => {
  const report = buildCompatDriftReport({
    schemaVersion: 1,
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-21T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: true,
      gatewayCall: true,
    },
    diagnostics: {
      versionFamily: "1.2",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }, createMockRuntimeProbeStatus({
    adapter: "openclaw",
    runtimeName: "OpenClaw",
    version: "2.0.0",
    cliAvailable: true,
    gatewayAvailable: false,
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: false,
      gatewayCall: false,
    },
    diagnostics: {
      versionFamily: "2.0",
      capabilitySignature: "agentsList=0|gatewayCall=0|modelsStatus=1|version=1",
    },
  }), createMockRuntimeCompatReport({
    runtimeAdapter: "openclaw",
    runtimeVersion: "2.0.0",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: false,
      gatewayCall: false,
    },
    degraded: true,
    issues: ["OpenClaw gateway is unavailable."],
    diagnostics: {
      versionFamily: "2.0",
      capabilitySignature: "agentsList=0|gatewayCall=0|modelsStatus=1|version=1",
    },
  }));

  assert.equal(report.drifted, true);
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    "runtime_version",
    "version_family",
    "capability_signature",
  ]);
});

test("buildCompatDriftReport detects adapter-family drift beyond openclaw", () => {
  const report = buildCompatDriftReport({
    schemaVersion: 1,
    runtimeAdapter: "proto-claw",
    runtimeVersion: "3.4.5",
    probedAt: "2026-03-21T00:00:00.000Z",
    capabilities: {
      version: true,
      daemon: true,
    },
    diagnostics: {
      versionFamily: "3.4",
      capabilitySignature: "daemon=1|version=1",
    },
  }, createMockRuntimeProbeStatus({
    adapter: "neo-claw",
    runtimeName: "NeoClaw",
    version: "4.0.0",
    cliAvailable: true,
    gatewayAvailable: false,
    capabilities: {
      version: true,
      daemon: false,
    },
    diagnostics: {
      versionFamily: "4.0",
      capabilitySignature: "daemon=0|version=1",
    },
  }), createMockRuntimeCompatReport({
    runtimeAdapter: "neo-claw",
    runtimeVersion: "4.0.0",
    capabilities: {
      version: true,
      daemon: false,
    },
    degraded: true,
    issues: ["NeoClaw daemon is unavailable."],
    diagnostics: {
      versionFamily: "4.0",
      capabilitySignature: "daemon=0|version=1",
    },
  }));

  assert.equal(report.drifted, true);
  assert.deepEqual(report.issues.map((issue) => issue.code), [
    "runtime_adapter",
    "runtime_version",
    "version_family",
    "capability_signature",
  ]);
});
