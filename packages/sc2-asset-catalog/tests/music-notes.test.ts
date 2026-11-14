// The shipped listening notes (data/music-notes.json): they hold what we wrote and measured and
// nothing from the game. A test can only check their shape, links and paths; that they name no
// campaign, mission or story is checked against names kept outside this repo (MUSIC_NOTES_DENYLIST,
// see scripts/check-music-notes.mjs), by the last test here when that variable is set.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MUSIC_NOTES_PATH } from "../src/catalog/catalog-dirs.js";
import { findDeniedNames, MUSIC_NOTE_FIELDS, musicFileKey, musicFileName, parseDenylist, parseMusicNotes, readMusicNotes } from "../src/catalog/music-notes.js";

const text = readFileSync(MUSIC_NOTES_PATH, "utf8");
const raw = JSON.parse(text) as { about: string; notes: Record<string, Record<string, unknown>> };

describe("the shipped notes", () => {
  it("are a valid notes file", () => {
    expect(() => parseMusicNotes(text, "music-notes.json")).not.toThrow();
    expect(readMusicNotes().size).toBe(Object.keys(raw.notes).length);
  });

  it("hold hundreds of notes, each keyed by a file's base name once, in order", () => {
    const keys = Object.keys(raw.notes);
    expect(keys.length).toBeGreaterThan(600);
    const lower = keys.map((key) => key.toLowerCase());
    expect(new Set(lower).size).toBe(keys.length);
    expect(lower).toEqual([...lower].sort());
    for (const key of keys) expect(musicFileKey(key), key).toBe(key.toLowerCase());
  });

  it("hold only our fields: nothing extracted from the game, no album or composer, no mission or story field", () => {
    const allowed = new Set(MUSIC_NOTE_FIELDS);
    for (const [key, note] of Object.entries(raw.notes)) for (const field of Object.keys(note)) expect(allowed.has(field), `${key}.${field}`).toBe(true);
    for (const forbidden of ["id", "asset", "assets", "defined", "dependency", "package", "used_in", "usedIn", "mission", "mission_key", "album", "album_title", "composer", "origin", "model_tags", "sources", "description_src"]) {
      expect(MUSIC_NOTE_FIELDS).not.toContain(forbidden);
    }
  });

  it("carry no link, address or file path", () => {
    for (const [key, note] of Object.entries(raw.notes)) {
      const words = JSON.stringify(note);
      expect(words, key).not.toMatch(/https?:|www\.|@\w+\.\w|Assets\\\\|\.sc2/i);
    }
  });

  it("have a description, mood and sections for every note, and a first section at the top", () => {
    for (const [key, note] of Object.entries(raw.notes)) {
      expect((note.description as string).length, key).toBeGreaterThan(10);
      expect((note.mood as string[]).length, key).toBeGreaterThan(0);
      const sections = note.sections as { start: string }[];
      expect(sections.length, key).toBeGreaterThan(0);
      expect(sections[0]!.start, key).toMatch(/^0?0:00$/);
    }
  });

  it("say, in the file, that a model heard them and that the measurements are ours", () => {
    expect(raw.about).toMatch(/Gemini/);
    expect(raw.about).toMatch(/measurements/);
    expect(raw.about).toMatch(/nothing here is extracted from the game/);
  });
});

describe("a file's key", () => {
  it("is its base name without folder or extension, lower case", () => {
    expect(musicFileKey("Assets\\Music\\MissionMusic\\Music_DarkVictory_Full.ogg")).toBe("music_darkvictory_full");
    expect(musicFileKey("Assets/Music/The Old Directorate C.ogg")).toBe("the old directorate c");
    expect(musicFileKey("Assets\\Music\\p01full")).toBe("p01full");
    expect(musicFileKey("Space_1_FULL.OGG")).toBe("space_1_full");
  });

  it("strips only a real extension, so the notes' builder and the join agree on a name with a dot in it", () => {
    // musicFileName is the rule scripts/build-music-notes.mjs keys the notes by.
    expect(musicFileName("Assets\\Music\\Cue.Hero_Theme.ogg")).toBe("Cue.Hero_Theme");
    expect(musicFileName("Assets\\Music\\Cue.Hero_Theme")).toBe("Cue.Hero_Theme");
    expect(musicFileName("Cue.v2")).toBe("Cue");
    expect(musicFileKey("Cue.Hero_Theme.ogg")).toBe("cue.hero_theme");
  });
});

describe("parsing a notes file", () => {
  it("refuses a field that isn't ours, naming the note", () => {
    const note = Object.values(raw.notes)[0]!;
    const bad = JSON.stringify({ about: "x", notes: { Thing: { ...note, album: "Somebody's Soundtrack" } } });
    expect(() => parseMusicNotes(bad, "bad.json")).toThrow(/bad\.json isn't a valid listening notes file.*Thing/);
  });

  it("refuses a rating outside 1 to 5 and a section with no time", () => {
    const note = Object.values(raw.notes)[0]!;
    expect(() => parseMusicNotes(JSON.stringify({ about: "x", notes: { A: { ...note, energy: 6 } } }), "bad.json")).toThrow(/energy/);
    expect(() => parseMusicNotes(JSON.stringify({ about: "x", notes: { A: { ...note, sections: [{ start: "soon", description: "x" }] } } }), "bad.json")).toThrow(/sections/);
  });
});

describe("names that must not ship", () => {
  it("reads a denylist file, a term a line", () => {
    expect(parseDenylist("# names\nHot Zone\n\n  Moloch  \r\n")).toEqual(["Hot Zone", "Moloch"]);
  });

  it("finds a note that names a term as a whole word, in any case, and no other", () => {
    const notes = { a: { description: "A march for the hot zone." }, b: { description: "A hotzone of strings." }, c: { mood: ["Moloch's theme"] }, d: { description: "Calm." } };
    expect(findDeniedNames(notes, ["Hot Zone", "moloch"])).toEqual([
      { note: "a", term: "Hot Zone" },
      { note: "c", term: "moloch" },
    ]);
  });

  it("finds a term in a note's key, the file's name, as well as in its fields", () => {
    expect(findDeniedNames({ Moloch_Theme: { description: "Calm." }, Calm_Bed: { description: "Calm." } }, ["moloch"])).toEqual([{ note: "Moloch_Theme", term: "moloch" }]);
  });

  it("takes terms with regular-expression characters as they are", () => {
    expect(findDeniedNames({ a: { description: "Halo (remix)" }, b: { description: "Haloo remix" } }, ["Halo (remix)"])).toEqual([{ note: "a", term: "Halo (remix)" }]);
  });

  // The names live outside the repo: set MUSIC_NOTES_DENYLIST to a file of them to run this.
  it.skipIf(!process.env.MUSIC_NOTES_DENYLIST)("is not named by the shipped notes (names from MUSIC_NOTES_DENYLIST)", () => {
    const terms = parseDenylist(readFileSync(process.env.MUSIC_NOTES_DENYLIST!, "utf8"));
    expect(findDeniedNames(raw.notes, terms)).toEqual([]);
  });
});
