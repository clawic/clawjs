import test from "node:test";
import assert from "node:assert/strict";

import { buildCombinedDoctorReport } from "./run.ts";
import { createMockRuntimeCompatReport, createMockRuntimeProbeStatus } from "../runtime/test-helpers.ts";

function runtime(overrides: Parameters<typeof createMockRuntimeProbeStatus>[0]) {
  return createMockRuntimeProbeStatus(overrides);
}

function compat(overrides: Parameters<typeof createMockRuntimeCompatReport>[0]) {
  return createMockRuntimeCompatReport(overrides);
}

test("buildCombinedDoctorReport merges runtime and workspace issues", () => {
  const report = buildCombinedDoctorReport({
    runtime: runtime({
      adapter: "openclaw",
      runtimeName: "OpenClaw",
      version: null,
      cliAvailable: false,
      gatewayAvailable: false,
      capabilities: {
        version: false,
        modelsStatus: false,
        agentsList: false,
        gatewayCall: false,
      },
      diagnostics: {},
    }),
    compat: compat({
      runtimeAdapter: "openclaw",
      runtimeVersion: null,
      capabilities: {
        version: false,
        modelsStatus: false,
        agentsList: false,
        gatewayCall: false,
      },
      degraded: true,
      issues: ["OpenClaw CLI is not installed."],
    }),
    runtimeDoctor: {
      ok: false,
      runtime: runtime({
        adapter: "openclaw",
        runtimeName: "OpenClaw",
        version: null,
        cliAvailable: false,
        gatewayAvailable: false,
        capabilities: {
          version: false,
          modelsStatus: false,
          agentsList: false,
          gatewayCall: false,
        },
        diagnostics: {},
      }),
      compat: compat({
        runtimeAdapter: "openclaw",
        runtimeVersion: null,
        capabilities: {
          version: false,
          modelsStatus: false,
          agentsList: false,
          gatewayCall: false,
        },
        degraded: true,
        issues: ["OpenClaw CLI is not installed."],
      }),
      issues: ["OpenClaw CLI is not installed."],
      suggestedRepairs: ["Install OpenClaw."],
    },
    workspace: {
      ok: false,
      manifest: null,
      missingFiles: ["SOUL.md"],
      missingDirectories: ["/tmp/demo/.clawjs/compat"],
    },
    compatSnapshot: null,
    compatDrift: {
      drifted: false,
      issues: [],
    },
  });

  assert.equal(report.ok, false);
  assert.ok(report.issues.length >= 3);
  assert.match(report.suggestedRepairs.join(" "), /Initialize the workspace/);
});

test("buildCombinedDoctorReport adds a repair for missing runtime files", () => {
  const report = buildCombinedDoctorReport({
    runtime: runtime({
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
    compat: compat({
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
    runtimeDoctor: {
      ok: true,
      runtime: runtime({
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
      compat: compat({
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
    workspace: {
      ok: false,
      manifest: {
        schemaVersion: 1,
        appId: "demo-app",
        workspaceId: "demo",
        agentId: "agent-1",
        runtimeAdapter: "openclaw",
        rootDir: "/tmp/demo",
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
      missingFiles: ["SOUL.md", "USER.md"],
      missingDirectories: [],
    },
    compatSnapshot: null,
    compatDrift: {
      drifted: false,
      issues: [],
    },
  });

  assert.equal(report.ok, false);
  assert.match(report.suggestedRepairs.join(" "), /Restore missing runtime files: SOUL\.md, USER\.md\./);
  assert.deepEqual(
    report.issues.map((issue) => issue.message),
    ["Missing runtime file: SOUL.md", "Missing runtime file: USER.md"]
  );
});

test("buildCombinedDoctorReport surfaces compat snapshot drift", () => {
  const report = buildCombinedDoctorReport({
    runtime: runtime({
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
    }),
    compat: compat({
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
    }),
    runtimeDoctor: {
      ok: true,
      runtime: runtime({
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
      }),
      compat: compat({
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
      }),
      issues: [],
      suggestedRepairs: [],
    },
    workspace: {
      ok: true,
      manifest: {
        schemaVersion: 1,
        appId: "demo-app",
        workspaceId: "demo",
        agentId: "agent-1",
        runtimeAdapter: "openclaw",
        rootDir: "/tmp/demo",
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
      missingFiles: [],
      missingDirectories: [],
    },
    compatSnapshot: {
      schemaVersion: 1,
      runtimeAdapter: "openclaw",
      runtimeVersion: "1.2.3",
      probedAt: "2026-03-20T00:00:00.000Z",
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
    },
    compatDrift: {
      drifted: true,
      issues: [
        { code: "runtime_version", message: "Compat snapshot runtime version drifted from 1.2.3 to 2.0.0." },
        { code: "version_family", message: "Compat snapshot version family drifted from 1.2 to 2.0." },
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.match(report.suggestedRepairs.join(" "), /Refresh the compat snapshot/);
  assert.match(report.suggestedRepairs.join(" "), /Review adapter compatibility/);
  assert.deepEqual(report.issues.map((issue) => issue.capability), ["compat", "compat"]);
});

test("buildCombinedDoctorReport surfaces auth and managed-block problems", () => {
  const report = buildCombinedDoctorReport({
    runtime: runtime({
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
    compat: compat({
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
    runtimeDoctor: {
      ok: true,
      runtime: runtime({
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
      compat: compat({
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
    workspace: {
      ok: true,
      manifest: {
        schemaVersion: 1,
        appId: "demo-app",
        workspaceId: "demo",
        agentId: "agent-1",
        runtimeAdapter: "openclaw",
        rootDir: "/tmp/demo",
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
      missingFiles: [],
      missingDirectories: [],
    },
    compatSnapshot: null,
    compatDrift: {
      drifted: false,
      issues: [],
    },
    missingProvidersInUse: ["anthropic"],
    managedBlockProblems: [
      {
        blockId: "tone",
        kind: "missing_end",
        message: "SOUL.md: Managed block tone has a start marker without an end marker.",
      },
    ],
    providerSummaries: {},
  });

  assert.equal(report.ok, false);
  assert.match(report.suggestedRepairs.join(" "), /Authenticate the providers currently required/);
  assert.match(report.suggestedRepairs.join(" "), /Repair malformed managed blocks/);
  assert.deepEqual(report.issues.map((issue) => issue.capability), ["auth", "file_sync"]);
});

test("buildCombinedDoctorReport stays adapter-agnostic for non-openclaw families", () => {
  const report = buildCombinedDoctorReport({
    runtime: runtime({
      adapter: "proto-claw",
      runtimeName: "ProtoClaw",
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
    }),
    compat: compat({
      runtimeAdapter: "proto-claw",
      runtimeVersion: "4.0.0",
      capabilities: {
        version: true,
        daemon: false,
      },
      degraded: true,
      issues: ["ProtoClaw daemon is unavailable."],
      diagnostics: {
        versionFamily: "4.0",
        capabilitySignature: "daemon=0|version=1",
      },
    }),
    runtimeDoctor: {
      ok: false,
      runtime: runtime({
        adapter: "proto-claw",
        runtimeName: "ProtoClaw",
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
      }),
      compat: compat({
        runtimeAdapter: "proto-claw",
        runtimeVersion: "4.0.0",
        capabilities: {
          version: true,
          daemon: false,
        },
        degraded: true,
        issues: ["ProtoClaw daemon is unavailable."],
      }),
      issues: ["ProtoClaw daemon is unavailable."],
      suggestedRepairs: ["Repair ProtoClaw daemon."],
    },
    workspace: {
      ok: true,
      manifest: {
        schemaVersion: 1,
        appId: "demo-app",
        workspaceId: "demo",
        agentId: "agent-1",
        runtimeAdapter: "proto-claw",
        rootDir: "/tmp/demo",
        createdAt: "2026-03-20T00:00:00.000Z",
        updatedAt: "2026-03-20T00:00:00.000Z",
      },
      missingFiles: [],
      missingDirectories: [],
    },
    compatSnapshot: {
      schemaVersion: 1,
      runtimeAdapter: "proto-claw",
      runtimeVersion: "3.4.5",
      probedAt: "2026-03-20T00:00:00.000Z",
      capabilities: {
        version: true,
        daemon: true,
      },
      diagnostics: {
        versionFamily: "3.4",
        capabilitySignature: "daemon=1|version=1",
      },
    },
    compatDrift: {
      drifted: true,
      issues: [
        { code: "runtime_adapter", message: "Compat snapshot adapter drifted from proto-claw to proto-claw-next." },
      ],
    },
  });

  assert.equal(report.ok, false);
  assert.match(report.issues.map((issue) => issue.message).join(" "), /adapter drifted/);
  assert.match(report.suggestedRepairs.join(" "), /Refresh the compat snapshot/);
});
