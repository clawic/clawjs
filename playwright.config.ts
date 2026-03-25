import path from "path";

import { defineConfig, devices } from "@playwright/test";

const e2eRoot = path.join(process.cwd(), ".tmp", "e2e");
const reuseExistingServer = process.env.CLAWJS_E2E_REUSE_SERVER === "1";

export default defineConfig({
  testDir: path.join(process.cwd(), "tests", "e2e"),
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: {
    timeout: 15_000,
  },
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  outputDir: path.join(process.cwd(), "test-results"),
  use: {
    baseURL: "http://127.0.0.1:4317",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 1024 },
  },
  webServer: {
    command: "cd demo && npm run start -- --port 4317",
    url: "http://127.0.0.1:4317/api/e2e/status",
    reuseExistingServer,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
    env: {
      CLAWJS_E2E: "1",
      CLAWJS_E2E_FIXTURE_MODE: "hermetic",
      CLAWJS_E2E_DISABLE_EXTERNAL_CALLS: "1",
      NEXT_DIST_DIR: ".next-e2e",
      CLAWJS_DEMO_DATA_DIR: path.join(e2eRoot, "demo-data"),
      OPENCLAW_STATE_DIR: path.join(e2eRoot, "openclaw-state"),
      CLAWLEN_OPENCLAW_WORKSPACE_DIR: path.join(e2eRoot, "workspace"),
      CLAWLEN_OPENCLAW_AGENT_DIR: path.join(e2eRoot, "agent"),
      CLAWLEN_OPENCLAW_SESSIONS_DIR: path.join(e2eRoot, "sessions"),
      CLAWJS_LEGACY_LOCAL_SETTINGS_PATH: path.join(e2eRoot, "workspace", "settings.json"),
      CLAWJS_LEGACY_CONFIG_DIR: path.join(e2eRoot, "config"),
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
