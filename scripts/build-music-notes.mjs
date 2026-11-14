// Builds packages/sc2-asset-catalog/data/music-notes.json from the research catalogue's tracks.json
// (sc2-adjutant, docs/research/blizzard-music/tracks.json). Repo tooling: it isn't in any npm package.
//
//   node scripts/build-music-notes.mjs <tracks.json> [out.json]
//
// What it keeps, per music file (keyed by the file's base name, without its folder or extension):
//   - Gemini's listening notes: the `listened` block, whole minus its provenance line.
//   - Our measurements of the file: its length, loudness, tempo estimate, onset rate, fades and
//     where it peaks, and whether it is silent.
// What it leaves out, because it is somebody else's words or the game's data: albums, composers,
// the fan wiki's and Blizzard's pages' descriptions and moods, Essentia's tags, and everything
// extracted from the game (ids, definitions, asset paths, dependencies, where scripts use them).
// A file nobody heard (not in the install the research measured) gets no note: its id's words still
// find it.

import { readFileSync, writeFileSync } from "node:fs";

// The one rule for a file's key, shared with the join (needs a build first, as check-music-notes does).
import { musicFileName } from "../packages/sc2-asset-catalog/dist/catalog/music-notes.js";

const [tracksFile, outFile = "packages/sc2-asset-catalog/data/music-notes.json"] = process.argv.slice(2);
if (!tracksFile) {
  console.error("Usage: node scripts/build-music-notes.mjs <tracks.json> [out.json]");
  process.exit(2);
}

const catalogue = JSON.parse(readFileSync(tracksFile, "utf8"));
const round = (value, places) => (typeof value === "number" ? Number(value.toFixed(places)) : undefined);
const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : []);

/** The fields of a note in the order they're written; undefined ones are left out. */
function note(piece) {
  const listened = piece.listened;
  const measured = piece.measured ?? {};
  const sections = (listened.sections ?? [])
    .filter((section) => typeof section.start === "string" && typeof section.description === "string")
    .map((section) => ({ start: section.start, description: section.description.trim() }));
  const fields = {
    kind: listened.kind,
    description: listened.summary?.trim(),
    mood: strings(listened.mood),
    energy: listened.energy,
    tension: listened.tension,
    valence: listened.valence,
    tempo_bpm: listened.tempo_bpm || undefined,
    pulse: listened.pulse,
    instrumentation: strings(listened.instrumentation),
    style: listened.style,
    vocals: listened.vocals,
    arc: listened.arc?.trim(),
    sections,
    opening: listened.opening,
    ending: listened.ending,
    faction_feel: listened.faction_feel,
    use_for: strings(listened.use_for),
    avoid_for: strings(listened.avoid_for),
    duration_s: round(piece.duration_s, 2),
    energy_measured: piece.energy_measured ?? undefined,
    silent: piece.silent === true ? true : undefined,
    lufs: round(measured.lufs, 1),
    lra: round(measured.lra, 1),
    onset_rate: round(measured.onset_rate, 2),
    tempo_estimate_bpm: round(measured.tempo_bpm, 1),
    tempo_strength: round(measured.tempo_strength, 3),
    fade_in: measured.fade_in === true ? true : undefined,
    fade_out: measured.fade_out === true ? true : undefined,
    peak_at: round(measured.peak_at, 2),
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0)));
}

const notes = new Map();
let twice = 0;
for (const piece of catalogue.pieces) {
  if (!piece.in_install || !piece.listened || piece.duration_s == null) continue;
  const key = musicFileName(piece.asset);
  const built = note(piece);
  const known = notes.get(key.toLowerCase());
  // The same file under two folders (Mission_MusicCue001, in Music/ and Music/MissionMusic/) has the
  // same length and was heard twice: the first listing's note stands.
  if (known) {
    if (known.note.duration_s !== built.duration_s) throw new Error(`${key} is two different files with one base name`);
    twice++;
    continue;
  }
  notes.set(key.toLowerCase(), { key, note: built });
}

const sorted = [...notes.values()].sort((a, b) => (a.key.toLowerCase() < b.key.toLowerCase() ? -1 : a.key.toLowerCase() > b.key.toLowerCase() ? 1 : 0));
const header = {
  about:
    "Listening notes for StarCraft II's music files, keyed by file base name (no folder, no extension; match without regard to case). Gemini (gemini-flash-latest) listened to each file with no file name, game or context and wrote the words: kind, description, mood, tension, valence, energy, instrumentation, sections with start times, what it suits and what to avoid. The measurements (duration_s, lufs, lra, onset_rate, tempo_estimate_bpm, tempo_strength, fades, peak_at, energy_measured) are ours, taken from the audio. A model's hearing is a good first draft, not a source: corrections are welcome by pull request. CC BY 4.0 (LICENSE-DATA). Generated by scripts/build-music-notes.mjs from the research catalogue; nothing here is extracted from the game.",
};
const lines = sorted.map(({ key, note: built }) => `${JSON.stringify(key)}: ${JSON.stringify(built)}`);
const text = `{\n"about": ${JSON.stringify(header.about)},\n"notes": {\n${lines.join(",\n")}\n}\n}\n`;
JSON.parse(text);
writeFileSync(outFile, text);
console.log(`${sorted.length} notes -> ${outFile} (${twice} files listed under two folders kept once)`);
