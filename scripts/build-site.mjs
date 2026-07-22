import { copyFileSync, existsSync, linkSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

function copyFile(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try { linkSync(from, to); } catch { copyFileSync(from, to); }
}

function copy(source, destination) {
  const from = join(root, source);
  const to = join(dist, destination);
  if (!existsSync(from)) throw new Error(`Missing build input: ${source}`);
  if (!statSync(from).isDirectory()) return copyFile(from, to);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) copy(join(source, name), join(destination, name));
}

copy("index.html", "index.html");
copy("assets", "assets");
copy("booking", "booking");
copy("projects", "projects");

console.log("Built Xinghai website with production booking route.");
