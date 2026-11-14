// scripts/music-notes/add-music-notes.mjs: adds a note for a file Gemini listened to and
// audio_measure.py measured, keeps the file's layout and key order, leaves an existing note alone
// unless told to replace it, and skips what failed or only half happened.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { parseMusicNotes, readMusicNotes } from "../src/catalog/music-notes.ts";

const SCRIPT = fileURLToPath(new URL("../../../scripts/music-notes/add-music-notes.mjs", import.meta.url));

/** What gemini_describe.py writes for a file: the answer, and the fields it adds for itself. */
const heard = (summary: string) => ({
  kind: "full cue",
  summary,
  mood: ["tense", "ominous"],
  energy: 3,
  tension: 4,
  valence: 2,
  tempo_bpm: 0,
  pulse: "slow",
  instrumentation: ["strings"],
  style: "cinematic orchestral",
  vocals: "none",
  arc: "builds",
  sections: [{ start: "00:00", description: "low strings" }],
  opening: "fade in",
  ending: "fade out",
  faction_feel: "none",
  use_for: ["an approach"],
  avoid_for: ["a celebration"],
  confidence: "high",
  _tokens: { in: 1, out: 1 },
  _model: "test",
  path: "x.ogg",
});

/** What audio_measure.py writes for a file. */
const measured = (seconds: number) => ({ duration_s: seconds, median_db: -20, peak_at: 0.5, fade_in: false, fade_out: true, onset_rate: 1.234, tempo_bpm: 90.04, tempo_strength: 0.2123, lufs: -16.04, lra: 5.06, path: "x.ogg" });

let dir: string;
const run = (...args: string[]) => execFileSync(process.execPath, [SCRIPT, path.join(dir, "gemini.json"), path.join(dir, "audio.json"), "--notes", path.join(dir, "notes.json"), ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const write = (name: string, value: unknown) => writeFileSync(path.join(dir, name), JSON.stringify(value));
const notes = () => parseMusicNotes(readFileSync(path.join(dir, "notes.json"), "utf8"), "notes.json");

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "add-music-notes-"));
  const [key, existing] = [...readMusicNotes()].find(([name]) => name.length > 3) ?? [];
  write("notes.json", { about: "test notes", notes: { Zeta_Old: { ...existing, description: "The old words." }, [key!]: existing } });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("add-music-notes", () => {
  it("adds a note for a file that was heard and measured, in key order, with the measurements rounded", () => {
    write("gemini.json", { "sub/new_cue.ogg": heard("A new cue."), "zeta_old.ogg": heard("The new words.") });
    write("audio.json", { "sub/new_cue.ogg": measured(61.234), "zeta_old.ogg": measured(10) });
    expect(run()).toContain("1 notes added, 0 replaced, 1 already had one");
    const written = notes();
    expect(Object.keys(written)).toEqual([...Object.keys(written)].sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1)));
    expect(written.new_cue).toMatchObject({ description: "A new cue.", duration_s: 61.23, lufs: -16, lra: 5.1, onset_rate: 1.23, tempo_estimate_bpm: 90, fade_out: true });
    expect(written.new_cue).not.toHaveProperty("energy_measured");
    expect(written.new_cue).not.toHaveProperty("_model");
    expect(written.Zeta_Old?.description).toBe("The old words.");
    // One note to a line, as the file is written everywhere.
    expect(readFileSync(path.join(dir, "notes.json"), "utf8").split("\n").filter((line) => line.startsWith('"new_cue"')).length).toBe(1);
  });

  it("replaces an existing note only when told to, keeping its key's case", () => {
    write("gemini.json", { "zeta_old.ogg": heard("The new words.") });
    write("audio.json", { "zeta_old.ogg": measured(10) });
    expect(run("--replace")).toContain("0 notes added, 1 replaced");
    expect(notes().Zeta_Old?.description).toBe("The new words.");
  });

  it("skips a file that errored, or that was only heard or only measured", () => {
    write("gemini.json", { "a_failed.ogg": { error: "boom" }, "b_heard_only.ogg": heard("Heard."), "c_ok.ogg": heard("Fine.") });
    write("audio.json", { "a_failed.ogg": measured(5), "d_measured_only.ogg": measured(5), "c_ok.ogg": measured(5) });
    const said = run();
    expect(said).toContain("1 notes added");
    expect(said).toContain("skipped (failed): 1");
    expect(said).toContain("skipped (heard only): 1");
    expect(said).toContain("skipped (measured only): 1");
    expect(Object.keys(notes())).toContain("c_ok");
    expect(Object.keys(notes())).not.toContain("b_heard_only");
  });

  it("refuses two different files that share a base name", () => {
    write("gemini.json", { "one/same.ogg": heard("One."), "two/same.ogg": heard("Two.") });
    write("audio.json", { "one/same.ogg": measured(5), "two/same.ogg": measured(9) });
    expect(() => run()).toThrow(/two different files with one base name/);
  });
});
