import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const siteOutput = process.env.XINGHAI_DIST_DIR
  ? resolve(process.env.XINGHAI_DIST_DIR)
  : join(root, "../dist");
const output = join(siteOutput, "content-admin");

mkdirSync(join(output, "assets"), { recursive: true });
copyFileSync(join(root, "index.html"), join(output, "index.html"));

await build({
  entryPoints: [join(root, "src/main.js")],
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  outfile: join(output, "assets/main.js"),
  loader: { ".css": "css" },
});

console.log("Built TODO homepage content studio.");
