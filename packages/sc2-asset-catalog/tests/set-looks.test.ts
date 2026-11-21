// The shipped set looks (data/set-looks.json): what we wrote and measured of each cinematic set,
// with its name and files as keys and nothing else from the game. A test can check their shape and
// keys; that they name no campaign of the author's is checked against names kept outside this repo
// (MUSIC_NOTES_DENYLIST, the music notes' list), by the last test when that variable is set.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SET_LOOKS_PATH } from "../src/catalog/catalog-dirs.js";
import { findDeniedNames, parseDenylist } from "../src/catalog/music-notes.js";
import { parseSetLooks, readSetLooks, SET_LOOK_FIELDS, setPictureUrl } from "../src/catalog/set-looks.js";

const text = readFileSync(SET_LOOKS_PATH, "utf8");
const raw = JSON.parse(text) as { about: string; sets: Record<string, Record<string, unknown>> };

describe("the shipped set looks", () => {
  it("are a valid looks file of dozens of sets, by id in order", () => {
    expect(() => parseSetLooks(text, "set-looks.json")).not.toThrow();
    const ids = Object.keys(raw.sets);
    expect(ids.length).toBeGreaterThan(50);
    expect(ids).toEqual([...ids].sort());
    expect(readSetLooks().size).toBe(ids.length);
  });

  it("hold only our fields: no marks, models or anything else read from the game's files", () => {
    const allowed = new Set(SET_LOOK_FIELDS);
    for (const [id, look] of Object.entries(raw.sets)) for (const field of Object.keys(look)) expect(allowed.has(field), `${id}.${field}`).toBe(true);
    for (const forbidden of ["marks", "models", "pieces", "cameraNames", "lights", "origins", "from", "game"]) expect(SET_LOOK_FIELDS).not.toContain(forbidden);
  });

  it("carry no link or address, and file paths only as its files", () => {
    for (const [id, { files: _files, ...look }] of Object.entries(raw.sets)) expect(JSON.stringify(look), id).not.toMatch(/https?:|www\.|@\w+\.\w|\.sc2(cutscene|mod|campaign|map)/i);
  });

  it("give every set a picture, and say in the file that the words are ours and where the pictures are", () => {
    for (const [id, look] of Object.entries(raw.sets)) expect((look.pictures as unknown[]).length, id).toBeGreaterThan(0);
    expect(raw.about).toMatch(/our own words/);
    expect(raw.about).toMatch(/nothing else here is extracted from the game/);
    expect(raw.about).toMatch(/sc2-mapping-reference/);
  });
});

describe("parsing a looks file", () => {
  const look = Object.values(raw.sets)[0]!;
  it("refuses a field that isn't ours, naming the set", () => {
    expect(() => parseSetLooks(JSON.stringify({ about: "x", sets: { "a-room": { ...look, marks: ["Someone"] } } }), "bad.json")).toThrow(/bad\.json isn't a valid set looks file.*a-room/);
  });

  it("refuses a picture outside card/ and a file that isn't a cutscene", () => {
    expect(() => parseSetLooks(JSON.stringify({ about: "x", sets: { "a-room": { ...look, pictures: [{ file: "plan.jpg", shows: "x" }] } } }), "bad.json")).toThrow(/pictures/);
    expect(() => parseSetLooks(JSON.stringify({ about: "x", sets: { "a-room": { ...look, files: ["a.txt"] } } }), "bad.json")).toThrow(/files/);
  });
});

describe("a set picture's address", () => {
  it("is the gallery's folder for the set, with -game for the in-game frame and _tn for the thumbnail", () => {
    expect(setPictureUrl("a-room", "card/1.jpg")).toBe("https://raw.githubusercontent.com/TeamAntioch/sc2-mapping-reference/main/public/sets/a-room/card/1.jpg");
    expect(setPictureUrl("a-room", "card/1.jpg", { inGame: true, thumbnail: true })).toMatch(/\/a-room\/card\/1-game_tn\.jpg$/);
    expect(setPictureUrl("a-room", "plan.jpg", { base: "/sets/" })).toBe("/sets/a-room/plan.jpg");
  });
});

describe("names that must not ship", () => {
  // The names live outside the repo: set MUSIC_NOTES_DENYLIST to a file of them to run this.
  it.skipIf(!process.env.MUSIC_NOTES_DENYLIST)("are not named by the shipped looks (names from MUSIC_NOTES_DENYLIST)", () => {
    const terms = parseDenylist(readFileSync(process.env.MUSIC_NOTES_DENYLIST!, "utf8"));
    expect(findDeniedNames(raw.sets, terms)).toEqual([]);
  });
});
