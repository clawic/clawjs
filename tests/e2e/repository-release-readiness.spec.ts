import fs from "fs";
import path from "path";

import { test, expect, saveArtifactScreenshot } from "./fixtures";

function readFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

test("repository ships an OSS git baseline for the first public release", async ({ request, page }) => {
  const status = await request.get("/api/e2e/status");
  expect(status.ok()).toBeTruthy();

  const requiredFiles = [
    ".gitattributes",
    ".github/CODEOWNERS",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/workflows/release-gate.yml",
    "docs/git-workflow.md",
  ];

  for (const relativePath of requiredFiles) {
    expect(fs.existsSync(path.join(process.cwd(), relativePath)), `${relativePath} should exist`).toBe(true);
  }

  const gitAttributes = readFile(".gitattributes");
  expect(gitAttributes).toContain("* text=auto eol=lf");
  expect(gitAttributes).toContain("packages/*/dist/** linguist-generated=true");

  const codeowners = readFile(".github/CODEOWNERS");
  expect(codeowners).toContain("* @clawic");
  expect(codeowners).toContain("/packages/ @clawic");

  const rootPackageJson = JSON.parse(readFile("package.json")) as {
    author?: { name?: string; url?: string };
  };
  expect(rootPackageJson.author).toEqual({
    name: "Iván González Dávila",
    url: "https://github.com/ivangdavila",
  });

  const packageDir = path.join(process.cwd(), "packages");
  const packageMetadata = fs.readdirSync(packageDir)
    .map((entry) => path.join(packageDir, entry, "package.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => {
      const packageJson = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
        name: string;
        author?: { name?: string; url?: string };
        homepage?: string;
        repository?: { url?: string };
        bugs?: { url?: string };
      };

      expect(packageJson.author, `${filePath} should expose the maintainer identity`).toEqual({
        name: "Iván González Dávila",
        url: "https://github.com/ivangdavila",
      });
      expect(packageJson.homepage, `${filePath} should keep the org homepage`).toBe("https://github.com/clawic/clawjs");
      expect(packageJson.repository?.url, `${filePath} should keep the org repository`).toBe("git+https://github.com/clawic/clawjs.git");
      expect(packageJson.bugs?.url, `${filePath} should keep the org issue tracker`).toBe("https://github.com/clawic/clawjs/issues");

      return {
        name: packageJson.name,
        author: packageJson.author?.name,
        authorUrl: packageJson.author?.url,
        homepage: packageJson.homepage,
      };
    });

  const copyrightFiles = [
    "LICENSE",
    ...fs.readdirSync(packageDir)
      .map((entry) => path.join("packages", entry, "LICENSE"))
      .filter((relativePath) => fs.existsSync(path.join(process.cwd(), relativePath))),
  ];

  for (const relativePath of copyrightFiles) {
    expect(readFile(relativePath), `${relativePath} should retain the copyright owner`).toContain("Iván González Dávila");
  }

  const pullRequestTemplate = readFile(".github/PULL_REQUEST_TEMPLATE.md");
  expect(pullRequestTemplate).toContain("feat/*");
  expect(pullRequestTemplate).toContain("Release Gate");

  const releaseWorkflow = readFile(".github/workflows/release-gate.yml");
  expect(releaseWorkflow).toContain("release/**");
  expect(releaseWorkflow).toContain("npm run publish:dry-run");
  expect(releaseWorkflow).toContain("workflow_dispatch");

  const gitWorkflow = readFile("docs/git-workflow.md");
  expect(gitWorkflow).toContain("main");
  expect(gitWorkflow).toContain("next");
  expect(gitWorkflow).toContain("release/0.x");
  expect(gitWorkflow).toContain("v<semver>");

  const contributing = readFile("CONTRIBUTING.md");
  expect(contributing).toContain("docs/git-workflow.md");
  expect(contributing).toContain("Target `main` for releasable work");

  const releasing = readFile("RELEASING.md");
  expect(releasing).toContain("npm run publish:dry-run");
  expect(releasing).toContain("Tag the release as `v<semver>`");

  const readme = readFile("README.md");
  expect(readme).toContain("docs/git-workflow.md");
  expect(readme).toContain("@ivangdavila");
  expect(readme).toContain("@clawic");

  const security = readFile("SECURITY.md");
  expect(security).toContain("@ivangdavila");
  expect(security).toContain("@clawic");

  const packageCards = packageMetadata.map((entry) => `
    <article class="card">
      <h2>${escapeHtml(entry.name)}</h2>
      <p><strong>Author</strong> ${escapeHtml(entry.author ?? "missing")}</p>
      <p><strong>Profile</strong> ${escapeHtml(entry.authorUrl ?? "missing")}</p>
      <p><strong>Org repo</strong> ${escapeHtml(entry.homepage ?? "missing")}</p>
    </article>
  `).join("");

  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Repository identity alignment</title>
        <style>
          :root {
            color-scheme: light;
            font-family: "Iowan Old Style", "Palatino Linotype", serif;
            background: #f6f1e8;
            color: #1f1a17;
          }
          body {
            margin: 0;
            min-height: 100vh;
            background:
              radial-gradient(circle at top right, rgba(63, 110, 87, 0.18), transparent 30%),
              linear-gradient(180deg, #fbf8f1 0%, #ece3d3 100%);
          }
          main {
            max-width: 1180px;
            margin: 0 auto;
            padding: 48px 32px 64px;
          }
          h1 {
            margin: 0 0 12px;
            font-size: 42px;
            line-height: 1.05;
          }
          .lede {
            max-width: 760px;
            font-size: 18px;
            line-height: 1.5;
          }
          .pill-row {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 24px 0 10px;
          }
          .pill {
            padding: 10px 14px;
            border-radius: 999px;
            background: #1f1a17;
            color: #f8f3eb;
            font: 600 13px/1 "SFMono-Regular", "Menlo", monospace;
            letter-spacing: 0.04em;
            text-transform: uppercase;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 16px;
            margin-top: 24px;
          }
          .card {
            padding: 20px;
            border-radius: 20px;
            border: 1px solid rgba(37, 55, 47, 0.16);
            background: rgba(255, 251, 245, 0.94);
            box-shadow: 0 18px 44px rgba(53, 61, 49, 0.08);
          }
          .card h2 {
            margin: 0 0 12px;
            font-size: 18px;
          }
          .card p {
            margin: 8px 0 0;
            font-size: 14px;
            line-height: 1.45;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <main>
          <h1>Identity metadata aligned</h1>
          <p class="lede">
            Packages expose Iván González Dávila as the maintainer identity, while repository ownership,
            routing, and issue tracking remain under the Clawic organization.
          </p>
          <div class="pill-row">
            <span class="pill">author: ivangdavila</span>
            <span class="pill">copyright: ivan gonzalez davila</span>
            <span class="pill">org: clawic</span>
          </div>
          <div class="grid">${packageCards}</div>
        </main>
      </body>
    </html>
  `);

  await saveArtifactScreenshot(page, "repository-identity.png");
});
