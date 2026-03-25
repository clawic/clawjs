import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const rootDir = path.resolve(new URL("..", import.meta.url).pathname);
const tempDir = path.join(rootDir, ".tmp-pack-smoke");
fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? rootDir,
    stdio: options.stdio ?? "pipe",
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
}

function packPackage(packageDir) {
  const output = run("npm", ["pack", "--json"], { cwd: packageDir });
  const [entry] = JSON.parse(output);
  return {
    tarballPath: path.join(packageDir, entry.filename),
    files: entry.files.map((file) => file.path),
  };
}

const packageDirs = [
  path.join(rootDir, "packages", "clawjs-core"),
  path.join(rootDir, "packages", "clawjs-node"),
  path.join(rootDir, "packages", "clawjs-workspace"),
  path.join(rootDir, "packages", "clawjs-node-compat"),
  path.join(rootDir, "packages", "clawjs"),
  path.join(rootDir, "packages", "create-claw-app"),
  path.join(rootDir, "packages", "create-claw-agent"),
  path.join(rootDir, "packages", "create-claw-server"),
  path.join(rootDir, "packages", "create-claw-plugin"),
  path.join(rootDir, "packages", "eslint-config-claw"),
];

const packedPackages = packageDirs.map((packageDir) => packPackage(packageDir));
const tarballs = packedPackages.map((entry) => entry.tarballPath);

for (const { tarballPath, files: entries } of packedPackages) {
  const badEntry = entries.find((entry) => /(^package\/src\/)|(\.test\.)/.test(entry));
  if (badEntry) {
    throw new Error(`${path.basename(tarballPath)} leaks unpublished source or tests: ${badEntry}`);
  }
  const hasDts = entries.some((entry) => entry.endsWith(".d.ts"));
  const hasDist = entries.some((entry) => entry.startsWith("dist/"));
  if (!hasDts || !hasDist) {
    throw new Error(`${path.basename(tarballPath)} is missing built dist artifacts.`);
  }
}

const appDir = fs.mkdtempSync(path.join(tempDir, "install-"));
fs.writeFileSync(path.join(appDir, "package.json"), JSON.stringify({
  name: "clawjs-pack-smoke",
  private: true,
  type: "module",
}, null, 2));

run("npm", ["install", ...tarballs], { cwd: appDir, stdio: "inherit" });

run("node", ["--input-type=module", "-e", `
  const sdk = await import("@clawjs/claw");
  if (typeof sdk.Claw !== "function") {
    throw new Error("Claw export is missing");
  }
  if (typeof sdk.createClaw !== "function") {
    throw new Error("createClaw compatibility export is missing");
  }
  const compat = await import("@clawjs/node");
  if (compat.Claw !== sdk.Claw) {
    throw new Error("@clawjs/node does not reexport the primary Claw API");
  }
  const eslintConfig = await import("eslint-config-claw");
  if (!Array.isArray(eslintConfig.default) || eslintConfig.default.length === 0) {
    throw new Error("eslint-config-claw default export is missing");
  }
  if (!Array.isArray(eslintConfig.javascript) || eslintConfig.javascript.length === 0) {
    throw new Error("eslint-config-claw javascript preset is missing");
  }
  const adapters = sdk.listRuntimeAdapters().map((entry) => entry.id);
  if (!adapters.includes("openclaw")) {
    throw new Error("openclaw adapter metadata is missing");
  }
  const cli = await import("@clawjs/cli");
  if (typeof cli.runCli !== "function") {
    throw new Error("@clawjs/cli helpers are missing");
  }
`], { cwd: appDir, stdio: "inherit" });

const shortCliBin = path.join(appDir, "node_modules", ".bin", "claw");
const shortCliOutput = run(shortCliBin, ["--runtime", "demo", "runtime", "status", "--json"], { cwd: appDir });
if (!shortCliOutput.includes('"adapter": "demo"')) {
  throw new Error("Installed claw CLI alias did not execute correctly against the demo adapter.");
}

const generatedWorkspaceRoot = path.join(appDir, "generated-workspace");
run(shortCliBin, ["new", "workspace", "generated-workspace", "--no-install"], { cwd: appDir });

const generatedWorkspacePackageJson = JSON.parse(fs.readFileSync(path.join(generatedWorkspaceRoot, "package.json"), "utf8"));
if (generatedWorkspacePackageJson.name !== "generated-workspace") {
  throw new Error("claw new workspace did not scaffold the expected package.json name.");
}

const generatedWorkspaceProject = JSON.parse(fs.readFileSync(path.join(generatedWorkspaceRoot, "claw.project.json"), "utf8"));
if (generatedWorkspaceProject.type !== "workspace") {
  throw new Error("claw new workspace did not scaffold claw.project.json.");
}

run(shortCliBin, ["generate", "skill", "support-triage", "--project", generatedWorkspaceRoot], { cwd: appDir });
if (!fs.existsSync(path.join(generatedWorkspaceRoot, "claw", "skills", "support-triage.ts"))) {
  throw new Error("claw generate skill did not scaffold the expected skill file.");
}

run(shortCliBin, ["add", "telegram", "--project", generatedWorkspaceRoot], { cwd: appDir });
if (!fs.existsSync(path.join(generatedWorkspaceRoot, "claw", "channels", "telegram.json"))) {
  throw new Error("claw add telegram did not scaffold the expected channel config.");
}

const cliBin = path.join(appDir, "node_modules", ".bin", "clawjs");
const cliOutput = run(cliBin, ["--runtime", "demo", "runtime", "status", "--json"], { cwd: appDir });
if (!cliOutput.includes('"adapter": "demo"')) {
  throw new Error("Installed clawjs CLI did not execute correctly against the demo adapter.");
}

const createAppBin = path.join(appDir, "node_modules", ".bin", "create-claw-app");
const generatedRoot = path.join(appDir, "generated-app");
run(createAppBin, ["generated-app", "--skip-install"], { cwd: appDir });

const generatedPackageJson = JSON.parse(fs.readFileSync(path.join(generatedRoot, "package.json"), "utf8"));
if (generatedPackageJson.name !== "generated-app") {
  throw new Error("create-claw-app did not scaffold the expected package.json name.");
}
if (generatedPackageJson.dependencies?.["@clawjs/claw"] !== "^0.1.0") {
  throw new Error("create-claw-app did not scaffold the expected @clawjs/claw dependency.");
}
if (generatedPackageJson.devDependencies?.["@clawjs/cli"] !== "^0.1.0") {
  throw new Error("create-claw-app did not scaffold the expected @clawjs/cli dependency.");
}

if (!fs.existsSync(path.join(generatedRoot, "claw.project.json"))) {
  throw new Error("create-claw-app did not scaffold claw.project.json.");
}

if (!fs.existsSync(path.join(generatedRoot, "src", "app", "api", "claw", "status", "route.ts"))) {
  throw new Error("create-claw-app did not scaffold the expected Next.js Claw route.");
}

const createAgentBin = path.join(appDir, "node_modules", ".bin", "create-claw-agent");
const generatedAgentRoot = path.join(appDir, "generated-agent");
run(createAgentBin, ["generated-agent", "--skip-install"], { cwd: appDir });

const generatedAgentPackageJson = JSON.parse(fs.readFileSync(path.join(generatedAgentRoot, "package.json"), "utf8"));
if (generatedAgentPackageJson.name !== "generated-agent") {
  throw new Error("create-claw-agent did not scaffold the expected package.json name.");
}
if (generatedAgentPackageJson.dependencies?.["@clawjs/claw"] !== "^0.1.0") {
  throw new Error("create-claw-agent did not scaffold the expected @clawjs/claw dependency.");
}
if (generatedAgentPackageJson.devDependencies?.["@clawjs/cli"] !== "^0.1.0") {
  throw new Error("create-claw-agent did not scaffold the expected @clawjs/cli dependency.");
}

if (!fs.existsSync(path.join(generatedAgentRoot, "claw.project.json"))) {
  throw new Error("create-claw-agent did not scaffold claw.project.json.");
}

if (!fs.existsSync(path.join(generatedAgentRoot, "SOUL.md"))) {
  throw new Error("create-claw-agent did not scaffold the expected SOUL.md file.");
}

if (!fs.existsSync(path.join(generatedAgentRoot, "src", "agent.ts"))) {
  throw new Error("create-claw-agent did not scaffold the expected agent entrypoint.");
}

const createServerBin = path.join(appDir, "node_modules", ".bin", "create-claw-server");
const generatedServerRoot = path.join(appDir, "generated-server");
run(createServerBin, ["generated-server", "--skip-install"], { cwd: appDir });

const generatedServerPackageJson = JSON.parse(fs.readFileSync(path.join(generatedServerRoot, "package.json"), "utf8"));
if (generatedServerPackageJson.name !== "generated-server") {
  throw new Error("create-claw-server did not scaffold the expected package.json name.");
}
if (generatedServerPackageJson.dependencies?.["@clawjs/claw"] !== "^0.1.0") {
  throw new Error("create-claw-server did not scaffold the expected @clawjs/claw dependency.");
}
if (generatedServerPackageJson.devDependencies?.["@clawjs/cli"] !== "^0.1.0") {
  throw new Error("create-claw-server did not scaffold the expected @clawjs/cli dependency.");
}

if (!fs.existsSync(path.join(generatedServerRoot, "claw.project.json"))) {
  throw new Error("create-claw-server did not scaffold claw.project.json.");
}

if (!fs.existsSync(path.join(generatedServerRoot, "src", "server.ts"))) {
  throw new Error("create-claw-server did not scaffold the expected server entrypoint.");
}

if (!fs.existsSync(path.join(generatedServerRoot, "src", "claw.ts"))) {
  throw new Error("create-claw-server did not scaffold the expected Claw helper.");
}

const createPluginBin = path.join(appDir, "node_modules", ".bin", "create-claw-plugin");
const generatedPluginRoot = path.join(appDir, "generated-plugin");
run(createPluginBin, ["generated-plugin", "--skip-install"], { cwd: appDir });

const generatedPluginPackageJson = JSON.parse(fs.readFileSync(path.join(generatedPluginRoot, "package.json"), "utf8"));
if (generatedPluginPackageJson.name !== "generated-plugin") {
  throw new Error("create-claw-plugin did not scaffold the expected package.json name.");
}

if (!fs.existsSync(path.join(generatedPluginRoot, "claw.project.json"))) {
  throw new Error("create-claw-plugin did not scaffold claw.project.json.");
}

if (!fs.existsSync(path.join(generatedPluginRoot, "plugin.json"))) {
  throw new Error("create-claw-plugin did not scaffold the expected plugin manifest.");
}

if (!fs.existsSync(path.join(generatedPluginRoot, "src", "hooks.ts"))) {
  throw new Error("create-claw-plugin did not scaffold the expected hook entrypoint.");
}

if (!fs.existsSync(path.join(generatedPluginRoot, "src", "skills", "triage.ts"))) {
  throw new Error("create-claw-plugin did not scaffold the expected bundled skill.");
}

console.log("Pack smoke test passed.");
