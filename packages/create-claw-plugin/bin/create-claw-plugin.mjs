#!/usr/bin/env node

import { runCreateClawPlugin } from "../dist/index.js";

const exitCode = await runCreateClawPlugin(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
});

process.exit(exitCode);
