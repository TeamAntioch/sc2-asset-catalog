// Synthetic music for the Music Finder's tests: no game data, no campaign content.
import type { ExtractedMusic } from "@team-antioch/sc2-asset-catalog/catalog/extract-music.js";
import { joinMusicCatalog } from "@team-antioch/sc2-asset-catalog/catalog/music-catalog.js";
import type { MusicNote } from "@team-antioch/sc2-asset-catalog/catalog/music-notes.js";

import type { MusicSources } from "../src/cards.ts";

export const VOID_CAMPAIGN = "bnet:Void (Campaign)/0.0/999,file:Campaigns/Void.SC2Campaign";
export const VOID_STORY = "bnet:Void Story (Campaign)/0.0/999,file:Campaigns/VoidStory.SC2Campaign";

export const note = (over: Partial<MusicNote> = {}): MusicNote => ({
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
  sections: [
    { start: "00:00", description: "low strings" },
    { start: "00:38", description: "the choir enters" },
  ],
  opening: "fade in",
  ending: "fade out",
  faction_feel: "swarming alien horror (dissonant, brooding)",
  use_for: ["an approach through ruins", "alien discovery"],
  avoid_for: ["celebration"],
  duration_s: 90,
  lufs: -16,
  lra: 5,
  onset_rate: 1,
  peak_at: 0.5,
  ...over,
});

export const record = (id: string, assets: string[], over: Partial<ExtractedMusic> = {}): ExtractedMusic => ({
  id,
  kind: "Soundtrack",
  defined: ["mods/void.sc2mod/base.sc2data/GameData/SoundtrackData.xml l. 3"],
  package: "mods/void.sc2mod",
  assets,
  empty: false,
  role: "main",
  usedIn: [],
  usedCount: 0,
  ...over,
});

export const NOTES = new Map<string, MusicNote>([
  ["tenseapproach", note()],
  [
    "heroicvictory",
    note({
      kind: "stinger",
      description: "A short, triumphant brass fanfare.",
      mood: ["triumphant", "heroic"],
      energy: 5,
      tension: 1,
      valence: 5,
      faction_feel: "frontier humans (brass, martial)",
      use_for: ["a mission won", "a hero's return"],
      duration_s: 40,
      sections: [{ start: "00:00", description: "fanfare" }],
    }),
  ],
  [
    "calmambient",
    note({
      kind: "ambient bed",
      description: "A slow, glassy drone with distant chimes.",
      mood: ["calm", "mysterious"],
      energy: 1,
      tension: 2,
      valence: 3,
      faction_feel: "ancient noble aliens (choir, ethereal)",
      use_for: ["a temple at rest", "quiet exploration"],
      duration_s: 200,
      sections: [],
    }),
  ],
  ["silentfile", note({ kind: "silence", description: "Nothing plays.", mood: [], silent: true, energy: 1, tension: 1, valence: 3, duration_s: 10, use_for: [], sections: [] })],
  ["maponlyfile", note({ description: "A short marching cue.", mood: ["martial"], duration_s: 30, use_for: ["a patrol"], sections: [] })],
  ["dualfile", note({ kind: "loop", description: "A steady industrial loop.", mood: ["industrial"], energy: 4, tension: 3, valence: 3, faction_feel: "none", duration_s: 60, use_for: ["a foundry"], sections: [] })],
]);

/** Six ids: three for the scene (tense, heroic, calm), one silent, one only inside a map, and one that is both a Soundtrack and a Sound. */
export const RECORDS: ExtractedMusic[] = [
  record("TenseApproach", ["Assets\\Music\\TenseApproach.ogg"], { role: "cutscene", usedIn: [{ file: "campaigns/void.sc2campaign/base.sc2data/TriggerLibs/Mission.galaxy", line: 12, func: "Intro" }], usedCount: 4 }),
  record("HeroicVictory", ["Assets\\Music\\HeroicVictory.ogg"], { role: "victory" }),
  record("CalmAmbient", ["Assets\\Music\\CalmAmbient.ogg"], { role: "main", package: "campaigns/void.sc2campaign", dependency: VOID_CAMPAIGN }),
  record("SilentTrack", ["Assets\\Music\\SilentFile.ogg"], { role: "menu" }),
  record("MapOnlyTrack", ["Assets\\Music\\MapOnlyFile.ogg"], { role: "event", mapLocal: "Some Mission.SC2Map" }),
  record("Dual", ["Assets\\Music\\DualFile.ogg"], { role: "main" }),
  record("Dual", ["Assets\\Music\\DualFile.ogg"], { kind: "Sound", role: "main" }),
];

export const SOURCES: MusicSources = { catalog: joinMusicCatalog(RECORDS, NOTES), notes: NOTES };
