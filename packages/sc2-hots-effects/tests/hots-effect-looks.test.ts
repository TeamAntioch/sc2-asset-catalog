// The shipped HotS effect looks (data/hots-effect-looks.json): what we wrote of each of Heroes of
// the Storm's default-skin effect models from frames of it filmed in StarCraft II, keyed by the
// model's path, with nothing else from either game. A test can check their shape and keys, and that
// they name no hero, place or game from a fixed list; that they name no campaign of the author's is
// checked against names kept outside this repo (MUSIC_NOTES_DENYLIST), by the last test when that
// variable is set.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { findDeniedNames, parseDenylist } from "@team-antioch/sc2-asset-catalog/catalog/music-notes.js";

import { EFFECT_LOOK_FIELDS, HOTS_EFFECT_LOOKS_PATH, parseHotsEffectLooks, readHotsEffectLooks } from "../src/index.js";

const text = readFileSync(HOTS_EFFECT_LOOKS_PATH, "utf8");
const raw = JSON.parse(text) as { about: string; effects: Record<string, Record<string, unknown>> };

describe("the shipped HotS effect looks", () => {
  it("are a valid looks file of two thousand or more effects, by path in order", () => {
    expect(() => parseHotsEffectLooks(text, "hots-effect-looks.json")).not.toThrow();
    const files = Object.keys(raw.effects);
    expect(files.length).toBeGreaterThan(2000);
    expect(files).toEqual([...files].sort());
    expect(readHotsEffectLooks().size).toBe(files.length);
  });

  it("are keyed by Heroes of the Storm's effect model paths, default skins only", () => {
    for (const file of Object.keys(raw.effects)) expect(file).toMatch(/^Assets\/Effects\/Storm_[^/]*_Base[^/]*\/[^/]+\.m3$/);
  });

  it("leave out the two effects that were never filmed", () => {
    for (const unfilmed of ["Storm_FX_MalGanis_Base_Death", "Storm_Effect_Arthas_Base_FrostStrike_Impact"]) {
      expect(Object.keys(raw.effects).filter((file) => file.includes(`/${unfilmed}/`))).toEqual([]);
    }
  });

  it("hold only our fields, in the file's order: no animations, emitters or textures read from the model", () => {
    for (const [file, look] of Object.entries(raw.effects)) {
      expect(Object.keys(look), file).toEqual(EFFECT_LOOK_FIELDS.filter((field) => field in look));
    }
  });

  it("carry no link or address, and file paths only as their keys", () => {
    for (const [file, look] of Object.entries(raw.effects)) expect(JSON.stringify(look), file).not.toMatch(/https?:|www\.|@\w+\.\w|\.(m3|dds|sc2(mod|map|campaign)|stormmod|stormmap)\b|assets[\\/]|storm_/i);
  });

  it("say in the file that the words are ours, and that no pictures ship", () => {
    expect(raw.about).toMatch(/Heroes of the Storm/);
    expect(raw.about).toMatch(/our own words/);
    expect(raw.about).toMatch(/nothing else here is extracted from either game/);
    expect(raw.about).toMatch(/no pictures/);
  });

  it("are written with two-space indentation, as the other data files are", () => {
    expect(text).toBe(`${JSON.stringify(raw, null, 2)}\n`);
  });
});

describe("the one rule", () => {
  // HotS effect paths name the hero they were made for, and often its ability and a battleground;
  // the words about them never name a hero, place or game. Words that are also plain English (Nova,
  // Tracer, Murky, Blaze, Butcher, Stitches, Tinker, Monk, Raven) are left out of the list: many
  // looks rightly say "a fire nova" or "a tracer line".
  const NAMES = [
    "Abathur", "Alarak", "Alexstrasza", "Anduin", "Anub'arak", "Anubarak", "Artanis", "Arthas", "Auriel", "Azmodan", "Brightwing", "Cassia", "Chen", "Chromie", "D.Va", "Deathwing", "Deckard", "Dehaka",
    "Diablo", "Falstad", "Fenix", "Gall", "Garrosh", "Gazlowe", "Genji", "Greymane", "Gul'dan", "Guldan", "Hanzo", "Hogger", "Illidan", "Imperius", "Jaina", "Johanna", "Junkrat", "Kael'thas", "Kaelthas",
    "Kel'Thuzad", "Kelthuzad", "Kerrigan", "Kharazim", "Leoric", "Li Ming", "Lúcio", "Lucio", "Lunara", "Maiev", "Mal'Ganis", "Malganis", "Malfurion", "Malthael", "Medivh", "Mephisto", "Morales", "Muradin",
    "Nazeebo", "Orphea", "Probius", "Qhira", "Ragnaros", "Raynor", "Rehgar", "Rexxar", "Samuro", "Sonya", "Stukov", "Sylvanas", "Tassadar", "Thrall", "Tychus", "Tyrael", "Tyrande", "Uther", "Valeera",
    "Valla", "Varian", "Whitemane", "Xul", "Yrel", "Zagara", "Zarya", "Zeratul", "Zul'jin", "Zuljin", "Mengsk",
    "Hanamura", "Braxis", "Volskaya", "Alterac", "Warcraft", "Overwatch",
  ];
  const escape = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  it("the looks name no hero, place or game, even where the model's path does", () => {
    const named = Object.entries(raw.effects).flatMap(([file, look]) => {
      const words = JSON.stringify(look);
      return NAMES.filter((name) => new RegExp(`(?<![\\p{L}])${escape(name)}(?![\\p{L}])`, "iu").test(words)).map((name) => `${file}: ${name}`);
    });
    expect(named).toEqual([]);
  });
});

describe("parsing a looks file", () => {
  const look = { kind: "burst", look: "A bright blue flash the size of a Marine, gone in a moment.", colors: ["blue"], size: "medium", moving: "stays", afterDestroy: "gone", facets: ["flash", "blue", "impact"], suits: ["spell impact"], confidence: "high", problems: [] };
  const file = (effects: Record<string, unknown>) => JSON.stringify({ about: "x", effects });

  it("takes a look", () => {
    expect(parseHotsEffectLooks(file({ "Assets/Effects/Storm_Flash_Base/Storm_Flash_Base.m3": look }), "ok.json")).toHaveProperty(["Assets/Effects/Storm_Flash_Base/Storm_Flash_Base.m3", "kind"], "burst");
  });

  it("refuses a field that isn't ours, naming the effect", () => {
    expect(() => parseHotsEffectLooks(file({ "Assets/Effects/Flash.m3": { ...look, emitters: 3 } }), "bad.json")).toThrow(/bad\.json isn't a valid effect looks file.*Flash\.m3/);
  });

  it("refuses a key that isn't an effect model's path", () => {
    expect(() => parseHotsEffectLooks(file({ "Assets/Units/Marine/Marine.m3": look }), "bad.json")).toThrow(/bad\.json/);
  });
});

describe("names that must not ship", () => {
  // The names live outside the repo: set MUSIC_NOTES_DENYLIST to a file of them to run this.
  it.skipIf(!process.env.MUSIC_NOTES_DENYLIST)("are not named by the shipped looks (names from MUSIC_NOTES_DENYLIST)", () => {
    const terms = parseDenylist(readFileSync(process.env.MUSIC_NOTES_DENYLIST!, "utf8"));
    expect(findDeniedNames(raw.effects, terms)).toEqual([]);
  });
});
