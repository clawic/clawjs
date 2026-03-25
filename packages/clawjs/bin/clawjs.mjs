#!/usr/bin/env node

import path from "path";

import { runCli } from "../dist/index.js";

const exitCode = await runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  cwd: process.cwd(),
  binName: path.basename(process.argv[1] || "claw"),
});

process.exit(exitCode);
