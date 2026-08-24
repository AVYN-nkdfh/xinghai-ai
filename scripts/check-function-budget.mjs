import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const defaultRoot = join(dirname(modulePath), "..");

export const EXPECTED_ACTIVE_FUNCTIONS = Object.freeze([
  "api/admin/action.js",
  "api/admin/login.js",
  "api/admin/logout.js",
  "api/admin/state.js",
  "api/aesthetic.js",
  "api/booking/availability.js",
  "api/booking/create.js",
  "api/content/admin.js",
  "api/content/upload.js",
  "api/content/works-admin.js",
  "api/leads/create.js",
  "api/leads/retention.js",
]);

const REQUIRED_IGNORE_RULES = Object.freeze([
  "api/admin-v2/**",
  "api/content/hero.js",
  "api/content/works.js",
]);

const RETAINED_EXCLUDED_FUNCTIONS = Object.freeze([
  "api/admin-v2/audit.js",
  "api/admin-v2/bootstrap.js",
  "api/admin-v2/roles.js",
  "api/admin-v2/session.js",
  "api/admin-v2/users.js",
  "api/content/hero.js",
  "api/content/works.js",
]);

function listDirectFunctionSources(root) {
  const apiRoot = join(root, "api");
  const files = [];

  function walk(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith("_")) walk(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(relative(root, absolutePath).split("\\").join("/"));
      }
    }
  }

  walk(apiRoot);
  return files;
}

function isExplicitlyExcluded(path) {
  return path.startsWith("api/admin-v2/")
    || path === "api/content/hero.js"
    || path === "api/content/works.js";
}

function difference(left, right) {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

export function assertFunctionBudget({
  root = defaultRoot,
  allowAllRetainedSourcesExcluded = process.env.VERCEL === "1",
} = {}) {
  const ignorePath = join(root, ".vercelignore");
  if (!existsSync(ignorePath)) throw new Error("Missing .vercelignore");

  const ignoreRules = new Set(
    readFileSync(ignorePath, "utf8")
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  const missingRules = REQUIRED_IGNORE_RULES.filter((rule) => !ignoreRules.has(rule));
  if (missingRules.length) {
    throw new Error(`Function budget ignore rules are missing: ${missingRules.join(", ")}`);
  }

  const allFunctions = listDirectFunctionSources(root);
  const missingExcludedSources = RETAINED_EXCLUDED_FUNCTIONS.filter((path) => !allFunctions.includes(path));
  const allRetainedSourcesExcluded = missingExcludedSources.length === RETAINED_EXCLUDED_FUNCTIONS.length;
  if (
    missingExcludedSources.length
    && !(allowAllRetainedSourcesExcluded && allRetainedSourcesExcluded)
  ) {
    throw new Error(`Rollback function sources are missing: ${missingExcludedSources.join(", ")}`);
  }

  const activeFunctions = allFunctions.filter((path) => !isExplicitlyExcluded(path));
  const unexpected = difference(activeFunctions, EXPECTED_ACTIVE_FUNCTIONS);
  const missing = difference(EXPECTED_ACTIVE_FUNCTIONS, activeFunctions);
  if (unexpected.length || missing.length) {
    throw new Error([
      unexpected.length ? `unexpected: ${unexpected.join(", ")}` : "",
      missing.length ? `missing: ${missing.join(", ")}` : "",
    ].filter(Boolean).join("; "));
  }
  if (activeFunctions.length !== 12) {
    throw new Error(`Expected exactly 12 deployable Vercel Functions, found ${activeFunctions.length}`);
  }

  return {
    activeFunctions,
    retainedSourcesPresent: missingExcludedSources.length === 0,
    retainedExcludedFunctions: [...RETAINED_EXCLUDED_FUNCTIONS],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === modulePath) {
  const result = assertFunctionBudget();
  console.log(
    `Function budget check passed: ${result.activeFunctions.length} active; `
      + `${result.retainedExcludedFunctions.length} retained in source but excluded from deployment.`,
  );
}
