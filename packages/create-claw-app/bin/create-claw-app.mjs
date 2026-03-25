#!/usr/bin/env node

import { runCreateClawApp } from "../dist/index.js";

const exitCode = await runCreateClawApp(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
});

process.exit(exitCode);
