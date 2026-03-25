import path from "path";
import { fileURLToPath } from "url";

import {
  createPackageName,
  createTitle,
  detectPackageManager,
  scaffoldProject,
  type ScaffoldContext,
  type SupportedPackageManager,
} from "../../clawjs/src/scaffold.ts";

export interface CreateClawServerContext extends ScaffoldContext {}

export const CREATE_CLAW_SERVER_EXIT_OK = 0;
export const CREATE_CLAW_SERVER_EXIT_FAILURE = 1;
export const CREATE_CLAW_SERVER_EXIT_USAGE = 64;
export const CREATE_CLAW_SERVER_USAGE = "Usage: create-claw-server <project-directory> [--skip-install] [--use-npm|--use-pnpm] [--template node]";

interface ParsedArgs {
  targetDir: string | null;
  install: boolean;
  packageManager: SupportedPackageManager;
  template: "node";
  wantsHelp: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let targetDir: string | null = null;
  let install = true;
  let packageManager: SupportedPackageManager = detectPackageManager();
  let template: "node" = "node";
  let wantsHelp = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    if (token === "--help" || token === "-h") {
      wantsHelp = true;
      continue;
    }
    if (token === "--skip-install" || token === "--no-install") {
      install = false;
      continue;
    }
    if (token === "--use-npm") {
      packageManager = "npm";
      continue;
    }
    if (token === "--use-pnpm") {
      packageManager = "pnpm";
      continue;
    }
    if (token === "--template") {
      const value = argv[index + 1];
      if (value === "node") {
        template = value;
        index += 1;
      }
      continue;
    }
    if (token.startsWith("--template=")) {
      const value = token.slice("--template=".length);
      if (value === "node") template = value;
      continue;
    }
    if (token.startsWith("--")) continue;
    if (targetDir) {
      wantsHelp = true;
      continue;
    }
    targetDir = token;
  }

  return { targetDir, install, packageManager, template, wantsHelp };
}

export async function runCreateClawServer(argv: string[], context: CreateClawServerContext): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.wantsHelp || !parsed.targetDir) {
    context.stdout.write(`${CREATE_CLAW_SERVER_USAGE}\n`);
    return parsed.targetDir ? CREATE_CLAW_SERVER_EXIT_USAGE : CREATE_CLAW_SERVER_EXIT_OK;
  }

  if (parsed.template !== "node") {
    context.stderr.write(`Unsupported template: ${parsed.template}\n`);
    return CREATE_CLAW_SERVER_EXIT_USAGE;
  }

  const targetPath = path.resolve(context.cwd, parsed.targetDir);
  const appSlug = createPackageName(path.basename(targetPath), "claw-server");
  const appTitle = createTitle(appSlug, "Claw Server");

  try {
    await scaffoldProject({
      context,
      targetPath,
      templateDir: fileURLToPath(new URL("../template", import.meta.url)),
      replacements: {
        "__APP_NAME__": appSlug,
        "__APP_SLUG__": appSlug,
        "__APP_TITLE__": appTitle,
      },
      packageManager: parsed.packageManager,
      install: parsed.install,
      successLabel: appSlug,
      nextSteps: [
        `${parsed.packageManager} run claw:init`,
        `${parsed.packageManager} run dev`,
      ],
      completionNote: "The generated server uses the demo adapter by default. Switch the server scripts and src/claw.ts to openclaw when you want a real runtime.",
    });
    return CREATE_CLAW_SERVER_EXIT_OK;
  } catch (error) {
    context.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return CREATE_CLAW_SERVER_EXIT_FAILURE;
  }
}
