// The Finder's start function (src/start.ts), as the package's own CLI runs it, with a fake
// embeddings model and made-up sets: the page and its routes, a set's page, a host's pictures
// served from its folder and nothing else, asks with the kind chips' tag, ticks and what they copy,
// and the CLI's arguments. No calls.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setCards } from "../src/cards.ts";
import { parseFinderArgs } from "../src/cli/set-finder.ts";
import { NO_JEV_KEY } from "../src/credentials.ts";
import { type RunningSetFinder, SET_FINDER_PORT, startSetFinder } from "../src/start.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { CARDS, GALLERY, look, LOOKS } from "./fixtures.ts";

let dir: string;
let running: RunningSetFinder | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "set-finder-start-"));
});
afterEach(async () => {
  await running?.close();
  running = undefined;
  await rm(dir, { recursive: true, force: true });
});

/** An environment with no TypeSafe key: no variable, and an empty config folder of its own. */
const noKey = () => ({ SC2_ASSET_CATALOG_CONFIG: path.join(dir, "config") });

const start = async (options: Parameters<typeof startSetFinder>[0] = {}) =>
  (running = await startSetFinder({ cards: CARDS, embedder: fakeEmbedder(), cacheDir: path.join(dir, "cache"), port: 0, env: noKey(), ...options }));

const get = (route: string) => fetch(new URL(route, running!.url));
const post = async (route: string, body: unknown) => {
  const response = await fetch(new URL(route, running!.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

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

describe("the page and its routes", () => {
  it("serves a page whose script parses, and says it is the Set Finder", async () => {
    await start();
    const html = await (await get("/")).text();
    expect(html).toContain("<title>Set Finder</title>");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
    expect(scripts).toHaveLength(1);
    expect(() => new vm.Script(scripts[0]!)).not.toThrow();
    expect(scripts[0]).toContain('["room","exterior","space","props","effects","unclear"]');
    expect(await (await get("/status")).json()).toMatchObject({ finder: "set-finder" });
  });

  it("starts with the public defaults: no key, a port of its own, its vectors in the cache folder", async () => {
    await start();
    expect(running!.off).toBe(NO_JEV_KEY);
    expect(running!.cards).toBe(3);
    expect(running!.embeddedOnOpen).toBe(3);
    expect(running!.payloadLog).toBeUndefined();
    expect(SET_FINDER_PORT).toBe(4636);
    expect((await get("/state").then((r) => r.json())).ranker).toBeNull();
  });

  it("gives every set's card by name for the gallery, its pictures linked from the gallery", async () => {
    await start();
    const { cards } = (await (await get("/cards")).json()) as { cards: { id: string; kind: string; html: string }[] };
    expect(cards.map((card) => [card.id, card.kind])).toEqual([
      ["dive-bar", "room"],
      ["night-street", "exterior"],
      ["ship-bridge", "room"],
    ]);
    expect(cards[0]!.html).toContain(`src="${GALLERY}/dive-bar/card/1.jpg"`);
    // The strip has the other picture's thumbnail, then the frame filmed in game.
    expect(cards[0]!.html).toContain(`src="${GALLERY}/dive-bar/card/2_tn.jpg"`);
    expect(cards[0]!.html).toContain(`src="${GALLERY}/dive-bar/card/2-game_tn.jpg"`);
    expect(cards[0]!.html).toContain('class="tick"');
    expect(cards[2]!.html).toContain("look: medium confidence");
  });

  it("serves a set's page, each card picture beside its frame in game, then the plan and overview", async () => {
    await start();
    const page = await (await get("/set/dive-bar")).text();
    expect(page).toContain("<title>Dive Bar · Set Finder</title>");
    expect(page).toMatch(/<div class="pair"><figure>.*card\/1\.jpg.*<div class="missing">/);
    expect(page).toMatch(/<div class="pair"><figure>.*card\/2\.jpg.*card\/2-game\.jpg/);
    expect(page).toContain(`${GALLERY}/dive-bar/plan.jpg`);
    expect(page).toContain(`${GALLERY}/dive-bar/overview.jpg`);
    expect(page).toContain("Cutscenes/DiveBar.SC2Cutscene");
    expect(page).toContain("The far wall is open.");
    expect((await get("/set/cellar")).status).toBe(404);
  });

  it("serves a host's pictures from its folder, and nothing else", async () => {
    const views = path.join(dir, "views");
    await mkdir(path.join(views, "cellar", "card"), { recursive: true });
    for (const file of ["card/1.jpg", "card/2-game.jpg", "plan.jpg", "spec.json"]) await writeFile(path.join(views, "cellar", file), `picture ${file}`);
    await writeFile(path.join(views, "secret.jpg"), "secret");
    const cards = setCards(LOOKS, { base: GALLERY, extra: [{ looks: { cellar: look("Cellar", "room", "A low brick cellar with barrels along the walls and one bulb hanging from the ceiling.", ["interior", "cellar"]) }, pictures: { dir: views }, source: "mine" }] });
    await start({ cards });
    const picture = await get("/pictures/cellar/card/1.jpg");
    expect(picture.headers.get("content-type")).toBe("image/jpeg");
    expect(await picture.text()).toBe("picture card/1.jpg");
    expect((await get("/pictures/cellar/card/2-game.jpg")).status).toBe(200);
    expect((await get("/pictures/cellar/plan.jpg")).status).toBe(200);
    for (const refused of ["/pictures/cellar/overview.jpg", "/pictures/cellar/spec.json", "/pictures/cellar/..%2Fsecret.jpg", "/pictures/cellar/%2e%2e/secret.jpg", "/pictures/dive-bar/card/1.jpg", "/pictures/nothing/card/1.jpg"]) {
      expect((await get(refused)).status, refused).toBe(404);
    }
    const { cards: shown } = (await (await get("/cards")).json()) as { cards: { id: string; html: string }[] };
    expect(shown.find((card) => card.id === "cellar")!.html).toContain('src="/pictures/cellar/card/1.jpg"');
  });
});

describe("asking", () => {
  it("narrows an ask, keeps the kinds the chips pin, and copies a ticked set's id, name and files", async () => {
    await start();
    const narrowed = await ask("a bar");
    expect(narrowed.cards[0].id).toBe("dive-bar");
    expect(narrowed.cards[0].html).toContain("grubby bar");

    await post("/tag", { facet: "kind", value: "exterior", action: "pin" });
    const pinned = await ask("a bar");
    expect(pinned.cards.map((card: { id: string }) => card.id)).toEqual(["night-street"]);

    const ticked = await post("/tick", { ask: "a bar", id: "night-street", ticked: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.tray.items[0]).toMatchObject({ id: "night-street", name: "Night Street", copy: "night-street (Night Street): Cutscenes/NightStreet.SC2Cutscene" });
    expect(ticked.body.tags).toEqual(expect.arrayContaining([expect.objectContaining({ facet: "kind", value: "exterior", pinned: true }), expect.objectContaining({ facet: "facet", value: "city", pinned: false })]));
  });

  it("ranks an ask with the ranker given, under the session's spend cap, and find shares it", async () => {
    await start({
      budget: 0.5,
      ranker: { name: "jev", rank: async ({ candidates }) => ({ ranker: "jev", model: "jev-test", grades: new Map(candidates.map((card) => [card.id, { level: card.id === "ship-bridge" ? 3 : 0.5 }])), timings: { request: 1, total: 1 }, usage: { input: 1, output: 0 }, cost: 0.3 }) },
    });
    const ranked = await nextEvent("ranked", () => post("/ask", { text: "a cockpit", mode: "enter" }));
    expect(ranked.cards[0]).toMatchObject({ id: "ship-bridge", level: 3, levelName: "reads as exactly this" });
    const found = await running!.finder.find("a cockpit");
    expect(found.ranked).toBe(true);
    expect(running!.spend).toBeCloseTo(0.6);
    expect((await running!.finder.find("a cockpit")).notRanked).toMatch(/spend cap/);
  });
});

describe("the CLI's arguments", () => {
  it("takes a port, a budget, a tick log folder and --open, and login or logout", () => {
    expect(parseFinderArgs([], "/work")).toEqual({ port: 4636, open: false });
    expect(parseFinderArgs(["--port", "0", "--budget", "0.25", "--tick-log", "logs", "--open"], "/work")).toEqual({ port: 0, budget: 0.25, tickLog: path.resolve("/work", "logs"), open: true });
    expect(parseFinderArgs(["login"], "/work")).toMatchObject({ login: true });
    expect(parseFinderArgs(["--help"], "/work")).toMatchObject({ help: true });
  });

  it("refuses what it can't take, with its usage", () => {
    for (const args of [["--port", ""], ["--port", "70000"], ["--port", "four"], ["--budget=-1"], ["--budget", " "], ["--tick-log", ""], ["extract"], ["login", "now"]]) {
      expect(() => parseFinderArgs(args, "/work"), args.join(" ")).toThrow(/Usage: sc2-set-finder/);
    }
    expect(() => parseFinderArgs(["--audio", "x"], "/work")).toThrow();
  });
});
