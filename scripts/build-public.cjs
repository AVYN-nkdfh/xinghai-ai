"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadFeishuConfig } = require("../services/leads-api/api/_lib/feishu-leads.js");
const { loadRetentionConfig } = require("../services/leads-api/api/_lib/lead-retention.js");
const { loadRuntimeConfig } = require("../services/leads-api/api/leads/create.js");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const DIST_ROOT = path.join(PROJECT_ROOT, "dist");
const PUBLIC_ROOT = path.join(DIST_ROOT, "site-public");
const TEMP_ROOT = path.join(DIST_ROOT, `.site-public-${process.pid}.tmp`);
const RELEASE_ROOT = path.join(PROJECT_ROOT, "release");
const DEFAULT_SITE_URL = "https://tudu.school";
const DEFAULT_PRIVACY_VERSION = "2026-08-24";
const DEFAULT_TURNSTILE_ACTION = "lead_submit";
const PRODUCTION_REQUIRED_ENV = [
  "TURNSTILE_SITE_KEY",
  "LEADS_ALLOWED_ORIGINS",
  "LEADS_PRIVACY_VERSION",
  "LEADS_EXPECTED_FUNCTION_REGION",
  "LEADS_INTERNATIONAL_TRANSFER_CONSENT_VERSION",
  "LEADS_IDEMPOTENCY_SECRET",
  "FEISHU_LEADS_RETENTION_ELIGIBLE_STATUSES",
  "TURNSTILE_SECRET_KEY",
  "TURNSTILE_ALLOWED_HOSTNAMES",
  "TURNSTILE_EXPECTED_ACTION",
  "FEISHU_APP_ID",
  "FEISHU_APP_SECRET",
  "FEISHU_LEADS_BASE_TOKEN",
  "FEISHU_LEADS_TABLE_ID",
  "FEISHU_LEADS_CHAT_ID",
  "FEISHU_LEADS_BASE_URL",
];
const PREVIEW_REQUIRED_ENV = [...PRODUCTION_REQUIRED_ENV, "CRON_SECRET"];
const ENTRY_FILES = ["index.html", "works.html", "learning.html", "create.html", "privacy.html"];
const CLEAN_PAGE_ROUTES = new Map([
  ["works", "works.html"],
  ["learning", "learning.html"],
  ["create", "create.html"],
  ["privacy", "privacy.html"],
  ["about", "about/index.html"],
  ["aesthetic", "aesthetic/index.html"],
  ["world", "world/index.html"],
  ["courses", "courses/index.html"],
  ["courses/animal-inspired-cars", "courses/animal-inspired-cars/index.html"],
  ["booking", "booking/index.html"],
  ["works/moments-copy", "works/moments-copy/index.html"],
  ["works/parent-child-relationship-test", "works/parent-child-relationship-test/index.html"],
  ["projects/game-archive", "projects/game-archive/index.html"],
  ["projects/hsv-fan", "projects/hsv-fan/index.html"],
  ["projects/moments-copy", "projects/moments-copy/index.html"],
  ["projects/ocean-environment", "projects/ocean-environment/index.html"],
  ["projects/ocean-governance", "projects/ocean-governance/index.html"],
  ["projects/animal-cars", "projects/animal-cars/index.html"],
  ["projects/parent-child-relationship-test", "projects/parent-child-relationship-test/index.html"],
  ["projects/valorant-teams", "projects/valorant-teams/index.html"],
]);
const REQUIRED_BRAND_ASSETS = [
  "assets/todo-shield.png",
  "assets/icons/todo-crest-64.png",
  "assets/icons/todo-crest-180.png",
  "assets/brand/todo-crest-v1.png",
  "assets/brand/todo-lockup-dark-v1.webp",
];
const CODE_EXTENSIONS = new Set([".html", ".css", ".js"]);
const PUBLISHABLE_EXTENSIONS = new Set([
  ".html", ".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".webp", ".ico",
  ".txt", ".xml", ".webmanifest", ".mp3", ".mp4", ".vtt", ".json",
]);
const LEGACY_PUBLIC_TREES = [
  "about",
  "aesthetic",
  "world",
  "courses",
  "booking",
  "works/assets",
  "works/moments-copy",
  "works/parent-child-relationship-test",
  "projects/animal-cars",
  "projects/game-archive",
  "projects/hsv-fan",
  "projects/moments-copy",
  "projects/ocean-environment",
  "projects/ocean-governance",
  "projects/parent-child-relationship-test",
  "projects/valorant-teams",
];
const LEGACY_PUBLIC_FILES = [
  "assets/site-shell-v2.css",
  "assets/site-shell-v2.js",
  "assets/todo-logo-dark.png",
  "assets/todo-logo-light.png",
  "assets/todo-shield.webp",
  "works/covers/animal-cars-cover-v2.webp",
  "works/showcase.css",
  "works/showcase.js",
];
const LEGACY_RUNTIME_JSON_FILES = new Set([
  "projects/animal-cars/data/cars.json",
]);
const PRIVATE_LEGACY_BASENAMES = new Set([
  ".ds_store",
  "asset-brief.md",
  "codex_task.md",
  "crop-manifest.json",
  "design-qa.md",
  "package-lock.json",
  "package.json",
  "readme.md",
  "serve.py",
  "server.js",
  "vercel.json",
]);
const PRIVATE_LEGACY_SEGMENTS = new Set([
  ".agents",
  ".git",
  "admin",
  "content-admin",
  "node_modules",
  "prototype",
  "qa",
  "scripts",
]);
const MAX_VIDEO_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_VIDEO_BYTES = 30 * 1024 * 1024;
const MAX_POSTER_BYTES = 150 * 1024;

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeLocalReference(reference, sourceRelativePath) {
  const raw = reference.trim();
  if (
    !raw ||
    raw.startsWith("#") ||
    raw.startsWith("data:") ||
    raw.startsWith("mailto:") ||
    raw.startsWith("tel:") ||
    raw.startsWith("javascript:") ||
    raw.includes("${") ||
    raw.includes("{{") ||
    raw.startsWith("var(") ||
    /^https?:\/\//i.test(raw) ||
    raw.startsWith("//")
  ) {
    return null;
  }

  const withoutSuffix = raw.split(/[?#]/, 1)[0];
  if (!withoutSuffix || withoutSuffix === "/") return null;
  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    throw new Error(`Malformed local reference in ${sourceRelativePath}: ${raw}`);
  }
  if (decoded.includes("\0") || decoded.includes("\\")) {
    throw new Error(`Unsafe local reference in ${sourceRelativePath}: ${raw}`);
  }

  const sourceDirectory = path.posix.dirname(sourceRelativePath);
  const joined = decoded.startsWith("/")
    ? decoded.slice(1)
    : path.posix.join(sourceDirectory === "." ? "" : sourceDirectory, decoded);
  const normalized = path.posix.normalize(joined).replace(/^\.\//, "");
  if (!normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    throw new Error(`Reference leaves the project root in ${sourceRelativePath}: ${raw}`);
  }
  const routeKey = normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
  return CLEAN_PAGE_ROUTES.get(routeKey) || normalized;
}

function extractReferences(content, sourceRelativePath) {
  const references = new Set();
  const attributePattern = /\b(?:src|href|poster)\s*=\s*(["'])(.*?)\1/gis;
  const cssUrlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/gs;
  const extension = path.extname(sourceRelativePath).toLowerCase();
  const patterns = extension === ".html"
    ? [attributePattern, cssUrlPattern]
    : extension === ".css"
      ? [cssUrlPattern]
      : [];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      const normalized = normalizeLocalReference(match[2], sourceRelativePath);
      if (normalized) references.add(normalized);
    }
  }
  return references;
}

async function collectRuntimeFiles() {
  const files = new Set();
  const queue = [
    ...ENTRY_FILES,
    ...REQUIRED_BRAND_ASSETS,
    ...await collectLegacyPublicFiles(),
  ];

  while (queue.length > 0) {
    const relativePath = queue.shift();
    if (files.has(relativePath)) continue;
    const sourcePath = path.resolve(PROJECT_ROOT, relativePath);
    if (!isInside(PROJECT_ROOT, sourcePath)) throw new Error(`Unsafe source path: ${relativePath}`);

    let stat;
    try {
      stat = await fs.promises.stat(sourcePath);
    } catch {
      throw new Error(`Referenced file is missing: ${relativePath}`);
    }
    if (!stat.isFile()) throw new Error(`Referenced path is not a file: ${relativePath}`);
    const extension = path.extname(relativePath).toLowerCase();
    if (extension === ".mov") {
      throw new Error(`Raw MOV files cannot be published; encode an H.264 MP4 first: ${relativePath}`);
    }
    if (!PUBLISHABLE_EXTENSIONS.has(extension)) {
      throw new Error(`Referenced file type is not publishable (${extension || "no extension"}): ${relativePath}`);
    }
    files.add(relativePath);

    if (!CODE_EXTENSIONS.has(extension)) continue;
    const content = await fs.promises.readFile(sourcePath, "utf8");
    for (const reference of extractReferences(content, relativePath)) {
      if (!files.has(reference)) queue.push(reference);
    }

    if (extension === ".js") {
      const sequenceMatch = content.match(/\bconst\s+ASSET_BASE\s*=\s*['"]([^'"]+)['"]/);
      if (sequenceMatch) {
        const sequenceDirectory = normalizeLocalReference(sequenceMatch[1], relativePath);
        const absoluteDirectory = path.resolve(PROJECT_ROOT, sequenceDirectory);
        if (!isInside(PROJECT_ROOT, absoluteDirectory)) throw new Error("Unsafe sequence directory");
        const entries = await fs.promises.readdir(absoluteDirectory, { withFileTypes: true });
        const frameNames = entries
          .filter((entry) => entry.isFile() && /^hero-(?:boy|girl)-reach-\d{2}(?:-m)?\.webp$/.test(entry.name))
          .map((entry) => entry.name)
          .sort();
        if (frameNames.length !== 120) {
          throw new Error(`Expected 120 current hero frames in ${sequenceDirectory}, found ${frameNames.length}`);
        }
        for (const frameName of frameNames) queue.push(path.posix.join(sequenceDirectory, frameName));
      }
    }
  }

  return [...files].sort();
}

function isSafeLegacyPublicFile(relativePath) {
  const normalized = relativePath.split(path.sep).join("/");
  const segments = normalized.split("/");
  const basename = path.posix.basename(normalized).toLowerCase();
  const extension = path.posix.extname(normalized).toLowerCase();
  if (segments.some((segment) => segment.startsWith(".") || PRIVATE_LEGACY_SEGMENTS.has(segment.toLowerCase()))) {
    return false;
  }
  if (PRIVATE_LEGACY_BASENAMES.has(basename) || !PUBLISHABLE_EXTENSIONS.has(extension)) return false;
  if (extension === ".json" && !LEGACY_RUNTIME_JSON_FILES.has(normalized)) return false;
  return true;
}

async function collectLegacyPublicFiles() {
  const files = [];

  async function walk(relativeDirectory) {
    const absoluteDirectory = path.resolve(PROJECT_ROOT, relativeDirectory);
    if (!isInside(PROJECT_ROOT, absoluteDirectory)) throw new Error(`Unsafe legacy public directory: ${relativeDirectory}`);
    const entries = await fs.promises.readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Legacy public source must not contain symlinks: ${relativePath}`);
      if (entry.isDirectory()) {
        if (!PRIVATE_LEGACY_SEGMENTS.has(entry.name.toLowerCase()) && !entry.name.startsWith(".")) {
          await walk(relativePath);
        }
      } else if (entry.isFile() && isSafeLegacyPublicFile(relativePath)) {
        files.push(relativePath);
      }
    }
  }

  for (const relativeDirectory of LEGACY_PUBLIC_TREES) await walk(relativeDirectory);
  for (const relativePath of LEGACY_PUBLIC_FILES) {
    if (!isSafeLegacyPublicFile(relativePath)) throw new Error(`Unsafe legacy public file declaration: ${relativePath}`);
    const absolutePath = path.resolve(PROJECT_ROOT, relativePath);
    if (!isInside(PROJECT_ROOT, absolutePath)) throw new Error(`Unsafe legacy public file: ${relativePath}`);
    const stat = await fs.promises.stat(absolutePath).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Legacy public file is missing: ${relativePath}`);
    files.push(relativePath);
  }

  return [...new Set(files)].sort();
}

function hasFastStart(buffer, relativePath) {
  let offset = 0;
  let moovOffset = -1;
  let mdatOffset = -1;
  while (offset + 8 <= buffer.length) {
    let boxSize = buffer.readUInt32BE(offset);
    const boxType = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    if (boxSize === 1) {
      if (offset + 16 > buffer.length) throw new Error(`Invalid extended MP4 box in ${relativePath}`);
      const extendedSize = buffer.readBigUInt64BE(offset + 8);
      if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`MP4 box is too large in ${relativePath}`);
      boxSize = Number(extendedSize);
      headerSize = 16;
    } else if (boxSize === 0) {
      boxSize = buffer.length - offset;
    }
    if (boxSize < headerSize || offset + boxSize > buffer.length) {
      throw new Error(`Invalid MP4 box structure in ${relativePath}`);
    }
    if (boxType === "moov" && moovOffset === -1) moovOffset = offset;
    if (boxType === "mdat" && mdatOffset === -1) mdatOffset = offset;
    offset += boxSize;
  }
  return moovOffset !== -1 && mdatOffset !== -1 && moovOffset < mdatOffset;
}

async function referencedVideoPosters(runtimeFiles) {
  const posters = new Set();
  for (const relativePath of runtimeFiles.filter((file) => file.endsWith(".html"))) {
    const content = await fs.promises.readFile(path.join(PROJECT_ROOT, relativePath), "utf8");
    for (const match of content.matchAll(/<video\b([^>]*)>/gis)) {
      const posterMatch = match[1].match(/\bposter\s*=\s*(["'])(.*?)\1/is);
      if (!posterMatch) continue;
      const poster = normalizeLocalReference(posterMatch[2], relativePath);
      if (!poster) throw new Error(`Video poster must be a local published image in ${relativePath}`);
      posters.add(poster);
    }
  }
  return posters;
}

async function validateMediaAssets(runtimeFiles) {
  const videoFiles = runtimeFiles.filter((file) => path.extname(file).toLowerCase() === ".mp4");
  let totalVideoBytes = 0;
  for (const relativePath of videoFiles) {
    if (!relativePath.startsWith("assets/media/")) {
      throw new Error(`Published videos must live under assets/media/: ${relativePath}`);
    }
    const absolutePath = path.join(PROJECT_ROOT, relativePath);
    const stat = await fs.promises.stat(absolutePath);
    if (stat.size > MAX_VIDEO_BYTES) {
      throw new Error(`Video exceeds 10 MiB: ${relativePath} (${(stat.size / 1024 / 1024).toFixed(2)} MiB)`);
    }
    totalVideoBytes += stat.size;
    const buffer = await fs.promises.readFile(absolutePath);
    if (!hasFastStart(buffer, relativePath)) {
      throw new Error(`MP4 must contain moov before mdat (faststart): ${relativePath}`);
    }
  }
  if (totalVideoBytes > MAX_TOTAL_VIDEO_BYTES) {
    throw new Error(`Published videos exceed the 30 MiB total budget (${(totalVideoBytes / 1024 / 1024).toFixed(2)} MiB)`);
  }

  for (const poster of await referencedVideoPosters(runtimeFiles)) {
    const stat = await fs.promises.stat(path.join(PROJECT_ROOT, poster));
    if (stat.size > MAX_POSTER_BYTES) {
      throw new Error(`Video poster exceeds 150 KiB: ${poster} (${(stat.size / 1024).toFixed(1)} KiB)`);
    }
  }
  return { videoCount: videoFiles.length, totalVideoBytes };
}

async function assertNoUnresolvedLaunchMarkers(runtimeFiles, sourceRoot = PROJECT_ROOT) {
  const blockers = [];
  const htmlFiles = runtimeFiles
    .filter((relativePath) => path.extname(relativePath).toLowerCase() === ".html")
    .sort();

  for (const relativePath of htmlFiles) {
    const content = await fs.promises.readFile(path.join(sourceRoot, relativePath), "utf8");
    const matches = content.matchAll(
      /data-launch-required\b(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g,
    );
    for (const match of matches) {
      const requirement = String(match[1] ?? match[2] ?? match[3] ?? "").trim();
      blockers.push({
        file: relativePath,
        requirement: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(requirement)
          ? requirement
          : "invalid-launch-marker",
      });
    }
  }

  if (blockers.length > 0) {
    throw new Error(
      `Production launch is blocked by unresolved data-launch-required markers:\n- ${blockers
        .map(({ file, requirement }) => `${file}: ${requirement}`)
        .join("\n- ")}`,
    );
  }
}

function copyFile(relativePath) {
  const sourcePath = path.join(PROJECT_ROOT, relativePath);
  const destinationPath = path.join(TEMP_ROOT, relativePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function productionConfigRequired(env = process.env) {
  return env.VERCEL_ENV === "production" || env.REQUIRE_PRODUCTION_CONFIG === "1";
}

function normalizedConfiguredOrigin(rawValue, requireHttps) {
  const value = String(rawValue || "").trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`LEADS_ALLOWED_ORIGINS contains an invalid origin: ${value || "<empty>"}`);
  }
  if (
    !/^https?:$/.test(url.protocol)
    || (requireHttps && url.protocol !== "https:")
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
  ) {
    throw new Error(`LEADS_ALLOWED_ORIGINS contains an invalid origin: ${value}`);
  }
  return url.origin;
}

function normalizedTurnstileHostname(rawValue) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value || value.includes(":") || value.includes("/") || value.includes("*")) {
    throw new Error(`TURNSTILE_ALLOWED_HOSTNAMES contains an invalid hostname: ${value || "<empty>"}`);
  }
  let url;
  try {
    url = new URL(`https://${value}`);
  } catch {
    throw new Error(`TURNSTILE_ALLOWED_HOSTNAMES contains an invalid hostname: ${value}`);
  }
  if (url.hostname !== value || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`TURNSTILE_ALLOWED_HOSTNAMES contains an invalid hostname: ${value}`);
  }
  return value;
}

function splitConfigList(rawValue, name) {
  const values = String(rawValue || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (values.length === 0) throw new Error(`${name} must contain at least one value`);
  return values;
}

function resolvePublicRuntimeConfig(env, siteUrl) {
  const requireProduction = productionConfigRequired(env);
  const requirePreview = env.VERCEL_ENV === "preview";
  if (requireProduction) {
    const missing = PRODUCTION_REQUIRED_ENV.filter((name) => !String(env[name] || "").trim());
    if (missing.length > 0) {
      throw new Error(`Production config is missing: ${missing.join(", ")}`);
    }
    loadRuntimeConfig({ ...env, VERCEL_ENV: "production" });
    loadFeishuConfig(env);
  }
  if (requirePreview) {
    const missing = PREVIEW_REQUIRED_ENV.filter((name) => !String(env[name] || "").trim());
    if (missing.length > 0) {
      throw new Error(`Preview config is missing: ${missing.join(", ")}`);
    }
    loadRuntimeConfig(env);
    loadFeishuConfig(env);
    loadRetentionConfig(env);
  }

  const siteKey = String(env.TURNSTILE_SITE_KEY || "").trim();
  const privacyVersion = String(env.LEADS_PRIVACY_VERSION || DEFAULT_PRIVACY_VERSION).trim();
  const turnstileAction = String(env.TURNSTILE_EXPECTED_ACTION || DEFAULT_TURNSTILE_ACTION).trim();

  if (siteKey && !/^[A-Za-z0-9_-]{10,128}$/.test(siteKey)) {
    throw new Error("TURNSTILE_SITE_KEY has an unexpected format");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(privacyVersion)) {
    throw new Error("LEADS_PRIVACY_VERSION must use YYYY-MM-DD");
  }
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(turnstileAction)) {
    throw new Error("TURNSTILE_EXPECTED_ACTION has an unexpected format");
  }

  if (requireProduction) {
    const idempotencySecret = String(env.LEADS_IDEMPOTENCY_SECRET).trim();
    const turnstileSecret = String(env.TURNSTILE_SECRET_KEY).trim();
    if (idempotencySecret.length < 32) {
      throw new Error("LEADS_IDEMPOTENCY_SECRET must contain at least 32 characters");
    }
    if (turnstileSecret === siteKey) {
      throw new Error("TURNSTILE_SECRET_KEY must not equal the public TURNSTILE_SITE_KEY");
    }
    const retentionConfig = loadRetentionConfig(env);
    if (retentionConfig.jobSecret === turnstileSecret) {
      throw new Error("CRON_SECRET must not equal TURNSTILE_SECRET_KEY");
    }

    const allowedOrigins = new Set(
      splitConfigList(env.LEADS_ALLOWED_ORIGINS, "LEADS_ALLOWED_ORIGINS")
        .map((value) => normalizedConfiguredOrigin(value, true)),
    );
    if (!allowedOrigins.has(siteUrl)) {
      throw new Error(`LEADS_ALLOWED_ORIGINS must include SITE_URL exactly: ${siteUrl}`);
    }

    const allowedHostnames = new Set(
      splitConfigList(env.TURNSTILE_ALLOWED_HOSTNAMES, "TURNSTILE_ALLOWED_HOSTNAMES")
        .map(normalizedTurnstileHostname),
    );
    for (const origin of allowedOrigins) {
      const hostname = new URL(origin).hostname.toLowerCase();
      if (!allowedHostnames.has(hostname)) {
        throw new Error(`TURNSTILE_ALLOWED_HOSTNAMES must include the allowed origin hostname: ${hostname}`);
      }
    }
  }

  return { privacyVersion, requireProduction, siteKey, turnstileAction };
}

function privacyVersionLabel(privacyVersion) {
  const [year, month, day] = privacyVersion.split("-").map(Number);
  return `版本日期：${year} 年 ${month} 月 ${day} 日`;
}

async function renderPublicRuntimeConfig(siteUrl, env = process.env, resolvedPublicConfig = null) {
  const publicConfig = resolvedPublicConfig || resolvePublicRuntimeConfig(env, siteUrl);
  const indexPath = path.join(TEMP_ROOT, "index.html");
  const content = await fs.promises.readFile(indexPath, "utf8");
  const privacyContent = await fs.promises.readFile(path.join(TEMP_ROOT, "privacy.html"), "utf8");
  const expectedPrivacyLabel = privacyVersionLabel(publicConfig.privacyVersion);
  if (!privacyContent.includes(expectedPrivacyLabel)) {
    throw new Error(`privacy.html version must match LEADS_PRIVACY_VERSION (${expectedPrivacyLabel})`);
  }
  const replacements = new Map([
    ["{{TURNSTILE_SITE_KEY}}", publicConfig.siteKey],
    ["{{TURNSTILE_ACTION}}", publicConfig.turnstileAction],
    ["{{LEADS_PRIVACY_VERSION}}", publicConfig.privacyVersion],
  ]);
  let rendered = content;
  for (const [placeholder, value] of replacements) {
    if (!rendered.includes(placeholder)) {
      throw new Error(`index.html is missing the public config placeholder: ${placeholder}`);
    }
    rendered = rendered.replaceAll(placeholder, value);
  }
  await fs.promises.writeFile(indexPath, rendered);
  return publicConfig;
}

function normalizeSiteUrl(rawValue) {
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error(`SITE_URL is invalid: ${rawValue}`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("SITE_URL must be an HTTPS origin without credentials, query, or fragment");
  }
  if (url.pathname !== "/") throw new Error("SITE_URL must not include a path");
  return url.origin;
}

async function renderReleaseFiles(siteUrl) {
  const files = ["404.html", "robots.txt.template", "sitemap.xml.template"];
  const templates = Object.fromEntries(
    await Promise.all(files.map(async (name) => [name, await fs.promises.readFile(path.join(RELEASE_ROOT, name), "utf8")])),
  );
  const rendered = {
    "404.html": templates["404.html"],
    "robots.txt": templates["robots.txt.template"].replaceAll("{{SITE_URL}}", siteUrl),
    "sitemap.xml": templates["sitemap.xml.template"].replaceAll("{{SITE_URL}}", siteUrl),
  };
  for (const [relativePath, content] of Object.entries(rendered)) {
    await fs.promises.writeFile(path.join(TEMP_ROOT, relativePath), content.trimEnd() + "\n");
  }
  return Object.keys(rendered);
}

async function sha256(filePath) {
  const content = await fs.promises.readFile(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

async function writeReleaseManifest(siteUrl) {
  const publishedFiles = [];
  async function walk(directory) {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile()) {
        const relativePath = path.relative(PUBLIC_ROOT, absolutePath).split(path.sep).join("/");
        const stat = await fs.promises.stat(absolutePath);
        publishedFiles.push({ path: relativePath, bytes: stat.size, sha256: await sha256(absolutePath) });
      }
    }
  }
  await walk(PUBLIC_ROOT);
  const manifest = {
    schemaVersion: 1,
    siteUrl,
    publicRoot: "dist/site-public",
    files: publishedFiles.sort((a, b) => a.path.localeCompare(b.path)),
  };
  await fs.promises.writeFile(
    path.join(DIST_ROOT, "release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return publishedFiles;
}

async function main() {
  const siteUrl = normalizeSiteUrl(process.env.SITE_URL || DEFAULT_SITE_URL);
  const runtimeFiles = await collectRuntimeFiles();
  const publicConfig = resolvePublicRuntimeConfig(process.env, siteUrl);
  if (publicConfig.requireProduction) {
    await assertNoUnresolvedLaunchMarkers(runtimeFiles);
  }
  const media = await validateMediaAssets(runtimeFiles);

  await fs.promises.mkdir(DIST_ROOT, { recursive: true });
  await fs.promises.rm(TEMP_ROOT, { recursive: true, force: true });
  await fs.promises.mkdir(TEMP_ROOT, { recursive: true });

  try {
    for (const relativePath of runtimeFiles) await copyFile(relativePath);
    await renderPublicRuntimeConfig(siteUrl, process.env, publicConfig);
    const renderedFiles = await renderReleaseFiles(siteUrl);
    await fs.promises.rm(PUBLIC_ROOT, { recursive: true, force: true });
    await fs.promises.rename(TEMP_ROOT, PUBLIC_ROOT);
    const publishedFiles = await writeReleaseManifest(siteUrl);
    const totalBytes = publishedFiles.reduce((sum, file) => sum + file.bytes, 0);
    console.log(
      `Built ${publishedFiles.length} public files (${(totalBytes / 1024 / 1024).toFixed(2)} MiB) for ${siteUrl}`,
    );
    console.log(`Copied ${runtimeFiles.length} runtime dependencies and rendered ${renderedFiles.length} release files.`);
    console.log(`Validated ${media.videoCount} MP4 files (${(media.totalVideoBytes / 1024 / 1024).toFixed(2)} MiB).`);
  } catch (error) {
    await fs.promises.rm(TEMP_ROOT, { recursive: true, force: true });
    throw error;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  assertNoUnresolvedLaunchMarkers,
  DEFAULT_PRIVACY_VERSION,
  DEFAULT_SITE_URL,
  DEFAULT_TURNSTILE_ACTION,
  PRODUCTION_REQUIRED_ENV,
  PREVIEW_REQUIRED_ENV,
  privacyVersionLabel,
  productionConfigRequired,
  resolvePublicRuntimeConfig,
};
