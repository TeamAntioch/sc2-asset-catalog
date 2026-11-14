// Extracting the music's fields from a mirror of the game's data (src/catalog/extract-music.ts):
// parsing the data files, resolving Soundtracks to files, finding where scripts use them, and the
// whole extraction over a fake fetch. Nothing here touches the network.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildExtractedMusic,
  extractMusic,
  hasExtractedMusic,
  MUSIC_EXTRACTED_FILE,
  MUSIC_MIRROR_RAW_URL,
  MUSIC_MIRROR_TREE_URL,
  mirrorFiles,
  musicRole,
  packageOf,
  parseSoundData,
  parseSoundtrackData,
  resolveMusic,
  scanMusicUsage,
  selectMusicFiles,
} from "../src/catalog/extract-music.js";

let dir: string | undefined;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const catalog = (body: string) => `<?xml version="1.0" encoding="us-ascii"?>\n<Catalog>\n${body}\n</Catalog>\n`;

const VOID_SOUNDTRACKS = catalog(`    <CSoundtrack default="1" id="Music"/>
    <CSoundtrack id="Space_Main">
        <MasterLayer Sound="Space_Main_Sound"/>
        <Flags index="Continuous" value="1"/>
        <Next value="Space_Tail"/>
        <Delay value="2.5"/>
    </CSoundtrack>
    <CSoundtrack id="Space_Tail" parent="Space_Main">
        <MasterLayer Sound="Space_Tail_Sound"/>
    </CSoundtrack>
    <CSoundtrack id="Ambience_Cave" parent="Ambience_Map">
        <MasterLayer Sound="Cave_Wind"/>
    </CSoundtrack>
    <CSoundtrack id="Shared">
        <MasterLayer Sound="Shared_Sound"/>
        <Sections Sound="Layer_Sound"/>
    </CSoundtrack>`);
const VOID_SOUNDS = catalog(`    <CSound default="1" id="Music_Base">
        <Category value="Music"/>
    </CSound>
    <CSound id="Space_Main_Sound" parent="Music_Base">
        <AssetArray File="Assets\\Music\\Space_1_FULL.ogg"/>
        <AssetArray File="Assets\\Music\\Space_2_FULL.ogg"/>
    </CSound>
    <CSound id="Layer_Sound" parent="Music_Base">
        <AssetArray File="Assets\\Music\\Layer.ogg"/>
    </CSound>
    <CSound id="Space_Tail_Sound" parent="Music_Base"/>
    <CSound id="Cave_Wind" parent="Music_Base">
        <AssetArray File="Assets\\Sounds\\Wind.ogg"/>
    </CSound>
    <CSound id="Shared_Sound" parent="Music_Base">
        <AssetArray File="Assets\\Music\\Shared.ogg"/>
    </CSound>
    <CSound id="Shared" parent="Music_Base">
        <AssetArray File="Assets\\Music\\SharedStinger.ogg"/>
    </CSound>
    <CSound id="Lonely_Cue" parent="Music_Base">
        <AssetArray File="Assets\\Music\\Lonely.ogg"/>
    </CSound>
    <CSound id="Door_Click">
        <Category value="SFX"/>
        <AssetArray File="Assets\\Sounds\\Click.ogg"/>
    </CSound>`);
// A map's own data, after its campaign's.
const MAP_SOUNDTRACKS = catalog(`    <CSoundtrack id="Space_Main">
        <MasterLayer Sound="Map_Main_Sound"/>
    </CSoundtrack>
    <CSoundtrack id="Map_Only">
        <MasterLayer Sound="Map_Main_Sound"/>
    </CSoundtrack>`);
const MAP_SOUNDS = catalog(`    <CSound id="Map_Main_Sound" parent="Music_Base">
        <AssetArray File="Assets\\Music\\MissionMusic\\Map_Main.ogg"/>
    </CSound>`);

const VOID = "campaigns/void.sc2campaign/base.sc2data/GameData";
const MAP = "campaigns/void.sc2campaign/base.sc2maps/maps/campaign/protoss/pcamp01.sc2map/base.sc2data/GameData";
const PATHS = {
  voidSoundtracks: `${VOID}/SoundtrackData.xml`,
  voidSounds: `${VOID}/SoundData.xml`,
  mapSoundtracks: `${MAP}/SoundtrackData.xml`,
  mapSounds: `${MAP}/SoundData.xml`,
  script: "campaigns/void.sc2campaign/base.sc2maps/maps/campaign/protoss/pcamp01.sc2map/MapScript.galaxy",
  cutscene: "campaigns/void.sc2campaign/base.sc2maps/maps/campaign/protoss/pcamp01.sc2map/Cutscenes/Intro.SC2Cutscene",
};
const SCRIPT = `void gt_Setup () {\n}\n\nbool gt_Intro_Func (bool testConds, bool runActions) {\n    SoundtrackPlay(PlayerGroupAll(), c_soundtrackCategoryMusic, "Space_Main", 0, true);\n    SoundPlayForPlayer(SoundLink("Lonely_Cue", -1), 1, 100.0, 0.0, 0.0);\n    return true;\n}\n`;
const CUTSCENE = `<Node soundLink="Lonely_Cue"/>\n<Node soundLink="Door_Click"/>\n`;

const FILES: Record<string, string> = {
  [PATHS.voidSoundtracks]: VOID_SOUNDTRACKS,
  [PATHS.voidSounds]: VOID_SOUNDS,
  [PATHS.mapSoundtracks]: MAP_SOUNDTRACKS,
  [PATHS.mapSounds]: MAP_SOUNDS,
  [PATHS.script]: SCRIPT,
  [PATHS.cutscene]: CUTSCENE,
};
const LISTING = [
  ...Object.keys(FILES),
  "mods/heroes.stormmod/base.sc2data/GameData/SoundtrackData.xml",
  "mods/mutators/x.sc2mod/Mutator.galaxy",
  "campaigns/void.sc2campaign/base.sc2maps/maps/campaign/protoss/silent.sc2map/base.sc2data/GameData/SoundData.xml",
  "README.md",
];

/** A fetch that answers from a table of URLs, 404 for anything else, and records what it was asked. */
function fakeFetch(table: Record<string, string>) {
  const asked: string[] = [];
  const fetch = (async (url: string | URL): Promise<Response> => {
    asked.push(String(url));
    const body = table[String(url)];
    return body === undefined ? new Response("not found", { status: 404 }) : new Response(body, { status: 200 });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
}

const mirror = (): Record<string, string> => ({
  [MUSIC_MIRROR_TREE_URL]: JSON.stringify({ tree: LISTING.map((file) => ({ path: file, type: "blob" })), truncated: false }),
  ...Object.fromEntries(Object.entries(FILES).map(([file, text]) => [`${MUSIC_MIRROR_RAW_URL}/${file.split("/").map(encodeURIComponent).join("/")}`, text])),
});

describe("selecting the files to read", () => {
  it("takes the data files, the scripts and the cutscenes, and leaves out Heroes, mutators and maps without a Soundtrack file", () => {
    const { data, usage } = selectMusicFiles(LISTING);
    expect(data).toEqual([PATHS.mapSoundtracks, PATHS.mapSounds, PATHS.voidSoundtracks, PATHS.voidSounds].sort());
    expect(usage).toEqual([PATHS.cutscene, PATHS.script].sort());
  });
});

describe("parsing the data files", () => {
  it("reads a CSoundtrack's layers, flags and timing, and cites its line", () => {
    const parsed = parseSoundtrackData(VOID_SOUNDTRACKS, "a.xml");
    expect(parsed.find((s) => s.id === "Music")).toMatchObject({ isDefault: true });
    expect(parsed.find((s) => s.id === "Space_Main")).toMatchObject({ file: "a.xml", line: 4, master: ["Space_Main_Sound"], slaves: [], flags: { Continuous: "1" }, next: "Space_Tail", delay: "2.5" });
    expect(parsed.find((s) => s.id === "Space_Tail")?.parent).toBe("Space_Main");
  });

  it("reads a CSound's files, category and parent", () => {
    const parsed = parseSoundData(VOID_SOUNDS, "b.xml");
    expect(parsed.find((s) => s.id === "Space_Main_Sound")).toMatchObject({ parent: "Music_Base", assets: ["Assets\\Music\\Space_1_FULL.ogg", "Assets\\Music\\Space_2_FULL.ogg"] });
    expect(parsed.find((s) => s.id === "Music_Base")).toMatchObject({ isDefault: true, category: "Music" });
    expect(parsed.find((s) => s.id === "Space_Tail_Sound")?.assets).toEqual([]);
  });

  it("copes with a byte order mark, Windows line ends and entities", () => {
    const text = `﻿<Catalog>\r\n    <CSound id="A&amp;B" parent="P">\r\n        <AssetArray File="Assets\\Music\\A&amp;B.ogg"/>\r\n    </CSound>\r\n</Catalog>\r\n`;
    expect(parseSoundData(text, "c.xml")).toMatchObject([{ id: "A&B", parent: "P", assets: ["Assets\\Music\\A&B.ogg"] }]);
  });
});

describe("resolving the music", () => {
  const resolved = resolveMusic(
    [...parseSoundtrackData(VOID_SOUNDTRACKS, PATHS.voidSoundtracks), ...parseSoundtrackData(MAP_SOUNDTRACKS, PATHS.mapSoundtracks)],
    [...parseSoundData(VOID_SOUNDS, PATHS.voidSounds), ...parseSoundData(MAP_SOUNDS, PATHS.mapSounds)],
  );
  const byKind = (id: string, kind: string) => resolved.find((music) => music.id === id && music.kind === kind);

  it("plays a Soundtrack's files through its sounds' parents, section layers too", () => {
    expect(byKind("Space_Tail", "Soundtrack")?.sounds.map((sound) => sound.id)).toEqual(["Space_Tail_Sound"]);
    expect(byKind("Shared", "Soundtrack")?.assets).toEqual(["Assets\\Music\\Shared.ogg", "Assets\\Music\\Layer.ogg"]);
    expect(byKind("Shared", "Soundtrack")?.sounds.map((sound) => `${sound.id}:${sound.layer}`)).toEqual(["Shared_Sound:master", "Layer_Sound:slave"]);
  });

  it("lets a map's own definition win over its campaign's, field by field", () => {
    expect(byKind("Space_Main", "Soundtrack")).toMatchObject({ assets: ["Assets\\Music\\MissionMusic\\Map_Main.ogg"], continuous: "1", next: "Space_Tail", delay: "2.5" });
    expect(byKind("Space_Main", "Soundtrack")?.defs.map((def) => def.file)).toEqual([PATHS.voidSoundtracks, PATHS.mapSoundtracks]);
  });

  it("leaves out defaults and ambience, and lists a Music sound no music Soundtrack plays", () => {
    expect(resolved.some((music) => music.id === "Music" || music.id === "Ambience_Cave")).toBe(false);
    expect(byKind("Lonely_Cue", "Sound")).toMatchObject({ assets: ["Assets\\Music\\Lonely.ogg"] });
    expect(byKind("Door_Click", "Sound")).toBeUndefined();
    expect(byKind("Shared_Sound", "Sound")).toBeUndefined();
    // The map's Space_Main plays another sound, so the campaign's is played by nothing now; and Cave_Wind is only played by an ambience.
    expect(byKind("Space_Main_Sound", "Sound")).toBeDefined();
    expect(byKind("Cave_Wind", "Sound")).toBeDefined();
  });

  it("keeps both when an id is a Soundtrack and a Sound", () => {
    expect(byKind("Shared", "Soundtrack")).toBeDefined();
    expect(byKind("Shared", "Sound")).toBeDefined();
  });
});

describe("finding where music is used", () => {
  const ids = new Set(["Space_Main", "Lonely_Cue", "Door_Click"]);

  it("finds the ids named in a script, with the function they sit in", () => {
    const found = scanMusicUsage(PATHS.script, SCRIPT, ids);
    expect(found.get("Space_Main")).toEqual([{ file: PATHS.script, line: 5, func: "gt_Intro_Func" }]);
    expect(found.get("Lonely_Cue")).toHaveLength(1);
  });

  it("finds the soundLinks of a cutscene file", () => {
    const found = scanMusicUsage(PATHS.cutscene, CUTSCENE, ids);
    expect([...found.keys()].sort()).toEqual(["Door_Click", "Lonely_Cue"]);
    expect(found.get("Lonely_Cue")?.[0]).toEqual({ file: PATHS.cutscene, line: 1, func: "SC2Cutscene" });
  });
});

describe("the records", () => {
  it("name the package that defines an id last, its dependency, and whether only a map holds it", () => {
    const records = buildExtractedMusic(
      resolveMusic(
        [...parseSoundtrackData(VOID_SOUNDTRACKS, PATHS.voidSoundtracks), ...parseSoundtrackData(MAP_SOUNDTRACKS, PATHS.mapSoundtracks)],
        [...parseSoundData(VOID_SOUNDS, PATHS.voidSounds), ...parseSoundData(MAP_SOUNDS, PATHS.mapSounds)],
      ),
      new Map([["Space_Tail", [{ file: PATHS.script, line: 9 }]]]),
    );
    expect(records.map((record) => `${record.id}:${record.kind}`)).toEqual([
      "Cave_Wind:Sound",
      "Lonely_Cue:Sound",
      "Map_Only:Soundtrack",
      "Shared:Soundtrack",
      "Shared:Sound",
      "Space_Main:Soundtrack",
      "Space_Main_Sound:Sound",
      "Space_Tail:Soundtrack",
    ]);
    const get = (id: string) => records.find((record) => record.id === id)!;
    expect(get("Lonely_Cue")).toMatchObject({ package: "campaigns/void.sc2campaign", dependency: "bnet:Void (Campaign)/0.0/999,file:Campaigns/Void.SC2Campaign", empty: false });
    expect(get("Lonely_Cue")).not.toHaveProperty("mapLocal");
    expect(get("Map_Only")).toMatchObject({ mapLocal: "pcamp01.sc2map" });
    expect(get("Map_Only")).not.toHaveProperty("dependency");
    expect(get("Space_Main")).toMatchObject({ mapLocal: "pcamp01.sc2map", continuous: true, delay_s: 2.5, next: "Space_Tail", sounds: ["Map_Main_Sound"] });
    expect(get("Space_Tail")).toMatchObject({ usedCount: 1, usedIn: [{ line: 9 }], empty: true });
  });

  it("work out a role from the words of the id", () => {
    expect(musicRole("ZSpace02MusicCutscene19_KerriganSavesRaynor")).toBe("cutscene");
    expect(musicRole("Terran_Victory_01")).toBe("victory");
    expect(musicRole("Sparkle")).toBe("other");
  });

  it("find the package folder in a path", () => {
    expect(packageOf("mods/starcoop/starcoop.sc2mod/base.sc2data/GameData/SoundData.xml")).toBe("mods/starcoop/starcoop.sc2mod");
    expect(packageOf("mods/void.sc2mod/base.sc2data/x.xml")).toBe("mods/void.sc2mod");
  });
});

describe("listing the mirror's files", () => {
  it("uses GitHub's API, with the token when there is one", async () => {
    const headers: unknown[] = [];
    const fetch = (async (_url: string | URL, init?: RequestInit) => {
      headers.push(init?.headers);
      return new Response(JSON.stringify({ tree: [{ path: "a/b.xml", type: "blob" }, { path: "a", type: "tree" }] }));
    }) as typeof globalThis.fetch;
    expect(await mirrorFiles({ fetch, env: { GITHUB_TOKEN: "t0k" } })).toEqual(["a/b.xml"]);
    expect(headers[0]).toMatchObject({ authorization: "Bearer t0k" });
  });

  it("asks git when the API refuses or cuts the listing short, and says so", async () => {
    const log: string[] = [];
    const refused = (async () => new Response("", { status: 403 })) as typeof globalThis.fetch;
    expect(await mirrorFiles({ fetch: refused, listMirrorFiles: async () => ["x.xml"], log: (line) => log.push(line) })).toEqual(["x.xml"]);
    expect(log.join()).toMatch(/HTTP 403.*git lists them instead/);
    const truncated = (async () => new Response(JSON.stringify({ truncated: true, tree: [] }))) as typeof globalThis.fetch;
    expect(await mirrorFiles({ fetch: truncated, listMirrorFiles: async () => ["y.xml"] })).toEqual(["y.xml"]);
  });

  it("names both failures when neither answers", async () => {
    const refused = (async () => new Response("", { status: 403 })) as typeof globalThis.fetch;
    await expect(mirrorFiles({ fetch: refused, listMirrorFiles: async () => { throw new Error("no git"); } })).rejects.toThrow(/HTTP 403, and git failed \(no git\)/);
  });
});

describe("extracting the music", () => {
  it("fetches the files, writes the records and says what it found", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "music-extract-"));
    const { fetch, asked } = fakeFetch(mirror());
    const log: string[] = [];
    const { records, counts } = await extractMusic({ fetch, extractedDir: dir, log: (line) => log.push(line) });
    expect(counts).toEqual({ ids: 8, soundtracks: 4, sounds: 4, files: 8, used: 2, scripts: 2 });
    expect(records.find((record) => record.id === "Lonely_Cue")).toMatchObject({ usedCount: 2 });
    expect(hasExtractedMusic(dir)).toBe(true);
    expect(JSON.parse(await readFile(path.join(dir, MUSIC_EXTRACTED_FILE), "utf8"))).toHaveLength(8);
    expect(JSON.parse(await readFile(path.join(dir, "music-extracted-info.json"), "utf8"))).toMatchObject({ ids: 8, source: MUSIC_MIRROR_RAW_URL });
    expect(asked.filter((url) => url.startsWith(MUSIC_MIRROR_RAW_URL))).toHaveLength(6);
    expect(asked.some((url) => url.includes("heroes") || url.includes("silent.sc2map"))).toBe(false);
    expect(log.at(-1)).toMatch(/8 music ids \(4 Soundtracks, 4 Sounds\)/);
  });

  it("writes nothing when a file can't be fetched, so an earlier extraction stays whole", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "music-extract-"));
    const table = mirror();
    delete table[`${MUSIC_MIRROR_RAW_URL}/${PATHS.script.split("/").map(encodeURIComponent).join("/")}`];
    await expect(extractMusic({ fetch: fakeFetch(table).fetch, extractedDir: dir })).rejects.toThrow(/MapScript\.galaxy: HTTP 404/);
    expect(hasExtractedMusic(dir)).toBe(false);
  });

  it("refuses a listing with no music data", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "music-extract-"));
    const table = { [MUSIC_MIRROR_TREE_URL]: JSON.stringify({ tree: [{ path: "README.md", type: "blob" }] }) };
    await expect(extractMusic({ fetch: fakeFetch(table).fetch, extractedDir: dir })).rejects.toThrow(/no SoundtrackData\.xml/);
  });
});
