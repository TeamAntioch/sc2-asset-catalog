// The shipped effect looks (data/effect-looks.json): what we wrote of each of the game's effect
// models from frames of it filmed in game, keyed by the model's path, with nothing else from the
// game. A test can check their shape and keys; that they name no campaign of the author's is
// checked against names kept outside this repo (MUSIC_NOTES_DENYLIST, the music notes' list), by
// the last test when that variable is set.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { EFFECT_LOOKS_PATH } from "../src/catalog/catalog-dirs.js";
import { EFFECT_LOOK_FIELDS, effectPictureUrl, parseEffectLooks, readEffectLooks } from "../src/catalog/effect-looks.js";
import { findDeniedNames, parseDenylist } from "../src/catalog/music-notes.js";

const text = readFileSync(EFFECT_LOOKS_PATH, "utf8");
const raw = JSON.parse(text) as { about: string; effects: Record<string, Record<string, unknown>> };

describe("the shipped effect looks", () => {
  it("are a valid looks file of a thousand or more effects, by path in order", () => {
    expect(() => parseEffectLooks(text, "effect-looks.json")).not.toThrow();
    const files = Object.keys(raw.effects);
    expect(files.length).toBeGreaterThan(1000);
    expect(files).toEqual([...files].sort());
    expect(readEffectLooks().size).toBe(files.length);
  });

  it("hold only our fields, in the file's order: no animations, emitters or textures read from the model", () => {
    for (const [file, look] of Object.entries(raw.effects)) {
      expect(Object.keys(look), file).toEqual(EFFECT_LOOK_FIELDS.filter((field) => field in look));
    }
    for (const forbidden of ["animations", "sequences", "emitters", "particles", "textures", "bounds", "duration", "model", "from"]) expect(EFFECT_LOOK_FIELDS).not.toContain(forbidden);
  });

  it("carry no link or address, and file paths only as their keys", () => {
    for (const [file, look] of Object.entries(raw.effects)) expect(JSON.stringify(look), file).not.toMatch(/https?:|www\.|@\w+\.\w|\.(m3|dds|sc2(mod|map|campaign))\b|assets[\\/]/i);
  });

  it("say in the file that the words are ours and where the pictures are", () => {
    expect(raw.about).toMatch(/our own words/);
    expect(raw.about).toMatch(/nothing else here is extracted from the game/);
    expect(raw.about).toMatch(/sc2-mapping-reference/);
  });

  it("are written with two-space indentation, as the other data files are", () => {
    expect(text).toBe(`${JSON.stringify(raw, null, 2)}\n`);
  });
});

describe("the one rule", () => {
  // Effect paths name the heroes they were made for; the words about them never do. Nova is left
  // out: as a word it is a ring-shaped blast ("fire nova"), which many looks rightly say.
  const HEROES = ["Abathur", "Alarak", "Artanis", "Dehaka", "Fenix", "Han", "Horner", "Karax", "Kerrigan", "Mengsk", "Mira", "Raynor", "Stetmann", "Stukov", "Swann", "Tosh", "Tychus", "Vorazun", "Zagara", "Zeratul", "Zurvan", "Amon", "Narud", "Rohana", "Selendis", "Valerian"];

  it("the looks name no character, even where the model's path does", () => {
    const named = Object.entries(raw.effects).flatMap(([file, look]) => {
      const words = JSON.stringify(look);
      return HEROES.filter((hero) => new RegExp(`\\b${hero}\\b`, "i").test(words)).map((hero) => `${file}: ${hero}`);
    });
    expect(named).toEqual([]);
  });
});

describe("parsing a looks file", () => {
  const look = { kind: "burst", look: "A bright blue flash the size of a Marine, gone in a moment.", colors: ["blue"], size: "medium", moving: "stays", afterDestroy: "gone", facets: ["flash", "blue", "impact"], suits: ["spell impact"], confidence: "high", problems: [] };
  const file = (effects: Record<string, unknown>) => JSON.stringify({ about: "x", effects });

  it("takes a look", () => {
    expect(parseEffectLooks(file({ "Assets/Effects/Protoss/Flash/Flash.m3": look }), "ok.json")).toHaveProperty(["Assets/Effects/Protoss/Flash/Flash.m3", "kind"], "burst");
  });

  it("refuses a field that isn't ours, naming the effect", () => {
    expect(() => parseEffectLooks(file({ "Assets/Effects/Flash.m3": { ...look, emitters: 3 } }), "bad.json")).toThrow(/bad\.json isn't a valid effect looks file.*Flash\.m3/);
  });

  it("refuses a key that isn't an effect model's path", () => {
    expect(() => parseEffectLooks(file({ "Assets/Units/Marine/Marine.m3": look }), "bad.json")).toThrow(/bad\.json/);
    expect(() => parseEffectLooks(file({ "Flash.m3": look }), "bad.json")).toThrow(/bad\.json/);
  });

  it("wants a size exactly when something shows", () => {
    const { size: _size, ...sizeless } = look;
    expect(() => parseEffectLooks(file({ "Assets/Effects/Flash.m3": sizeless }), "bad.json")).toThrow(/size/);
    expect(() => parseEffectLooks(file({ "Assets/Effects/Flash.m3": { ...look, kind: "nothing" } }), "bad.json")).toThrow(/size/);
    expect(() => parseEffectLooks(file({ "Assets/Effects/Flash.m3": { ...sizeless, kind: "nothing" } }), "ok.json")).not.toThrow();
  });
});

describe("an effect picture's address", () => {
  it("is the model's path under Assets/Effects in the gallery, with _tn for the thumbnail", () => {
    expect(effectPictureUrl("Assets/Effects/Protoss/Blink/Blink.m3")).toBe("https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/effects/Protoss/Blink/Blink.jpg");
    expect(effectPictureUrl("Assets/Effects/Protoss/Blink/Blink.m3", { thumbnail: true })).toMatch(/\/effects\/Protoss\/Blink\/Blink_tn\.jpg$/);
    expect(effectPictureUrl("Assets/Effects/Other/A B.m3", { base: "/effects/" })).toBe("/effects/Other/A%20B.jpg");
  });
});

describe("names that must not ship", () => {
  // The names live outside the repo: set MUSIC_NOTES_DENYLIST to a file of them to run this.
  it.skipIf(!process.env.MUSIC_NOTES_DENYLIST)("are not named by the shipped looks (names from MUSIC_NOTES_DENYLIST)", () => {
    const terms = parseDenylist(readFileSync(process.env.MUSIC_NOTES_DENYLIST!, "utf8"));
    expect(findDeniedNames(raw.effects, terms)).toEqual([]);
  });
});
