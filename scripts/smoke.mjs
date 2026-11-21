#!/usr/bin/env node
// The clean-folder smoke test: packs the five packages, installs the tarballs in an empty folder with no
// sibling repos and no TypeSafe key, checks `npx sc2-doodad-finder --help` and `logout`, and that
// `npx sc2-asset-catalog render` asks for setup-renderer (macOS) or refuses (elsewhere). Then it
// starts the Finder with an empty cache folder. Its first start extracts the catalog from SC2GameData and downloads
// the embeddings model; the test waits for the page, then asks for a doodad and checks the cards.
// Then it does the same with the Music Finder, which extracts the music ids into the same cache
// folder, and checks that it serves a file from an Audio folder and nothing outside it. Last the Set
// Finder, which extracts nothing: it checks the published sets' cards, a set's page and an ask.
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
  for (const pkg of ["@team-antioch/sc2-asset-catalog", "@team-antioch/sc2-finder-kit", "@team-antioch/sc2-doodad-finder", "@team-antioch/sc2-music-finder", "@team-antioch/sc2-set-finder"]) run("npm", ["pack", "-w", pkg, "--pack-destination", packs], ROOT);
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
  finder.kill();

  // The Music Finder, in the same cache folder: its first start extracts the music ids (the model is there already), with an Audio folder of one made-up file.
  const musicBin = path.join(app, "node_modules", "@team-antioch", "sc2-music-finder", "bin", "sc2-music-finder.js");
  const musicHelp = execFileSync("npx", ["--no-install", "sc2-music-finder", "--help"], { cwd: app, env, encoding: "utf8", shell: win });
  if (!musicHelp.includes("Usage: sc2-music-finder")) throw new Error(`npx sc2-music-finder --help printed: ${musicHelp}`);
  console.log("npx sc2-music-finder --help works");
  const audio = path.join(work, "audio", "Assets", "Music");
  await mkdir(audio, { recursive: true });
  await writeFile(path.join(audio, "Smoke.ogg"), Buffer.alloc(64, 1));
  await writeFile(path.join(work, "outside.ogg"), "not in the Audio folder");
  const musicStarted = Date.now();
  finder = spawn(process.execPath, [musicBin, "--port", "0", "--audio", path.join(work, "audio")], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
  let musicOutput = "";
  const musicUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The Music Finder didn't start in ${START_TIMEOUT_MS / 1000} s:\n${musicOutput}`)), START_TIMEOUT_MS);
    const read = (chunk) => {
      process.stdout.write(chunk);
      musicOutput += chunk;
      const found = /The Music Finder is at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(musicOutput);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    };
    finder.stdout.setEncoding("utf8").on("data", read);
    finder.stderr.setEncoding("utf8").on("data", read);
    finder.on("exit", (code) => reject(new Error(`The Music Finder exited with ${code} before it started:\n${musicOutput}`)));
  });
  console.log(`Music Finder started in ${Math.round((Date.now() - musicStarted) / 1000)} s at ${musicUrl}`);
  const musicCards = Number(/^(\d+) cards/m.exec(musicOutput)?.[1]);
  if (!(musicCards > 1000)) throw new Error(`Expected over 1000 music cards, got ${musicCards}`);
  if (!/Not ranking: no TypeSafe key/.test(musicOutput)) throw new Error("Expected the Music Finder to say it isn't ranking without a key");
  if (!existsSync(path.join(cache, "extracted", "music-extracted.json"))) throw new Error(`No music extraction in ${cache}`);
  const musicStatus = await (await fetch(new URL("/status", musicUrl))).json();
  if (musicStatus.finder !== "music-finder") throw new Error(`/status said ${JSON.stringify(musicStatus)}`);
  const facets = await (await fetch(new URL("/facets", musicUrl))).json();
  if (!facets.kinds?.includes("full cue") || !facets.audio?.on || facets.audio.files !== 1) throw new Error(`/facets said ${JSON.stringify(facets)}`);
  const played = await fetch(new URL("/audio/smoke", musicUrl), { headers: { range: "bytes=0-9" } });
  if (played.status !== 206 || (await played.arrayBuffer()).byteLength !== 10) throw new Error(`/audio/smoke answered ${played.status}`);
  for (const outside of ["/audio/outside", "/audio/..%2Foutside.ogg", "/audio/%2e%2e%2foutside"]) {
    const refused = await fetch(new URL(outside, musicUrl));
    if (refused.status !== 404) throw new Error(`${outside} answered ${refused.status}`);
  }
  const musicController = new AbortController();
  const musicEvents = await fetch(new URL("/events", musicUrl), { signal: musicController.signal });
  const musicReader = musicEvents.body.pipeThrough(new TextDecoderStream()).getReader();
  const musicAsked = await fetch(new URL("/ask", musicUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "tense build under an alien approach", mode: "enter" }) });
  if (!musicAsked.ok) throw new Error(`/ask answered ${musicAsked.status}`);
  let musicBuffer = "";
  let musicNarrowed;
  const musicDeadline = Date.now() + 30_000;
  while (!musicNarrowed && Date.now() < musicDeadline) {
    const { value, done } = await musicReader.read();
    if (done) break;
    musicBuffer += value;
    for (const block of musicBuffer.split("\n\n").slice(0, -1)) if (/^event: narrowed$/m.test(block)) musicNarrowed = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
  }
  musicController.abort();
  if (!musicNarrowed?.cards?.length) throw new Error("The music ask gave no cards");
  console.log(`"tense build under an alien approach" gave ${musicNarrowed.cards.length} cards, first ${musicNarrowed.cards.slice(0, 5).map((card) => card.id).join(", ")}`);
  if (!musicNarrowed.cards.some((card) => /class="desc"/.test(card.html) && !/no listening notes/.test(card.html))) throw new Error("No card shows listening notes");
  finder.kill();

  // The Set Finder, in the same cache folder: the model is there already, and the sets ship with the catalog.
  const setBin = path.join(app, "node_modules", "@team-antioch", "sc2-set-finder", "bin", "sc2-set-finder.js");
  const setHelp = execFileSync("npx", ["--no-install", "sc2-set-finder", "--help"], { cwd: app, env, encoding: "utf8", shell: win });
  if (!setHelp.includes("Usage: sc2-set-finder")) throw new Error(`npx sc2-set-finder --help printed: ${setHelp}`);
  console.log("npx sc2-set-finder --help works");
  finder = spawn(process.execPath, [setBin, "--port", "0"], { cwd: app, env, stdio: ["ignore", "pipe", "pipe"] });
  let setOutput = "";
  const setUrl = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The Set Finder didn't start in ${START_TIMEOUT_MS / 1000} s:\n${setOutput}`)), START_TIMEOUT_MS);
    const read = (chunk) => {
      process.stdout.write(chunk);
      setOutput += chunk;
      const found = /The Set Finder is at (http:\/\/127\.0\.0\.1:\d+\/)/.exec(setOutput);
      if (found) {
        clearTimeout(timer);
        resolve(found[1]);
      }
    };
    finder.stdout.setEncoding("utf8").on("data", read);
    finder.stderr.setEncoding("utf8").on("data", read);
    finder.on("exit", (code) => reject(new Error(`The Set Finder exited with ${code} before it started:\n${setOutput}`)));
  });
  const setCount = Number(/^(\d+) cards/m.exec(setOutput)?.[1]);
  if (!(setCount > 50)) throw new Error(`Expected over 50 set cards, got ${setCount}`);
  if (!/Not ranking: no TypeSafe key/.test(setOutput)) throw new Error("Expected the Set Finder to say it isn't ranking without a key");
  const setStatus = await (await fetch(new URL("/status", setUrl))).json();
  if (setStatus.finder !== "set-finder") throw new Error(`/status said ${JSON.stringify(setStatus)}`);
  const gallery = await (await fetch(new URL("/cards", setUrl))).json();
  if (gallery.cards?.length !== setCount) throw new Error(`/cards gave ${gallery.cards?.length} cards, not ${setCount}`);
  if (!gallery.cards.every((card) => /raw\.githubusercontent\.com\/TeamAntioch\/sc2-mapping-reference\/main\/public\/sets\//.test(card.html))) throw new Error("A set's card links no gallery picture");
  const setPage = await fetch(new URL(`/set/${encodeURIComponent(gallery.cards[0].id)}`, setUrl));
  if (setPage.status !== 200 || !/Plan and overview/.test(await setPage.text())) throw new Error(`/set/${gallery.cards[0].id} answered ${setPage.status}`);
  const setController = new AbortController();
  const setEvents = await fetch(new URL("/events", setUrl), { signal: setController.signal });
  const setReader = setEvents.body.pipeThrough(new TextDecoderStream()).getReader();
  const setAsked = await fetch(new URL("/ask", setUrl), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "the bridge of a small starship", mode: "enter" }) });
  if (!setAsked.ok) throw new Error(`/ask answered ${setAsked.status}`);
  let setBuffer = "";
  let setNarrowed;
  const setDeadline = Date.now() + 30_000;
  while (!setNarrowed && Date.now() < setDeadline) {
    const { value, done } = await setReader.read();
    if (done) break;
    setBuffer += value;
    for (const block of setBuffer.split("\n\n").slice(0, -1)) if (/^event: narrowed$/m.test(block)) setNarrowed = JSON.parse(/^data: (.*)$/m.exec(block)[1]);
  }
  setController.abort();
  if (!setNarrowed?.cards?.length) throw new Error("The set ask gave no cards");
  console.log(`"the bridge of a small starship" gave ${setNarrowed.cards.length} sets, first ${setNarrowed.cards.slice(0, 5).map((card) => card.id).join(", ")}`);
  console.log("Smoke test passed");
} finally {
  finder?.kill();
  await rm(path.join(work, "app"), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  await rm(packs, { recursive: true, force: true }).catch(() => {});
  await rm(path.join(work, "config"), { recursive: true, force: true }).catch(() => {});
  await rm(path.join(work, "audio"), { recursive: true, force: true }).catch(() => {});
}
