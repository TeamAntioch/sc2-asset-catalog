// Adds listening notes for new music files to packages/sc2-asset-catalog/data/music-notes.json
// from the two files the Python scripts in this folder write (repo tooling: it isn't in any npm
// package; see README.md here).
//
//   node scripts/music-notes/add-music-notes.mjs <gemini.json> <audio.json> [--notes <file>] [--replace]
//
// A file is added when Gemini listened to it (no error) and audio_measure.py measured it (no
// error), and the notes have no note for its base name yet. --replace puts the new note in place
// of an existing one, for a file you've listened to again. A listing that has the same base name
// in two folders is refused when the two lengths differ. The notes are written in the file's
// layout (one a line, in key order), then checked against the schema.
//
// A note is Gemini's answer for the file, minus its provenance fields, plus the measurements. The
// notes' `energy_measured` is a score over every measured file, so a new note has none.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { baseName, note, notesText } from "./note.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEFAULT_NOTES = path.join(ROOT, "packages/sc2-asset-catalog/data/music-notes.json");
const USAGE = "Usage: node scripts/music-notes/add-music-notes.mjs <gemini.json> <audio.json> [--notes <file>] [--replace]";

const { values, positionals } = parseArgs({ options: { notes: { type: "string" }, replace: { type: "boolean" }, help: { type: "boolean" } }, allowPositionals: true });
if (values.help || positionals.length !== 2) {
  console.log(USAGE);
  process.exit(values.help ? 0 : 2);
}
const [geminiFile, audioFile] = positionals;
const notesFile = values.notes ? path.resolve(values.notes) : DEFAULT_NOTES;

const gemini = JSON.parse(readFileSync(geminiFile, "utf8"));
const audio = JSON.parse(readFileSync(audioFile, "utf8"));
const existing = JSON.parse(readFileSync(notesFile, "utf8"));
const entries = new Map(Object.entries(existing.notes).map(([key, built]) => [key.toLowerCase(), { key, note: built }]));

const added = [];
const replaced = [];
const skipped = { heard_only: [], measured_only: [], failed: [], known: [] };
const seen = new Map();
for (const [file, listened] of Object.entries(gemini)) {
  const measured = audio[file];
  if (listened.error || (measured && measured.error)) {
    skipped.failed.push(file);
    continue;
  }
  if (!measured || measured.duration_s == null) {
    skipped.heard_only.push(file);
    continue;
  }
  const key = baseName(file);
  const same = seen.get(key.toLowerCase());
  if (same) {
    if (same.duration_s !== measured.duration_s) throw new Error(`${key} is two different files with one base name (${same.file} and ${file})`);
    continue;
  }
  seen.set(key.toLowerCase(), { file, duration_s: measured.duration_s });
  if (entries.has(key.toLowerCase()) && !values.replace) {
    skipped.known.push(key);
    continue;
  }
  const built = note({ listened, measured, duration_s: measured.duration_s, silent: listened.kind === "silence" });
  (entries.has(key.toLowerCase()) ? replaced : added).push(key);
  entries.set(key.toLowerCase(), { key: entries.get(key.toLowerCase())?.key ?? key, note: built });
}
for (const file of Object.keys(audio)) if (!(file in gemini) && !audio[file].error) skipped.measured_only.push(file);

writeFileSync(notesFile, notesText(existing.about, entries.values()));

// Check what was written against the package's schema, when the package has been built.
try {
  const { parseMusicNotes } = await import(pathToFileURL(path.join(ROOT, "packages/sc2-asset-catalog/dist/catalog/music-notes.js")).href);
  parseMusicNotes(readFileSync(notesFile, "utf8"), path.basename(notesFile));
  console.log("Checked against the notes schema.");
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") console.log("Not checked against the schema: run `npm run build` and `npm test` to do it.");
  else throw error;
}
console.log(`${added.length} notes added, ${replaced.length} replaced, ${skipped.known.length} already had one -> ${notesFile}`);
for (const [why, files] of Object.entries(skipped)) if (files.length && why !== "known") console.log(`skipped (${why.replace("_", " ")}): ${files.length}, e.g. ${files.slice(0, 3).join(", ")}`);
if (added.length) console.log(`added: ${added.slice(0, 10).join(", ")}${added.length > 10 ? ", …" : ""}`);
