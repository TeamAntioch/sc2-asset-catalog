// Joining the extracted music to the listening notes and searching it (src/catalog/music-catalog.ts).
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ExtractedMusic } from "../src/catalog/extract-music.js";
import { MUSIC_EXTRACTED_FILE } from "../src/catalog/extract-music.js";
import { getMusicEntry, joinMusicCatalog, musicEntriesPlaying, musicIdWords, parseMusicExtracted, readMusicCatalog, searchMusic, unextractedNotesReport } from "../src/catalog/music-catalog.js";
import { type MusicNote, parseMusicNotes } from "../src/catalog/music-notes.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const note = (over: Partial<MusicNote> = {}): MusicNote => ({
  kind: "full cue",
  description: "A tense, slow build of low strings and a cold choir.",
  mood: ["tense", "ominous"],
  energy: 3,
  tension: 4,
  valence: 2,
  pulse: "slow",
  instrumentation: ["strings", "choir"],
  style: "cinematic orchestral",
  vocals: "wordless choir",
  arc: "builds to a hit",
  sections: [{ start: "0:00", description: "low strings" }],
  opening: "fade in",
  ending: "fade out",
  faction_feel: "ancient noble aliens (choir, ethereal, sacred)",
  use_for: ["an approach through ruins", "alien discovery"],
  avoid_for: ["celebration"],
  duration_s: 90,
  lufs: -16,
  lra: 5,
  onset_rate: 1,
  peak_at: 0.5,
  ...over,
});

const record = (id: string, assets: string[], over: Partial<ExtractedMusic> = {}): ExtractedMusic => ({
  id,
  kind: "Soundtrack",
  defined: [`campaigns/void.sc2campaign/base.sc2data/GameData/SoundtrackData.xml l. 3`],
  package: "campaigns/void.sc2campaign",
  dependency: "bnet:Void (Campaign)/0.0/999,file:Campaigns/Void.SC2Campaign",
  assets: assets.map((name) => `Assets\\Music\\${name}.ogg`),
  empty: assets.length === 0,
  role: "main",
  usedIn: [],
  usedCount: 0,
  ...over,
});

const NOTES = new Map<string, MusicNote>([
  ["ruins_1", note()],
  ["ruins_2", note({ energy: 5, duration_s: 30, mood: ["tense", "driving"], kind: "stinger", faction_feel: "swarming alien horror", use_for: ["an ambush"], description: "A short, hard hit." })],
  ["quiet_bed", note({ energy: 1, tension: 1, valence: 4, mood: ["calm", "hopeful"], kind: "ambient bed", duration_s: 200, faction_feel: "frontier humans", use_for: ["a sunrise over a colony"], description: "Soft guitar over a pad." })],
  ["hush", note({ silent: true })],
  ["click", note({ kind: "sound effect" })],
  ["click_too", note({ kind: "sound effect" })],
  ["orphan_note", note()],
]);

const EXTRACTED = [
  record("Alien_Approach", ["Ruins_1", "Ruins_2"]),
  record("ZSpace02MusicMain", ["Quiet_Bed"], { role: "cutscene", usedCount: 3 }),
  record("Plain_Dread_Loop", ["No_Note_Yet"]),
  record("Silent_Stinger", ["Hush"]),
  record("Door_Click", ["Click"], { kind: "Sound" }),
  record("Click_And_Cue", ["Click", "No_Note_Yet"], { kind: "Sound" }),
  record("Two_Clicks", ["Click", "Click_Too"], { kind: "Sound" }),
  record("Nothing", []),
  record("Map_Only_Cue", ["Ruins_1"], { mapLocal: "pcamp01.sc2map" }),
  record("Alien_Approach", ["Ruins_1"], { kind: "Sound", role: "other" }),
];
const catalog = joinMusicCatalog(EXTRACTED, NOTES);

describe("joining the notes to the extracted ids", () => {
  it("gives each id the notes of the files it plays, in file order", () => {
    const entry = getMusicEntry(catalog, "Alien_Approach")!;
    expect(entry.files).toEqual(["ruins_1", "ruins_2"]);
    expect(entry.notes).toHaveLength(2);
    expect(entry.kinds).toEqual(["full cue", "stinger"]);
  });

  it("averages the ratings and gives the shortest and longest length", () => {
    const entry = getMusicEntry(catalog, "Alien_Approach", "Soundtrack")!;
    expect(entry).toMatchObject({ energy: 4, tension: 4, valence: 2, seconds: { min: 30, max: 90 } });
  });

  it("keeps an id with no notes, with nothing known of its ratings or length", () => {
    const entry = getMusicEntry(catalog, "Plain_Dread_Loop")!;
    expect(entry.notes).toEqual([]);
    expect(entry).not.toHaveProperty("energy");
    expect(entry).not.toHaveProperty("seconds");
    expect(entry.unplayable).toBe(false);
  });

  it("marks what plays nothing, only silence or sound effects as unplayable", () => {
    expect(getMusicEntry(catalog, "Nothing")).toMatchObject({ unplayable: true });
    expect(getMusicEntry(catalog, "Silent_Stinger")).toMatchObject({ silent: true, unplayable: true });
    expect(getMusicEntry(catalog, "Door_Click")).toMatchObject({ unplayable: true });
    expect(getMusicEntry(catalog, "Two_Clicks")).toMatchObject({ unplayable: true });
    expect(getMusicEntry(catalog, "ZSpace02MusicMain")).toMatchObject({ silent: false, unplayable: false });
  });

  it("doesn't call an id sound effects only while one of its files has no note: that file may be music", () => {
    expect(getMusicEntry(catalog, "Click_And_Cue")).toMatchObject({ unplayable: false });
  });

  it("names a Soundtrack and a Sound of one id apart, the Soundtrack first", () => {
    expect(getMusicEntry(catalog, "Alien_Approach")?.kind).toBe("Soundtrack");
    expect(getMusicEntry(catalog, "Alien_Approach", "Sound")?.kind).toBe("Sound");
  });

  it("reports a note whose file no extracted id plays, and leaves it out", () => {
    expect(catalog.unextractedNotes).toEqual(["orphan_note"]);
  });

  it("reports the notes it left out, a few by name, and nothing when there are none", () => {
    expect(unextractedNotesReport(catalog)).toBe("1 listening notes are for files no extracted music id plays, and are left out: orphan_note");
    const many = joinMusicCatalog([], new Map(["a", "b", "c", "d", "e", "f", "g"].map((key) => [key, note()])));
    expect(unextractedNotesReport(many, 3)).toBe("7 listening notes are for files no extracted music id plays, and are left out: a, b, c, …");
    expect(unextractedNotesReport(joinMusicCatalog(EXTRACTED, new Map([["ruins_1", note()]])))).toBeUndefined();
  });

  it("finds the entries that play a file by any spelling of its name", () => {
    expect(musicEntriesPlaying(catalog, "Assets\\Music\\RUINS_1.ogg").map((entry) => `${entry.id}:${entry.kind}`)).toEqual(["Alien_Approach:Soundtrack", "Map_Only_Cue:Soundtrack", "Alien_Approach:Sound"]);
  });
});

describe("the words of an id", () => {
  it("split at case changes, digits and separators", () => {
    expect(musicIdWords("ZSpace02MusicMain")).toEqual(["z", "space", "02", "music", "main"]);
    expect(musicIdWords("Music_DarkVictory_Full")).toEqual(["music", "dark", "victory", "full"]);
    expect(musicIdWords("nDLC01_Music_Cue06_Vocals")).toEqual(["n", "dlc", "01", "music", "cue", "06", "vocals"]);
  });
});

describe("searching", () => {
  const ids = (words: Parameters<typeof searchMusic>[1]) => searchMusic(catalog, words).map((match) => `${match.entry.id}:${match.entry.kind}`);

  it("matches the words of the ask against moods, uses and descriptions, best first", () => {
    const found = searchMusic(catalog, { words: "tense approach through some alien ruins" });
    expect(found[0]?.entry.id).toBe("Alien_Approach");
    expect(found[0]?.matched).toEqual(["tense", "approach", "alien", "ruins"]);
    expect(found.map((match) => match.score)).toEqual([...found.map((match) => match.score)].sort((a, b) => b - a));
  });

  it("matches a word by its first letters, so tension finds tense", () => {
    expect(ids({ words: "tension" })).toContain("Alien_Approach:Soundtrack");
  });

  it("finds an id that has no notes by the words of its id", () => {
    expect(ids({ words: "dread loop" })).toEqual(["Plain_Dread_Loop:Soundtrack"]);
  });

  it("leaves out what can't be played, and map-local ids, unless asked", () => {
    expect(ids({})).not.toContain("Nothing:Soundtrack");
    expect(ids({})).not.toContain("Silent_Stinger:Soundtrack");
    expect(ids({})).not.toContain("Map_Only_Cue:Soundtrack");
    expect(searchMusic(catalog, { includeUnplayable: true, includeMapLocal: true }).map((match) => match.entry.id)).toEqual(expect.arrayContaining(["Nothing", "Silent_Stinger", "Map_Only_Cue", "Door_Click"]));
  });

  it("filters by rating, length, kind, faction and role, and drops what has no notes when it filters by what notes hold", () => {
    expect(ids({ energy: [1, 2] })).toEqual(["ZSpace02MusicMain:Soundtrack"]);
    expect(ids({ minSeconds: 150 })).toEqual(["ZSpace02MusicMain:Soundtrack"]);
    expect(ids({ maxSeconds: 40 })).toEqual(["Alien_Approach:Soundtrack"]);
    expect(ids({ kinds: ["ambient bed"] })).toEqual(["ZSpace02MusicMain:Soundtrack"]);
    expect(ids({ faction: "terran" })).toEqual(["ZSpace02MusicMain:Soundtrack"]);
    expect(ids({ faction: "zerg" })).toEqual(["Alien_Approach:Soundtrack"]);
    expect(ids({ role: "cutscene" })).toEqual(["ZSpace02MusicMain:Soundtrack"]);
    expect(ids({ tension: [4, 5] })).not.toContain("Plain_Dread_Loop:Soundtrack");
  });

  it("reads ratings as the mean the card shows, and length as the range the card shows", () => {
    const ids = (query: Parameters<typeof searchMusic>[1]) => searchMusic(catalog, query).filter((match) => match.entry.kind === "Soundtrack").map((match) => match.entry.id);
    // Alien_Approach plays files rated 3 and 5 (mean 4), of 90 s and 30 s (card: 0:30-1:30).
    expect(ids({ energy: [4, 4] })).toContain("Alien_Approach");
    expect(ids({ energy: [5, 5] })).not.toContain("Alien_Approach");
    expect(ids({ energy: [3, 3] })).not.toContain("Alien_Approach");
    expect(ids({ minSeconds: 60, maxSeconds: 70 })).toContain("Alien_Approach");
    expect(ids({ minSeconds: 100 })).not.toContain("Alien_Approach");
    expect(ids({ maxSeconds: 20 })).not.toContain("Alien_Approach");
  });

  it("keeps the ids a map's dependencies bring in, counting Void Story as the Void campaign", () => {
    const story = "bnet:Void Story (Campaign)/0.0/999,file:Campaigns/VoidStory.SC2Campaign";
    expect(ids({ words: "tense", dependencies: [story] })).toContain("Alien_Approach:Soundtrack");
    expect(ids({ words: "tense", dependencies: ["bnet:Nova Covert Ops (Art Mod)/0.0/999,file:Mods/NovaStoryAssets.SC2Mod"] })).toEqual([]);
  });

  it("stops at the limit and lists in id order when it has no words", () => {
    expect(searchMusic(catalog, { limit: 1 })).toHaveLength(1);
    expect(ids({})[0]).toBe("Alien_Approach:Soundtrack");
  });
});

describe("weighing the words of an ask", () => {
  // Six entries say "builds" and "sounds" in their uses; one says "alarm". Everything else about them is the same.
  const plain = (over: Partial<MusicNote> = {}) => note({ description: "Plain.", arc: "flat", mood: ["calm"], use_for: [], ...over });
  const generic = ["Cue_A", "Cue_B", "Cue_C", "Cue_D", "Cue_E", "Cue_F"];
  const weighed = joinMusicCatalog(
    [...generic.map((id) => record(id, [id])), record("Siren_Cue", ["Siren_Cue"])],
    new Map<string, MusicNote>([...generic.map((id) => [id.toLowerCase(), plain({ use_for: ["a wave that builds", "scene sounds"] })] as const), ["siren_cue", plain({ use_for: ["an alarm"] })]]),
  );

  it("counts a word more the fewer entries say it, so one rare word beats two common ones", () => {
    const found = searchMusic(weighed, { words: "alarm builds sounds" });
    expect(found[0]?.entry.id).toBe("Siren_Cue");
    expect(found[0]?.matched).toEqual(["alarm"]);
    // The common words still find what they find, below the rare word's match.
    expect(found.slice(1).map((match) => match.matched)).toEqual(generic.map(() => ["builds", "sounds"]));
  });

  it("scores an id that plays several files as its best file, not by all their words together", () => {
    const pool = joinMusicCatalog(
      [record("Big_Pool", ["P_1", "P_2", "P_3"]), record("One_File", ["Single"])],
      new Map<string, MusicNote>([
        ["p_1", plain({ use_for: ["an alarm"] })],
        ["p_2", plain({ use_for: ["a sunrise"] })],
        ["p_3", plain({ use_for: ["a chase"] })],
        ["single", plain({ use_for: ["an alarm at sunrise"] })],
      ]),
    );
    const found = searchMusic(pool, { words: "alarm sunrise chase" });
    expect(found.map((match) => match.entry.id)).toEqual(["One_File", "Big_Pool"]);
    expect(found[0]?.matched).toEqual(["alarm", "sunrise"]);
    expect(found[1]?.matched).toHaveLength(1); // one of its files, however many words the three hold
  });

  it("counts the document frequencies once per catalog, not once per search", () => {
    let reads = 0;
    const counted = { ...weighed, entries: new Proxy(weighed.entries, { get: (target, key, receiver) => (key === Symbol.iterator && ++reads, Reflect.get(target, key, receiver)) }) };
    searchMusic(counted, { words: "alarm" });
    expect(reads).toBe(2); // the frequencies, then the search
    searchMusic(counted, { words: "builds" });
    searchMusic(counted, { words: "alarm sounds" });
    expect(reads).toBe(4); // one read per search after that
  });

  it("ignores function words", () => {
    expect(searchMusic(weighed, { words: "when she was at the alarm" })[0]?.matched).toEqual(["alarm"]);
    expect(searchMusic(weighed, { words: "when she was at the alarm" })).toHaveLength(1);
  });

  it("keeps the catalog's order (the extractor lists ids in id order) among equal scores", () => {
    const tied = joinMusicCatalog([record("Alpha_Cue", ["Alpha_Cue"]), record("Mid_Cue", ["Mid_Cue"]), record("Zed_Cue", ["Zed_Cue"])], new Map<string, MusicNote>(["zed_cue", "alpha_cue", "mid_cue"].map((id) => [id, plain({ use_for: ["an alarm"] })] as const)));
    expect(searchMusic(tied, { words: "alarm" }).map((match) => match.entry.id)).toEqual(["Alpha_Cue", "Mid_Cue", "Zed_Cue"]);
  });
});

describe("reading the extracted music", () => {
  it("joins the extracted file to the shipped notes", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "music-catalog-"));
    await writeFile(path.join(dir, MUSIC_EXTRACTED_FILE), JSON.stringify([record("Space_1_FULL", ["Space_1_FULL"])]));
    const read = readMusicCatalog({ extractedDir: dir });
    expect(read.entries).toHaveLength(1);
    expect(read.entries[0]?.notes).toHaveLength(1);
    expect(read.unextractedNotes.length).toBeGreaterThan(500);
  });

  it("says to run extract-music when nothing is extracted", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "music-catalog-"));
    expect(() => readMusicCatalog({ extractedDir: dir })).toThrow(/sc2-asset-catalog extract-music/);
  });

  it("refuses an extracted file that isn't one, naming the field", () => {
    expect(() => parseMusicExtracted(JSON.stringify([{ id: "A", kind: "Soundtrack" }]), "music-extracted.json")).toThrow(/music-extracted\.json isn't a valid extracted music file/);
  });

  it("parses a notes file in the shape the shipped one has", () => {
    expect(parseMusicNotes(JSON.stringify({ about: "x", notes: { A: note() } }), "n.json").A?.kind).toBe("full cue");
  });
});
