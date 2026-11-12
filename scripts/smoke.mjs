#!/usr/bin/env node
// The clean-folder smoke test: packs both packages, installs the tarballs in an empty folder with no
// sibling repos and no TypeSafe key, checks `npx sc2-doodad-finder --help` and `logout`, and that
// `npx sc2-asset-catalog render` asks for setup-renderer (macOS) or refuses (elsewhere). Then it
// starts the Finder with an empty cache folder. Its first start extracts the catalog from SC2GameData and downloads
// the embeddings model; the test waits for the page, then asks for a doodad and checks the cards.
// No Jev calls: TYPESAFE_API_KEY is removed from the Finder's environment, and its config folder is
// a new empty one, so no key file a developer saved with `login` is found.
//
//   npm run build && node scripts/smoke.mjs [--cache <folder>]
//
// The cache folder is a new temporary one unless --cache names one (CI keeps it, to check the
// extraction afterwards: SC2_ASSET_CATALOG_EXTRACTED=<cache>/extracted).

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { values } = parseArgs({ options: { cache: { type: "string" } } });
const START_TIMEOUT_MS = 10 * 60_000;
const win = process.platform === "win32";

const work = await mkdtemp(path.join(tmpdir(), "sc2-finder-smoke-"));
const cache = values.cache ? path.resolve(values.cache) : path.join(work, "cache");
const app = path.join(work, "app");
const packs = path.join(work, "packs");
await mkdir(app, { recursive: true });
await mkdir(packs, { recursive: true });
await mkdir(cache, { recursive: true });

const run = (command, args, cwd) => execFileSync(command, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", shell: win });

let finder;
try {
  for (const pkg of ["@team-antioch/sc2-asset-catalog", "@team-antioch/sc2-doodad-finder"]) run("npm", ["pack", "-w", pkg, "--pack-destination", packs], ROOT);
  const tarballs = (await readdir(packs)).filter((file) => file.endsWith(".tgz")).map((file) => path.join(packs, file));
  console.log(`Packed ${tarballs.map((file) => path.basename(file)).join(", ")}`);
  await writeFile(path.join(app, "package.json"), `${JSON.stringify({ name: "smoke", private: true, type: "module" })}\n`);
  run("npm", ["install", "--no-audit", "--no-fund", ...tarballs], app);

  const config = path.join(work, "config");
  const env = { ...process.env, SC2_ASSET_CATALOG_CACHE: cache, SC2_ASSET_CATALOG_CONFIG: config };
  delete env.TYPESAFE_API_KEY;
  delete env.SC2_ASSET_CATALOG_MODEL_CACHE;
  delete env.SC2_ADJUTANT_MODEL_CACHE;
  const help = execFileSync("npx", ["--no-install", "sc2-doodad-finder", "--help"], { cwd: app, env, encoding: "utf8", shell: win });
  if (!help.includes("Usage: sc2-doodad-finder")) throw new Error(`npx sc2-doodad-finder --help printed: ${help}`);
  console.log("npx sc2-doodad-finder --help works");
  const logout = execFileSync("npx", ["--no-install", "sc2-doodad-finder", "logout"], { cwd: app, env, encoding: "utf8", shell: win });
  if (!logout.includes("No saved TypeSafe key to delete")) throw new Error(`npx sc2-doodad-finder logout printed: ${logout}`);
  console.log("npx sc2-doodad-finder logout works");

  // The renderer can't be used before setup (on macOS) or at all (elsewhere), and says which. Nothing is built.
  if (!existsSync(path.join(app, "node_modules", "@team-antioch", "sc2-asset-catalog", "scripts", "build-whiteoutflakes.sh"))) throw new Error("The catalog package has no build-whiteoutflakes.sh");
  const render = spawnSync("npx", ["--no-install", "sc2-asset-catalog", "render"], { cwd: app, env, encoding: "utf8", shell: win });
  const expected = process.platform === "darwin" ? /run `npx @team-antioch\/sc2-asset-catalog setup-renderer`/ : /Rendering isn't supported on (Windows|Linux) yet/;
  if (render.status === 0 || !expected.test(render.stderr)) throw new Error(`npx sc2-asset-catalog render exited ${render.status}: ${render.stderr}`);
  console.log(`npx sc2-asset-catalog render says: ${render.stderr.split("\n").find((line) => expected.test(line))}`);

  // Run the installed bin with node itself, so the test can stop it on every platform.
  const bin = path.join(app, "node_modules", "@team-antioch", "sc2-doodad-finder", "bin", "sc2-doodad-finder.js");
  const started = Date.now();
  finder = spawn(process.execPath, [bin, "--port", "0"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The Finder didn't start in ${START_TIMEOUT_MS / 1000} s:\n${output}`)), START_TIMEOUT_MS);
    const read = (chunk) => {
      process.stdout.write(chunk);
      output += chunk;
      const found = /The Doodad Finder is at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(output);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    };
    finder.stdout.setEncoding("utf8").on("data", read);
    finder.stderr.setEncoding("utf8").on("data", read);
    finder.on("exit", (code) => reject(new Error(`The Finder exited with ${code} before it started:\n${output}`)));
  });
  console.log(`Started in ${Math.round((Date.now() - started) / 1000)} s at ${url}`);

  const cards = Number(/^(\d+) cards/m.exec(output)?.[1]);
  if (!(cards > 2000)) throw new Error(`Expected over 2000 cards, got ${cards}`);
  if (!/Not ranking: no TypeSafe key/.test(output)) throw new Error("Expected the Finder to say it isn't ranking without a key");
  if (!existsSync(path.join(cache, "extracted", "doodad-extracted.json"))) throw new Error(`No extraction in ${cache}`);

  const status = await (await fetch(new URL("/status", url))).json();
  if (status.finder !== "doodad-finder") throw new Error(`/status said ${JSON.stringify(status)}`);

  // Ask, and read the narrowed cards from the event stream.
  const controller = new AbortController();
  const events = await fetch(new URL("/events", url), { signal: controller.signal });
  const reader = events.body.pipeThrough(new TextDecoderStream()).getReader();
  const asked = await fetch(new URL("/ask", url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "stack of supply crates", mode: "enter" }) });
  if (!asked.ok) throw new Error(`/ask answered ${asked.status}`);
  let buffer = "";
  let narrowed;
  const deadline = Date.now() + 30_000;
  while (!narrowed && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    for (const block of buffer.split("\n\n").slice(0, -1)) if (/^event: narrowed$/m.test(block)) narrowed = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
  }
  controller.abort();
  if (!narrowed?.cards?.length) throw new Error("The ask gave no cards");
  const ids = narrowed.cards.map((card) => card.id);
  console.log(`"stack of supply crates" gave ${ids.length} cards, first ${ids.slice(0, 5).join(", ")}`);
  if (!narrowed.cards.some((card) => /raw\.githubusercontent\.com\/TeamAntioch\/sc2-mapping-reference/.test(card.html))) throw new Error("No card links a gallery picture");
  console.log("Smoke test passed");
} finally {
  finder?.kill();
  await rm(path.join(work, "app"), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  await rm(packs, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(work, "config"), { recursive: true, force: true }).catch(() => {});
}
