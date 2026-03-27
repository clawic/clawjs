import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { migrateCompatSnapshot, readCompatSnapshot, resolveCompatSnapshotPath, writeCompatSnapshot } from "./store.ts";
import { createMockRuntimeCompatReport, createMockRuntimeProbeStatus } from "../runtime/test-helpers.ts";

test("compat snapshots round-trip inside the workspace", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-"));
  const snapshot = writeCompatSnapshot(workspaceDir, createMockRuntimeProbeStatus({
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
      versionParseStrategy: "semver-token",
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
      runtimeAdapter: "openclaw",
      versionFamily: "1.2",
      capabilitySignature: "agentsList=1|gatewayCall=1|modelsStatus=1|version=1",
    },
  }));

  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceDir)), true);
  assert.equal(readCompatSnapshot(workspaceDir)?.runtimeVersion, snapshot.runtimeVersion);
  assert.equal(readCompatSnapshot(workspaceDir)?.diagnostics?.versionFamily, "1.2");
  assert.equal(readCompatSnapshot(workspaceDir)?.diagnostics?.capabilitySignature, "agentsList=1|gatewayCall=1|modelsStatus=1|version=1");
});

test("compat snapshots preserve non-openclaw adapter families", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-alt-family-"));
  const snapshot = writeCompatSnapshot(workspaceDir, createMockRuntimeProbeStatus({
    adapter: "proto-claw",
    runtimeName: "ProtoClaw",
    version: "9.1.0",
    cliAvailable: true,
    gatewayAvailable: false,
    capabilities: {
      version: true,
      threads: true,
    },
    diagnostics: {
      versionFamily: "9.1",
      capabilitySignature: "threads=1|version=1",
    },
  }), createMockRuntimeCompatReport({
    runtimeAdapter: "proto-claw",
    runtimeVersion: "9.1.0",
    capabilities: {
      version: true,
      threads: true,
    },
    degraded: false,
    issues: [],
    diagnostics: {
      versionFamily: "9.1",
      capabilitySignature: "threads=1|version=1",
    },
  }));

  assert.equal(snapshot.runtimeAdapter, "proto-claw");
  assert.equal(readCompatSnapshot(workspaceDir)?.runtimeAdapter, "proto-claw");
});

test("compat snapshot migration normalizes current-path payloads", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-migrate-"));
  const currentSnapshotPath = resolveCompatSnapshotPath(workspaceDir);
  fs.mkdirSync(path.dirname(currentSnapshotPath), { recursive: true });
  fs.writeFileSync(currentSnapshotPath, JSON.stringify({
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: false,
      gatewayCall: true,
    },
    diagnostics: {
      legacy: true,
    },
  }, null, 2));

  const migrated = migrateCompatSnapshot(workspaceDir);

  assert.equal(migrated.migrated, true);
  assert.equal(migrated.sourcePath, currentSnapshotPath);
  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceDir)), true);
  assert.equal(readCompatSnapshot(workspaceDir)?.runtimeVersion, "1.2.3");
  assert.equal(readCompatSnapshot(workspaceDir)?.schemaVersion, 1);
});

test("compat snapshot migration repairs wrapper payloads and capability drift", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-wrapper-"));
  const currentSnapshotPath = resolveCompatSnapshotPath(workspaceDir);
  fs.mkdirSync(path.dirname(currentSnapshotPath), { recursive: true });
  fs.writeFileSync(currentSnapshotPath, JSON.stringify({
    snapshot: {
      runtime: {
        adapter: "openclaw",
        version: "0.9.0",
        probedAt: "2026-03-19T00:00:00.000Z",
        capabilities: {
          version: "true",
          modelsStatus: 1,
          agentsList: {
            status: "ready",
          },
          gatewayCall: "0",
        },
        diagnostics: {
          legacyWrapper: true,
        },
      },
    },
  }, null, 2));

  const migrated = migrateCompatSnapshot(workspaceDir);

  assert.equal(migrated.migrated, true);
  assert.equal(migrated.sourcePath, currentSnapshotPath);
  assert.equal(migrated.snapshot?.runtimeAdapter, "openclaw");
  assert.equal(migrated.snapshot?.runtimeVersion, "0.9.0");
  assert.deepEqual(migrated.snapshot?.capabilities, {
    version: true,
    modelsStatus: true,
    agentsList: true,
    gatewayCall: false,
  });
  assert.equal(readCompatSnapshot(workspaceDir)?.diagnostics?.legacyWrapper, true);
  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceDir)), true);
});

test("compat snapshot migration fills gaps in current-path snapshots", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-incomplete-"));
  const currentSnapshotPath = resolveCompatSnapshotPath(workspaceDir);
  fs.mkdirSync(path.dirname(currentSnapshotPath), { recursive: true });
  fs.writeFileSync(currentSnapshotPath, JSON.stringify({
    schemaVersion: "1",
    capabilities: {
      version: true,
      modelsStatus: "false",
      agentsList: 1,
      gatewayCall: "off",
      ignored: "maybe",
    },
    diagnostics: null,
  }, null, 2));

  const migrated = migrateCompatSnapshot(workspaceDir);

  assert.equal(migrated.migrated, true);
  assert.equal(migrated.sourcePath, currentSnapshotPath);
  assert.equal(migrated.snapshot?.schemaVersion, 1);
  assert.equal(migrated.snapshot?.runtimeAdapter, "unknown");
  assert.equal(migrated.snapshot?.runtimeVersion, null);
  assert.match(migrated.snapshot?.probedAt ?? "", /\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(migrated.snapshot?.capabilities, {
    version: true,
    modelsStatus: false,
    agentsList: true,
    gatewayCall: false,
  });
  assert.equal(readCompatSnapshot(workspaceDir)?.diagnostics, undefined);
  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceDir)), true);
});

test("compat snapshot migration keeps adapter identity for non-openclaw snapshots", () => {
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-other-adapter-"));
  const currentSnapshotPath = resolveCompatSnapshotPath(workspaceDir);
  fs.mkdirSync(path.dirname(currentSnapshotPath), { recursive: true });
  fs.writeFileSync(currentSnapshotPath, JSON.stringify({
    runtimeAdapter: "proto-claw",
    runtimeVersion: "3.4.5",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      daemon: true,
    },
    diagnostics: {
      versionFamily: "3.4",
    },
  }, null, 2));

  const migrated = migrateCompatSnapshot(workspaceDir);

  assert.equal(migrated.migrated, true);
  assert.equal(migrated.snapshot?.runtimeAdapter, "proto-claw");
  assert.equal(readCompatSnapshot(workspaceDir)?.runtimeAdapter, "proto-claw");
});

test("compat snapshot migration stays isolated across sibling workspaces", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "clawjs-compat-isolation-"));
  const workspaceA = path.join(tempRoot, "workspace-a");
  const workspaceB = path.join(tempRoot, "workspace-b");
  const snapshotA = resolveCompatSnapshotPath(workspaceA);
  const snapshotB = resolveCompatSnapshotPath(workspaceB);

  fs.mkdirSync(path.dirname(snapshotA), { recursive: true });
  fs.mkdirSync(path.dirname(snapshotB), { recursive: true });
  fs.writeFileSync(snapshotA, JSON.stringify({
    runtimeAdapter: "openclaw",
    runtimeVersion: "1.2.3",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: true,
      agentsList: false,
      gatewayCall: true,
    },
  }, null, 2));
  fs.writeFileSync(snapshotB, JSON.stringify({
    runtimeAdapter: "openclaw",
    runtimeVersion: "9.9.9",
    probedAt: "2026-03-20T00:00:00.000Z",
    capabilities: {
      version: true,
      modelsStatus: false,
      agentsList: true,
      gatewayCall: false,
    },
  }, null, 2));

  const migratedA = migrateCompatSnapshot(workspaceA);
  const migratedB = migrateCompatSnapshot(workspaceB);

  assert.equal(migratedA.migrated, true);
  assert.equal(migratedB.migrated, true);
  assert.equal(readCompatSnapshot(workspaceA)?.runtimeVersion, "1.2.3");
  assert.equal(readCompatSnapshot(workspaceB)?.runtimeVersion, "9.9.9");
  assert.notEqual(readCompatSnapshot(workspaceA)?.runtimeVersion, readCompatSnapshot(workspaceB)?.runtimeVersion);
  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceA)), true);
  assert.equal(fs.existsSync(resolveCompatSnapshotPath(workspaceB)), true);
});
