// The Finder's start function (src/start.ts), as the package's own CLI runs it, with a fake
// embeddings model and music in place of the downloads: the page and its routes, an Audio folder
// served from its index alone, asks and ticks, the options for sc2-adjutant's wrapper, the first
// start's extraction and the CLI's arguments. No calls.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { request } from "node:http";
import path from "node:path";
import vm from "node:vm";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npxHint } from "@team-antioch/sc2-asset-catalog/util/npx.js";
import { MissingRuntimeError } from "@team-antioch/sc2-finder-kit/embedder.js";

import { parseFinderArgs } from "../src/cli/music-finder.ts";
import { NO_JEV_KEY } from "../src/credentials.ts";
import { ensureMusic, type RunningFinder, startMusicFinder, stockSources } from "../src/start.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { SOURCES, VOID_CAMPAIGN } from "./fixtures.ts";

let dir: string;
let running: RunningFinder | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "music-finder-start-"));
});
afterEach(async () => {
  await running?.close();
  running = undefined;
  await rm(dir, { recursive: true, force: true });
});

const cache = () => path.join(dir, "cache");
/** An environment with no TypeSafe key: no variable, and an empty config folder of its own. */
const noKey = () => ({ SC2_ASSET_CATALOG_CONFIG: path.join(dir, "config") });
const sources = { load: async () => SOURCES, watch: [] };

const post = async (route: string, body: unknown) => {
  const response = await fetch(new URL(route, running!.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};
const get = (route: string, headers: Record<string, string> = {}) => fetch(new URL(route, running!.url), { headers });

/** The first event of a kind, read from the event stream. */
async function nextEvent(name: string, after: () => Promise<unknown>): Promise<any> {
  const controller = new AbortController();
  const response = await fetch(new URL("/events", running!.url), { signal: controller.signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  await after();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error("The events ended");
      buffer += value;
      for (const block of buffer.split("\n\n").slice(0, -1)) if (new RegExp(`^event: ${name}$`, "m").test(block)) return JSON.parse(/^data: (.*)$/m.exec(block)![1]!);
    }
  } finally {
    controller.abort();
  }
}

const ask = (text: string) => nextEvent("narrowed", () => post("/ask", { text, mode: "enter" }));

/** An Audio folder with two of the fixtures' files, one under a folder and in capitals, as an extraction leaves them. */
async function audioFolder(): Promise<string> {
  const folder = path.join(dir, "audio");
  await mkdir(path.join(folder, "Assets", "Music"), { recursive: true });
  await writeFile(path.join(folder, "Assets", "Music", "TenseApproach.ogg"), Buffer.concat([Buffer.from("OggS"), Buffer.alloc(996, 7)]));
  await writeFile(path.join(folder, "HEROICVICTORY.OGG"), Buffer.alloc(10, 1));
  // A file outside the folder that nothing may serve.
  await writeFile(path.join(dir, "secret.ogg"), "secret");
  return folder;
}

const start = async (options: Parameters<typeof startMusicFinder>[0] = {}) =>
  (running = await startMusicFinder({ sources, embedder: fakeEmbedder(), cacheDir: cache(), port: 0, env: noKey(), ...options }));

describe("the page and its routes", () => {
  it("serves a page whose script parses, and its facets", async () => {
    await start();
    const html = await (await get("/")).text();
    expect(html).toContain("<title>Music Finder</title>");
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
    expect(script).toHaveLength(1);
    expect(() => new vm.Script(script[0]!)).not.toThrow();
    const facets = await (await get("/facets")).json();
    expect(facets).toEqual({ kinds: ["ambient bed", "full cue", "loop", "silence", "stinger"], factions: ["terran", "protoss", "zerg"], dependencies: ["Void (Campaign)"], audio: { on: false, files: 0 } });
    expect(await (await get("/status")).json()).toMatchObject({ finder: "music-finder" });
  });

  it("starts with the public defaults: no key, no tick log, a cache folder of its own, and a port of its own", async () => {
    await start();
    expect(running!.off).toBe(NO_JEV_KEY);
    expect(running!.cards).toBe(7);
    expect(running!.embeddedOnOpen).toBe(7);
    expect(running!.audioFiles).toBeUndefined();
    const files = await readdir(cache());
    expect(files.filter((file) => file.startsWith("music-vectors-"))).toHaveLength(1);
    expect((await get("/state").then((r) => r.json())).tickLog).toBe(false);
    const { MUSIC_FINDER_PORT } = await import("../src/server.ts");
    expect(MUSIC_FINDER_PORT).toBe(4635);
  });

  it("refuses a request that names another host", async () => {
    await start();
    const status = await new Promise<number>((resolve, reject) => {
      const asked = request({ host: "127.0.0.1", port: new URL(running!.url).port, path: "/facets", headers: { host: "evil.example" } }, (response) => {
        response.resume();
        resolve(response.statusCode!);
      });
      asked.on("error", reject);
      asked.end();
    });
    expect(status).toBe(403);
  });
});

describe("asking", () => {
  it("answers an ask with cards that say a file can't be played without an Audio folder", async () => {
    await start();
    const narrowed = await ask("tense approach");
    expect(narrowed.cards[0].id).toBe("TenseApproach");
    expect(narrowed.cards[0].html).toContain("no Audio folder");
    expect(narrowed.cards[0].html).toContain("A tense, slow build");
    expect(narrowed.cards[0].html).toContain("Blizzard used it in: Mission.galaxy:12 (Intro) and 1 more");
    expect(narrowed.cards[0].html).not.toContain("needs ");
  });

  it("badges the cards that need a dependency and filters by pinned tags", async () => {
    await start();
    const calm = await ask("calm drone chimes");
    expect(calm.cards.find((card: any) => card.id === "CalmAmbient").html).toContain("needs Void (Campaign)");
    await post("/tag", { facet: "map has", value: "Nova Covert Ops (Art Mod)", action: "pin" });
    const without = await ask("calm drone chimes");
    expect(without.cards.map((card: any) => card.id)).not.toContain("CalmAmbient");
  });

  it("shows the hidden ids only for show: everything", async () => {
    await start();
    expect((await ask("marching patrol")).cards.map((card: any) => card.id)).not.toContain("MapOnlyTrack");
    await post("/tag", { facet: "show", value: "everything", action: "pin" });
    const all = await ask("marching patrol");
    const card = all.cards.find((found: any) => found.id === "MapOnlyTrack");
    expect(card.html).toContain("only inside Some Mission.SC2Map");
  });
});

describe("the Audio folder", () => {
  it("serves a file from its index, with byte ranges", async () => {
    await start({ audio: await audioFolder() });
    expect(running!.audioFiles).toBe(2);
    expect(await (await get("/facets")).json()).toMatchObject({ audio: { on: true, files: 2 } });
    const whole = await get("/audio/tenseapproach");
    expect(whole.status).toBe(200);
    expect(whole.headers.get("content-type")).toBe("audio/ogg");
    expect(whole.headers.get("accept-ranges")).toBe("bytes");
    expect((await whole.arrayBuffer()).byteLength).toBe(1000);
    // The key is the base name, in any case, as the page sends it.
    expect((await get("/audio/TenseApproach")).status).toBe(200);
    const part = await get("/audio/tenseapproach", { range: "bytes=4-9" });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 4-9/1000");
    expect(Buffer.from(await part.arrayBuffer())).toEqual(Buffer.alloc(6, 7));
    expect((await get("/audio/tenseapproach", { range: "bytes=5000-" })).status).toBe(416);
    expect((await get("/audio/heroicvictory")).status).toBe(200);
  });

  it("serves nothing the index doesn't hold, however it is asked for", async () => {
    await start({ audio: await audioFolder() });
    for (const asked of ["/audio/secret", "/audio/..%2Fsecret.ogg", "/audio/../secret", "/audio/%2e%2e%2fsecret", "/audio/Assets%2FMusic%2FTenseApproach.ogg", "/audio/tenseapproach.ogg", "/audio/%00", "/audio/%E0%A4%A", "/audio/", "/audio/calmambient"]) {
      const response = await get(asked);
      expect(response.status, asked).toBe(404);
      await response.arrayBuffer();
    }
  });

  it("answers 404 for every file when there is no Audio folder", async () => {
    await start();
    expect((await get("/audio/tenseapproach")).status).toBe(404);
  });

  it("marks each file on a card playable, or says it isn't in the folder", async () => {
    await start({ audio: await audioFolder() });
    const tense = (await ask("tense approach")).cards.find((card: any) => card.id === "TenseApproach");
    expect(tense.html).toContain('class="play" data-key="tenseapproach" data-from="0"');
    // A section plays from its start.
    expect(tense.html).toContain('data-key="tenseapproach" data-from="38">0:38</button>');
    const calm = (await ask("calm drone chimes")).cards.find((card: any) => card.id === "CalmAmbient");
    expect(calm.html).toContain("not in your Audio folder");
    expect(calm.html).not.toContain('class="play"');
  });

  it("refuses a folder that isn't one, before anything is downloaded", async () => {
    await expect(startMusicFinder({ audio: path.join(dir, "nowhere"), cacheDir: cache(), port: 0, env: noKey(), embedder: () => Promise.reject(new Error("the model was asked for")) })).rejects.toThrow(/--audio .*not a folder/);
  });
});

describe("the tray", () => {
  it("collects ticks and copies ids with the dependencies they need", async () => {
    await start();
    await ask("calm drone chimes");
    await post("/tick", { ask: "calm drone chimes", id: "CalmAmbient", ticked: true });
    const state = (await post("/tick", { ask: "calm drone chimes", id: "TenseApproach", ticked: true })).body as any;
    expect(state.tray.items.map(({ id, copy }: any) => [id, copy])).toEqual([
      ["CalmAmbient", "CalmAmbient (needs Void (Campaign))"],
      ["TenseApproach", "TenseApproach"],
    ]);
    expect(state.tray.copy).toBe("CalmAmbient\nTenseApproach\n\nDependencies: Void (Campaign)");
    expect((await post("/tick", { ask: "calm drone chimes", id: "NoSuchTrack", ticked: true })).status).toBe(400);
  });

  it("logs ticks only to the folder it is given", async () => {
    const logs = path.join(dir, "ticks");
    await start({ tickLog: logs });
    await ask("calm drone chimes");
    await post("/tick", { ask: "calm drone chimes", id: "CalmAmbient", ticked: true });
    expect(await readdir(logs)).toEqual(["ticks.jsonl"]);
  });
});

describe("for sc2-adjutant's wrapper", () => {
  it("adds a layer's text and facts to the cards", async () => {
    await start({ layer: (entry) => (entry.id === "HeroicVictory" ? { text: "album: Fanfares of Nowhere", facts: [{ label: "Album", value: "Fanfares of Nowhere" }] } : undefined) });
    // The layer's text is searched.
    const narrowed = await ask("Fanfares of Nowhere");
    expect(narrowed.cards.map((card: any) => card.id)).toContain("HeroicVictory");
    expect(narrowed.cards.find((card: any) => card.id === "HeroicVictory").html).toContain("Fanfares of Nowhere");
  });

  it("offers a tray action that takes the tray's cards", async () => {
    const received: string[][] = [];
    await start({
      trayActions: [{ label: "Send", inputs: [{ name: "scene", label: "Scene", required: true }], run: async ({ items, inputs }) => (received.push(items.map(({ id }) => id), [inputs.scene!]), { message: "Sent", text: "done", copied: true }) }],
    });
    expect((await get("/state").then((r) => r.json())).actions).toEqual([{ label: "Send", title: "", inputs: [{ name: "scene", label: "Scene", required: true }] }]);
    // With nothing ticked there is nothing for it to take.
    expect((await post("/action", { index: 0, inputs: { scene: "Opening" } })).status).toBe(409);
    await ask("calm drone chimes");
    await post("/tick", { ask: "calm drone chimes", id: "CalmAmbient", ticked: true });
    expect((await post("/action", { index: 0, inputs: {} })).status).toBe(400);
    const done = await post("/action", { index: 0, inputs: { scene: "Opening" } });
    expect(done.body.done.message).toBe("Sent");
    expect(received).toEqual([["CalmAmbient"], ["Opening"]]);
  });

  it("says what its status adds, behind what tells a Finder apart", async () => {
    await start({ status: { finder: "other", wrapper: "sc2-adjutant" } });
    expect(await (await get("/status")).json()).toMatchObject({ finder: "music-finder", wrapper: "sc2-adjutant" });
  });
});

describe("a first start", () => {
  it("extracts the music into the cache folder once, and says how to try again when it can't", async () => {
    const failing = () => Promise.reject(new Error("offline"));
    const options = { fetch: failing as unknown as typeof fetch, listMirrorFiles: async () => ["mods/void.sc2mod/base.sc2data/GameData/SoundtrackData.xml"] };
    await expect(ensureMusic(cache(), options)).rejects.toThrow(new RegExp(`Couldn't extract the music: .*${npxHint("@team-antioch/sc2-music-finder extract").replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    // An extraction already there is left alone: nothing is fetched.
    const dirExtracted = path.join(cache(), "extracted");
    await mkdir(dirExtracted, { recursive: true });
    await writeFile(path.join(dirExtracted, "music-extracted.json"), "[]");
    await writeFile(path.join(dirExtracted, "music-extracted-info.json"), "{}");
    await expect(ensureMusic(cache(), options)).resolves.toBeUndefined();
  });

  it("reads the stock sources from the cache folder, and says to extract when they aren't there", async () => {
    await expect(stockSources(cache()).load()).rejects.toThrow(/isn't there: run `.*sc2-music-finder extract` first/);
  });

  it("stops at once when the model can't load", async () => {
    await expect(startMusicFinder({ sources, embedder: () => Promise.reject(new MissingRuntimeError("win32")), cacheDir: cache(), port: 0, env: noKey() })).rejects.toBeInstanceOf(MissingRuntimeError);
  });
});

describe("the CLI's arguments", () => {
  const cwd = path.join(path.sep, "work");
  it("has defaults", () => {
    expect(parseFinderArgs([], cwd)).toEqual({ port: 4635, open: false });
  });

  it("reads each option, with folders from the working folder", () => {
    expect(parseFinderArgs(["--port", "0", "--budget", "2.5", "--tick-log", "ticks", "--audio", "sc2music", "--open"], cwd)).toEqual({
      port: 0,
      budget: 2.5,
      tickLog: path.join(cwd, "ticks"),
      audio: path.join(cwd, "sc2music"),
      open: true,
    });
    expect(parseFinderArgs(["--audio", path.resolve("/abs")], cwd).audio).toBe(path.resolve("/abs"));
  });

  it("reads a command", () => {
    expect(parseFinderArgs(["extract"], cwd)).toMatchObject({ extract: true });
    expect(parseFinderArgs(["login"], cwd)).toMatchObject({ login: true });
    expect(parseFinderArgs(["logout"], cwd)).toMatchObject({ logout: true });
    expect(parseFinderArgs(["--help"], cwd)).toMatchObject({ help: true });
  });

  it("refuses what it doesn't take", () => {
    expect(() => parseFinderArgs(["--port", "x"], cwd)).toThrow(/--port takes a port number/);
    expect(() => parseFinderArgs(["--port", "70000"], cwd)).toThrow(/--port takes a port number/);
    expect(() => parseFinderArgs(["--budget=-1"], cwd)).toThrow(/--budget takes US dollars/);
    expect(() => parseFinderArgs(["--audio", " "], cwd)).toThrow(/--audio takes the folder/);
    expect(() => parseFinderArgs(["stop"], cwd)).toThrow(/Usage: sc2-music-finder/);
    expect(() => parseFinderArgs(["extract", "more"], cwd)).toThrow(/Usage/);
    expect(() => parseFinderArgs(["--nope"], cwd)).toThrow();
  });
});

// Keeps the fixtures' dependency string in the test file's imports honest: the facet names the same one.
it("names the dependency the fixtures use as the page does", () => {
  expect(VOID_CAMPAIGN).toContain("Void (Campaign)");
});
