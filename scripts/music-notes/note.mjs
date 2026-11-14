// What the notes tooling shares (repo tooling: it isn't in any npm package): a note built from
// what Gemini wrote about a file and what was measured of it, and the notes file's layout.

import path from "node:path";

export const baseName = (asset) => path.posix.parse(asset.replaceAll("\\", "/")).name;
const round = (value, places) => (typeof value === "number" ? Number(value.toFixed(places)) : undefined);
const strings = (list) => (Array.isArray(list) ? list.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : []);

/** The fields of a note in the order they're written; undefined ones are left out. `piece` has `listened` (Gemini's answer), `measured` (audio_measure.py's), `duration_s`, and optionally `energy_measured` and `silent`. */
export function note(piece) {
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

/** The notes file's text: one note a line, in lower-case key order, so a change is a small diff. `entries` are { key, note }. */
export function notesText(about, entries) {
  const sorted = [...entries].sort((a, b) => (a.key.toLowerCase() < b.key.toLowerCase() ? -1 : a.key.toLowerCase() > b.key.toLowerCase() ? 1 : 0));
  const lines = sorted.map(({ key, note: built }) => `${JSON.stringify(key)}: ${JSON.stringify(built)}`);
  const text = `{\n"about": ${JSON.stringify(about)},\n"notes": {\n${lines.join(",\n")}\n}\n}\n`;
  JSON.parse(text);
  return text;
}
