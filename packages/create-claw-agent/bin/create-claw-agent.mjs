#!/usr/bin/env node

import { runCreateClawAgent } from "../dist/index.js";

const exitCode = await runCreateClawAgent(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
});

process.exit(exitCode);
