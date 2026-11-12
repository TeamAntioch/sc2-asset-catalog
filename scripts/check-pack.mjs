#!/usr/bin/env node
// Fails if either package would publish anything extracted from the game or rendered from it (the
// extracted doodads, models or catalog fields, thumbnails or sheets), or a repo-only command (the
// test command, which reads the repo's test-asks.json), or would export one. Lists each package's files.
//
//   node scripts/check-pack.mjs [--list]

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FORBIDDEN = [/(^|\/)doodads\.json$/, /doodad-extracted\.json$/, /doodad-models\.json$/, /extracted\.json$/, /thumbnails\//, /catalog-sheets\//, /\.(png|jpe?g|dds|m3)$/i, /(^|\/)tests?\//, /(^|\/)cli\/test-asks\./];
/** Repo-only modules: each package's exports must shut them out (map them to null). */
const NOT_EXPORTED = { "sc2-doodad-finder": ["./cli/test-asks.js"] };
const list = process.argv.includes("--list");

let failed = false;
for (const folder of ["sc2-asset-catalog", "sc2-doodad-finder"]) {
  const output = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: path.join(ROOT, "packages", folder), encoding: "utf8", shell: process.platform === "win32", stdio: ["ignore", "pipe", "ignore"] }));
  // npm gives a list of packed packages, or (some versions, in a workspace) an object of them by name.
  const packed = Array.isArray(output) ? output[0] : Object.values(output)[0];
  const pkg = packed.name;
  const files = packed.files.map((file) => file.path);
  const bad = files.filter((file) => FORBIDDEN.some((pattern) => pattern.test(file)));
  console.log(`${pkg}@${packed.version}: ${files.length} files, ${packed.size} bytes packed, ${packed.unpackedSize} unpacked`);
  if (list) for (const file of files) console.log(`  ${file}`);
  if (bad.length) {
    failed = true;
    console.error(`${pkg} would publish what it mustn't:\n${bad.map((file) => `  ${file}`).join("\n")}`);
  }
  const { exports } = JSON.parse(readFileSync(path.join(ROOT, "packages", folder, "package.json"), "utf8"));
  const exported = (NOT_EXPORTED[folder] ?? []).filter((subpath) => exports?.[subpath] !== null);
  if (exported.length) {
    failed = true;
    console.error(`${pkg} would export what it mustn't (map each to null in its exports):\n${exported.map((subpath) => `  ${subpath}`).join("\n")}`);
  }
}
if (failed) process.exitCode = 1;
