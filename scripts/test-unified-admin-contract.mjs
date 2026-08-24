import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const app = await readFile(new URL("admin/app.js", root), "utf8");
const html = await readFile(new URL("admin/index.html", root), "utf8");
const finalize = await readFile(new URL("scripts/finalize-protected-build.mjs", root), "utf8");
const gitIgnore = await readFile(new URL(".gitignore", root), "utf8");
const vercelIgnore = await readFile(new URL(".vercelignore", root), "utf8");
const vercel = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));

for (const signal of ["loadBootstrap", "renderUsers", "renderRoles", "renderAudit"]) {
  assert.ok(app.includes(`function ${signal}`), `${signal} frontend contract is missing`);
}

assert.match(app, /api\("session", \{ method: "POST"/);
assert.match(app, /api\("session", \{ method: "DELETE"/);
assert.doesNotMatch(app, /prototype-password|demoRole|preview@todo/i);
assert.match(html, /\/admin\/app\.js/);
assert.match(html, /\/admin\/styles\.css/);
assert.match(gitIgnore, /^api\/admin-v2\/$/m);
assert.match(vercelIgnore, /^api\/admin-v2\/\*\*$/m);
for (const endpoint of ["audit", "bootstrap", "roles", "session", "users"]) {
  assert.match(vercelIgnore, new RegExp(`^api/admin-v2/${endpoint}\\.js$`, "m"));
}
assert.match(finalize, /rmSync\(join\(publicRoot, "admin"\)/);
assert.doesNotMatch(finalize, /copyTree\(join\(root, "admin"\)/);
assert.ok(!vercel.headers.some((entry) => entry.source === "/admin/:path*"));

console.log("unified admin frontend contract passed; local-only backend and production route remain unpublished");
