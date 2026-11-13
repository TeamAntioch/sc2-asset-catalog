// The Finder's start function with the public defaults (src/start.ts), as the package's own CLI
// runs it: in a clean folder, with no sibling repos and no TypeSafe key. On its first start it
// extracts the catalog into the cache folder; it searches the stock catalog, narrows only, collects
// ticks in the tray, and writes only to the cache folder it was given (and to a tick log only when
// one is named). A fake embeddings model and fake game data; no calls.
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { npxHint } from "@team-antioch/sc2-asset-catalog/util/npx.js";

import { parseFinderArgs } from "../src/cli/doodad-finder.ts";
import { NO_JEV_KEY } from "../src/credentials.ts";
import { saveKeyFile } from "../src/key-file.ts";
import { type RunningFinder, startFinder } from "../src/start.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { FAKE_DOODADS, fakeGameData } from "./fake-game-data.ts";

let dir: string;
let running: RunningFinder | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "doodad-finder-start-"));
});
afterEach(async () => {
  await running?.close();
  running = undefined;
  await rm(dir, { recursive: true, force: true });
});

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

const cache = () => path.join(dir, "cache");
/** An environment with no TypeSafe key: no variable, and an empty config folder of its own. */
const noKey = () => ({ SC2_ASSET_CATALOG_CONFIG: path.join(dir, "config") });

describe("startFinder with the public defaults", () => {
  it("ranks with the key `login` saved, and /status says it came from the key file, never the key", async () => {
    await saveKeyFile("ts-saved-key", { env: noKey() });
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, fetch: fakeGameData().fetch });
    expect(running.off).toBeUndefined();
    expect(running.keySource).toBe("key file");
    const status = await (await fetch(new URL("/status", running.url))).text();
    expect(JSON.parse(status).rankers).toEqual({ on: ["jev"], off: [], keySource: "key file" });
    expect(status).not.toContain("ts-saved-key");
    expect(await (await fetch(new URL("/state", running.url))).text()).not.toContain("ts-saved-key");
    expect(await (await fetch(new URL("/", running.url))).text()).not.toContain("ts-saved-key");
  });

  it("prefers TYPESAFE_API_KEY over the key file, and /status says so", async () => {
    await saveKeyFile("ts-saved-key", { env: noKey() });
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: { ...noKey(), TYPESAFE_API_KEY: "ts-env-key" }, port: 0, fetch: fakeGameData().fetch });
    expect(running.keySource).toBe("environment");
    const status = await (await fetch(new URL("/status", running.url))).text();
    expect(JSON.parse(status).rankers.keySource).toBe("environment");
    expect(status).not.toContain("ts-env-key");
  });

  it("starts from nothing with no key: extracts the catalog, then the stock catalog's cards, narrowed only, ticks collected in the tray", async () => {
    const lines: string[] = [];
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, fetch: fakeGameData().fetch, log: (line) => lines.push(line) });
    expect(running.cards).toBe(FAKE_DOODADS.length);
    expect(running.off).toBe(NO_JEV_KEY);
    expect(lines.join("\n")).toMatch(/extracting/i);

    const status = (await (await fetch(new URL("/status", running.url))).json()) as Record<string, unknown>;
    expect(status).toEqual({ finder: "doodad-finder", pid: process.pid, url: running.url, rankers: { on: [], off: [{ ranker: "jev", reason: NO_JEV_KEY }] } });

    const narrowed = await nextEvent("narrowed", () => post("/ask", { text: "supply crate", mode: "enter" }));
    expect(narrowed.cards.length).toBeGreaterThan(0);
    const [first] = narrowed.cards as { id: string }[];
    expect(first!.id).toBe("DOM_Crate");

    const ticked = await post("/tick", { ask: "supply crate", id: first!.id, ticked: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.tray.items).toMatchObject([{ id: first!.id, ask: "supply crate", copy: expect.stringContaining(first!.id) }]);
    expect(ticked.body.tray.copy).toContain(first!.id);
    expect(ticked.body).toMatchObject({ ranker: null, budget: 1, tickLog: false, badges: null, actions: [], objects: null });
    // No objects: the tray is the session's, with no lines to edit and nothing to reopen.
    expect(ticked.body.tray.asks).toBeUndefined();
    for (const route of ["/object", "/reopen", "/put-away", "/line"]) expect((await post(route, { title: "Crates", key: dir, ask: "supply crate", line: "a crate" })).status).toBe(404);

    // Only the cache folder was written: the extracted fields, vectors and settings, no tick log.
    expect(await readdir(dir)).toEqual(["cache"]);
    expect(await readdir(path.join(cache(), "extracted"))).toEqual(expect.arrayContaining(["doodad-extracted.json", "doodads.json", "extracted.json"]));
    expect((await readdir(cache())).some((name) => name.startsWith("vectors-"))).toBe(true);
    expect((await readdir(cache(), { recursive: true })).some((name) => name.includes("ticks"))).toBe(false);
  });

  it("extracts only when the cache has no extraction yet", async () => {
    const first = fakeGameData();
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, fetch: first.fetch });
    await running.close();
    const again = fakeGameData();
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, fetch: again.fetch });
    expect(first.asked.length).toBeGreaterThan(0);
    expect(again.asked).toEqual([]);
    expect(running.cards).toBe(FAKE_DOODADS.length);
  });

  it("says to run extract when its first start can't extract", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof globalThis.fetch;
    const listGitTree = async (): Promise<string[]> => {
      throw new Error("git: not found");
    };
    const starting = startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, fetch: failing, listGitTree });
    await expect(starting).rejects.toThrow(/fetch failed/);
    // In the form an npx user can run, too.
    await expect(starting).rejects.toThrow(npxHint("@team-antioch/sc2-doodad-finder extract"));
  });

  it("shows a sheet rendered while it runs on its card", async () => {
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, fetch: fakeGameData().fetch });
    const before = await nextEvent("narrowed", () => post("/ask", { text: "supply crate", mode: "enter", version: 1 }));
    const card = (cards: { id: string; html: string }[]) => cards.find(({ id }) => id === "DOM_Crate")!.html;
    expect(card(before.cards)).not.toContain("/sheet/DOM_Crate");
    await mkdir(path.join(cache(), "catalog-sheets", "doodads"), { recursive: true });
    await writeFile(path.join(cache(), "catalog-sheets", "doodads", "DOM_Crate.jpg"), "sheet");
    for (let tries = 0; ; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      const after = await nextEvent("narrowed", () => post("/ask", { text: `supply crate ${tries}`, mode: "enter" }));
      if (card(after.cards).includes("/sheet/DOM_Crate")) break;
      if (tries > 20) throw new Error("The new sheet never showed");
    }
  });

  it("logs ticks to the folder named for the tick log", async () => {
    running = await startFinder({ cacheDir: cache(), embedder: fakeEmbedder(), env: noKey(), port: 0, tickLog: path.join(dir, "ticks"), fetch: fakeGameData().fetch });
    const narrowed = await nextEvent("narrowed", () => post("/ask", { text: "supply crate", mode: "enter" }));
    const id = (narrowed.cards as { id: string }[])[0]!.id;
    await post("/tick", { ask: "supply crate", id, ticked: true });
    const line = JSON.parse(await readFile(path.join(dir, "ticks", "ticks.jsonl"), "utf8"));
    expect(line).toMatchObject({ ask: "supply crate", ticked: [id], tags: [] });
  });
});

describe("the public CLI's options", () => {
  it("takes the port, the budget, the tick log's folder and whether to open the page", () => {
    expect(parseFinderArgs(["--port", "5000", "--budget", "0.25", "--tick-log", "logs", "--open"], "/work")).toEqual({ port: 5000, budget: 0.25, tickLog: path.resolve("/work", "logs"), open: true });
    expect(parseFinderArgs([], "/work")).toEqual({ port: 4634, open: false });
  });

  it("takes the login and logout commands, which start nothing", () => {
    expect(parseFinderArgs(["login"], "/work")).toEqual({ port: 4634, open: false, login: true });
    expect(parseFinderArgs(["logout"], "/work")).toEqual({ port: 4634, open: false, logout: true });
    expect(() => parseFinderArgs(["login", "ts-key"], "/work")).toThrow(/Usage/);
  });

  it("takes the extract command, which extracts the catalog and starts nothing", () => {
    expect(parseFinderArgs(["extract"], "/work")).toEqual({ port: 4634, open: false, extract: true });
    expect(() => parseFinderArgs(["frobnicate"], "/work")).toThrow(/Usage/);
  });

  it("refuses a budget that isn't dollars, and a port that isn't one", () => {
    expect(() => parseFinderArgs(["--budget", "lots"], "/work")).toThrow(/--budget/);
    expect(() => parseFinderArgs(["--budget", "-1"], "/work")).toThrow(/--budget/);
    expect(() => parseFinderArgs(["--port", "70000"], "/work")).toThrow(/--port/);
  });
});
