import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assertFunctionBudget } from "./check-function-budget.mjs";
import { assertPublicationAuthorization } from "./check-publication-authorization.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const publicRoot = join(dist, "site-public");

function assertFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new Error(`Missing ${label}: ${relative(root, path)}`);
  }
}

if (!existsSync(publicRoot)) throw new Error("Public build is missing: dist/site-public");
const initialManifestPath = join(dist, "release-manifest.json");
assertFile(initialManifestPath, "public release manifest");
const initialManifest = JSON.parse(readFileSync(initialManifestPath, "utf8"));

// Unified Admin v2 is retained in source, but its five Functions are excluded
// from the 12-Function Hobby deployment. Do not publish a frontend whose API is
// intentionally absent; the narrower content studio remains the production UI.
rmSync(join(publicRoot, "admin"), { recursive: true, force: true });
assertFile(join(publicRoot, "content-admin/index.html"), "content-admin route");
assertFile(join(publicRoot, "content-admin/assets/main.js"), "content-admin bundle");

const { activeFunctions } = assertFunctionBudget({ root });
const authorization = assertPublicationAuthorization({ root });
for (const path of activeFunctions) {
  assertFile(join(root, path), `protected API source ${path}`);
}

const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) walk(absolutePath);
    else if (entry.isFile()) {
      const path = relative(publicRoot, absolutePath).split("\\").join("/");
      const content = readFileSync(absolutePath);
      files.push({
        path,
        bytes: content.byteLength,
        sha256: createHash("sha256").update(content).digest("hex"),
      });
    }
  }
}

walk(publicRoot);
writeFileSync(initialManifestPath, `${JSON.stringify({
  schemaVersion: 1,
  siteUrl: initialManifest.siteUrl,
  publicRoot: "dist/site-public",
  files,
}, null, 2)}\n`);

console.log(
  `Preserved /content-admin and excluded local-only /admin; finalized ${files.length} public files; `
    + `${activeFunctions.length} deployable Functions; `
    + `${authorization.workCount} authorized works and ${authorization.mediaCount} authorized media assets.`,
);
