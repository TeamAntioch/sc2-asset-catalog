// The Finder's process over HTTP (src/server.ts): asks answered as events, ticks collecting in the
// tray with its copy text, the badges' choice, a tray action, the tick log, and requests from
// anywhere but its own page refused. A fake narrowing and ranker; real timers, shortened.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { candidateCards } from "../src/cards.ts";
import type { Narrowing } from "../src/finder.ts";
import type { Grade, Ranker } from "../src/ranker.ts";
import { type FinderServer, type FinderServerOptions, startFinderServer, type TrayActionContext, type TrayObjects } from "../src/server.ts";
import { spendCap } from "../src/spend-cap.ts";
import { sources, VOID_CAMPAIGN } from "./fixtures.ts";

const SOURCES = sources();
const CARDS = new Map(candidateCards(SOURCES).map((card) => [card.id, card]));

const finder = {
  cards: CARDS,
  sources: SOURCES,
  async narrow(text: string, options: { dependencies?: readonly string[] | undefined } = {}): Promise<Narrowing> {
    const word = text.trim().split(/\s+/)[0]!.toLowerCase();
    const provided = (id: string) => options.dependencies !== undefined && (CARDS.get(id)!.dependency === undefined || options.dependencies.includes(CARDS.get(id)!.dependency!));
    const candidates = [...CARDS.values()].filter((card) => card.text.toLowerCase().includes(word)).map((card, i) => ({ id: card.id, card: { ...card, provided: provided(card.id) }, score: 1 / (i + 1) }));
    return { candidates, timings: { keyword: 1, embed: 1, nearest: 1, merge: 1, total: 4 } };
  },
};

/** Grades the Stamper Head 2.6 and everything else 0.4. */
const ranker: Ranker = {
  name: "jev",
  async rank(request) {
    const grades = new Map<string, Grade>(request.candidates.map((card) => [card.id, { level: card.id === "FoundryStamperHead" ? 2.6 : 0.4 }]));
    return { ranker: "jev", model: "fake", grades, timings: { request: 5, total: 5 }, usage: { input: 100, output: 0 }, cost: 0.0013 };
  },
};

let dir: string;
let server: FinderServer | undefined;
let events: AbortController | undefined;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "doodad-finder-server-"));
});
afterEach(async () => {
  events?.abort();
  await server?.close();
  server = undefined;
  await rm(dir, { recursive: true, force: true });
});

const open = async (more: Partial<FinderServerOptions> = {}) => {
  server = await startFinderServer({ finder, ranker, timing: { debounceMs: 10, idleMs: 5000, budgetMs: 50 }, ...more });
  return server;
};

const MAPS = { label: "Map", choices: ["ashen-crossing"], provided: "in this map", dependenciesOf: async () => [VOID_CAMPAIGN] };

const post = async (route: string, body: unknown) => {
  const response = await fetch(new URL(route, server!.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

/** The process's events as they come, by name. */
async function listen(): Promise<{ next(name: string): Promise<any> }> {
  events = new AbortController();
  const response = await fetch(new URL("/events", server!.url), { signal: events.signal });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const queue: { event: string; data: any }[] = [];
  let buffer = "";
  return {
    async next(name) {
      for (;;) {
        const index = queue.findIndex(({ event }) => event === name);
        if (index >= 0) return queue.splice(0, index + 1).at(-1)!.data;
        const { value, done } = await reader.read();
        if (done) throw new Error("The events ended");
        buffer += value;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
          queue.push({ event, data: JSON.parse(/^data: (.*)$/m.exec(block)![1]!) });
        }
      }
    },
  };
}

/** A raw request, so its Host and Origin can be anything. */
const raw = (method: string, route: string, headers: Record<string, string>, body?: string) =>
  new Promise<number>((resolve, reject) => {
    const url = new URL(route, server!.url);
    const sent = httpRequest({ host: "127.0.0.1", port: url.port, path: url.pathname, method, headers }, (response) => {
      response.resume();
      resolve(response.statusCode!);
    });
    sent.on("error", reject);
    sent.end(body);
  });

describe("startFinderServer", () => {
  it("listens on 127.0.0.1 and serves the page", async () => {
    const { url } = await open();
    expect(new URL(url).hostname).toBe("127.0.0.1");
    const page = await (await fetch(url)).text();
    expect(page).toContain("<title>Doodad Finder</title>");
  });

  it("says a failed ranking in its log as well as on the page, once while it fails the same way", async () => {
    const lines: string[] = [];
    await open({ ranker: { name: "jev", rank: async () => Promise.reject(new Error("401 Unauthorized")) }, log: (line) => lines.push(line) });
    const listening = await listen();
    await listening.next("state");
    await post("/ask", { text: "steel", mode: "enter" });
    expect(await listening.next("failed")).toMatchObject({ text: "steel", error: "401 Unauthorized", narrowed: true });
    await post("/ask", { text: "steel press", mode: "enter" });
    await listening.next("failed");
    expect(lines).toEqual(["The ranker failed: 401 Unauthorized. The narrowing's order is shown."]);
  });

  it("says a different failure, or one back after a ranking worked, at once", async () => {
    const lines: string[] = [];
    const answers = [new Error("status 401."), new Error("status 503"), undefined, new Error("status 503")];
    const flaky: Ranker = { name: "jev", rank: async (request) => { const failure = answers.shift(); if (failure) throw failure; return ranker.rank(request); } };
    await open({ ranker: flaky, log: (line) => lines.push(line) });
    const listening = await listen();
    await listening.next("state");
    for (const [i, kind] of (["failed", "failed", "ranked", "failed"] as const).entries()) {
      await post("/ask", { text: `steel ${i}`, mode: "enter" });
      await listening.next(kind);
    }
    expect(lines).toEqual([
      "The ranker failed: status 401. The narrowing's order is shown.",
      "The ranker failed: status 503. The narrowing's order is shown.",
      "The ranker failed: status 503. The narrowing's order is shown.",
    ]);
  });

  it("says a failed narrowing as the search failing, not the ranker", async () => {
    const lines: string[] = [];
    const failing = { ...finder, narrow: async () => Promise.reject(new Error("the embeddings model failed")) };
    await open({ finder: failing, log: (line) => lines.push(line) });
    const listening = await listen();
    await listening.next("state");
    await post("/ask", { text: "steel", mode: "enter" });
    // The page shows the same words the log says.
    expect(await listening.next("failed")).toMatchObject({ error: "the embeddings model failed", narrowed: false, message: "The search failed: the embeddings model failed." });
    expect(lines).toEqual(["The search failed: the embeddings model failed."]);
  });

  it("says at /status that it is the Doodad Finder, with its pid, its ranker and what its caller adds", async () => {
    await open({ ranker: undefined, off: "no TypeSafe key", status: { project: dir } });
    const status = (await (await fetch(new URL("/status", server!.url))).json()) as Record<string, unknown>;
    expect(status).toEqual({ finder: "doodad-finder", project: dir, pid: process.pid, url: server!.url, rankers: { on: [], off: [{ ranker: "jev", reason: "no TypeSafe key" }] } });
  });

  it("answers an ask on Enter with the ranked cards as an event, with their levels and what each needs", async () => {
    await open();
    const listening = await listen();
    await listening.next("state");
    expect((await post("/ask", { text: "steel", mode: "enter" })).status).toBe(200);
    const ranked = await listening.next("ranked");
    expect(ranked).toMatchObject({ text: "steel", ranker: "jev", cost: 0.0013 });
    expect(ranked.cards[0]).toMatchObject({ id: "FoundryStamperHead", level: 2.6, levelName: "reads as exactly this" });
    expect(ranked.cards[0].html).toContain("needs Void (Campaign)");
    expect(ranked.cards[0].html).toContain("heavy steel press head on a piston");
  });

  it("collects ticked cards in the tray with their level and copy text, and their tags", async () => {
    await open();
    const listening = await listen();
    await post("/ask", { text: "steel", mode: "enter" });
    await listening.next("ranked");
    await post("/tick", { ask: "steel", id: "FoundryStamperHead", ticked: true });
    const ticked = await post("/tick", { ask: "supply", id: "SupplyCrate", ticked: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body.tray.items).toEqual([
      { id: "FoundryStamperHead", name: "Foundry Stamper Head", ask: "steel", level: 2.6, levelName: "reads as exactly this", copy: "FoundryStamperHead (needs Void (Campaign))" },
      { id: "SupplyCrate", name: "Supply Crate", ask: "supply", copy: "SupplyCrate (needs Void Story (Campaign))" },
    ]);
    expect(ticked.body.tray.copy).toBe("FoundryStamperHead\nSupplyCrate\n\nDependencies: Void (Campaign), Void Story (Campaign)");
    expect(ticked.body.tags.map(({ facet, value }: { facet: string; value: string }) => `${facet}: ${value}`)).toContain("story: industry");

    const unticked = await post("/tick", { ask: "steel", id: "FoundryStamperHead", ticked: false });
    expect(unticked.body.tray.items.map(({ id }: { id: string }) => id)).toEqual(["SupplyCrate"]);
    expect((await post("/clear", {})).body.tray).toEqual({ items: [], copy: "" });
  });

  it("ticks with no ranker, and writes no tick log unless it has one", async () => {
    await open({ ranker: undefined, off: "no TypeSafe key" });
    const ticked = await post("/tick", { ask: "crate", id: "SupplyCrate", ticked: true });
    expect(ticked.status).toBe(200);
    expect(ticked.body).toMatchObject({ ranker: null, off: "no TypeSafe key", tickLog: false });
  });

  /** An object store that records what it was asked, holding one unfinished object for `choice`. */
  const store = (choice: string | undefined) => {
    const asked: string[] = [];
    const objects: TrayObjects = {
      label: "Object",
      async start(title, chosen) {
        asked.push(`start ${title}`);
        return { key: title, title, choice: chosen, ticks: [], lines: {} };
      },
      async unfinished() {
        return [{ key: "old", title: "Old", choice, ticked: 0 }];
      },
      async reopen(key) {
        asked.push(`reopen ${key}`);
        return { key, title: "Old", choice, ticks: [], lines: {} };
      },
      async save() {},
    };
    return { objects, asked };
  };

  it("starts no object when the tray's cards can't be levelled", async () => {
    const { objects, asked } = store(undefined);
    await open({ ranker: undefined, off: "no TypeSafe key", objects });
    await post("/tick", { ask: "crate", id: "SupplyCrate", ticked: true });
    expect((await post("/object", { title: "Crusher" })).status).toBe(409);
    expect(asked).toEqual([]);
  });

  it("refuses to reopen an object whose choice is no longer one, before reopening it, and keeps the page's choice", async () => {
    const { objects, asked } = store("gone-map");
    await open({ badges: MAPS, objects });
    await post("/choose", { choice: "ashen-crossing" });
    const reopened = await post("/reopen", { key: "old" });
    expect(reopened.status).toBe(409);
    expect(reopened.body.error).toMatch(/gone-map/);
    expect(asked).toEqual([]);
    expect((await post("/choose", { choice: "ashen-crossing" })).body.badges.chosen).toBe("ashen-crossing");
  });

  it("logs each tick to the tick log for the choice, with the ask's ticked ids", async () => {
    const logs: (string | undefined)[] = [];
    await open({ badges: MAPS, tickLog: (choice) => (logs.push(choice), path.join(dir, choice ?? "none", "ticks.jsonl")) });
    await post("/tick", { ask: "crate", id: "SupplyCrate", ticked: true });
    await post("/choose", { choice: "ashen-crossing" });
    await post("/tick", { ask: "sandbag", id: "Sandbags", ticked: true });
    expect(logs).toEqual([undefined, "ashen-crossing"]);
    expect(JSON.parse(await readFile(path.join(dir, "none", "ticks.jsonl"), "utf8"))).toMatchObject({ ask: "crate", ticked: ["SupplyCrate"], tags: [] });
    expect(JSON.parse(await readFile(path.join(dir, "ashen-crossing", "ticks.jsonl"), "utf8"))).toMatchObject({ ask: "sandbag", ticked: ["Sandbags"] });
  });

  it("badges the cards the chosen one provides, and remembers the choice", async () => {
    const saved: unknown[] = [];
    await open({ badges: MAPS, saveSettings: async (settings) => void saved.push(settings) });
    const chosen = await post("/choose", { choice: "ashen-crossing" });
    expect(chosen.body.badges).toEqual({ label: "Map", choices: ["ashen-crossing"], chosen: "ashen-crossing" });
    expect(saved).toEqual([{ lastChoice: "ashen-crossing" }]);
    expect((await post("/choose", { choice: "elsewhere" })).status).toBe(400);
    const listening = await listen();
    await post("/ask", { text: "steel", mode: "enter" });
    const ranked = await listening.next("ranked");
    expect(ranked.cards.find(({ id }: { id: string }) => id === "FoundryStamperHead").html).toContain("in this map");
  });

  it("runs a tray action on the tray's cards, with the choice, its inputs and their levels, then empties the tray", async () => {
    const seen: TrayActionContext[] = [];
    const levels: unknown[] = [];
    await open({
      badges: MAPS,
      trayActions: [
        {
          label: "Hand over",
          inputs: [{ name: "title", label: "Object", required: true }],
          async run(context) {
            seen.push(context);
            levels.push([...(await context.levels("supply", []))]);
            return { message: "Handed over", text: "the prompt", copied: false, clearTray: true };
          },
        },
      ],
    });
    expect((await post("/action", { index: 0, inputs: { title: "Crates" } })).status).toBe(409);
    await post("/choose", { choice: "ashen-crossing" });
    await post("/tick", { ask: "supply", id: "SupplyCrate", ticked: true });
    expect((await post("/action", { index: 0, inputs: {} })).status).toBe(400);
    const done = await post("/action", { index: 0, inputs: { title: " Crates " } });
    expect(done.status).toBe(200);
    expect(done.body.done).toEqual({ message: "Handed over", text: "the prompt", copied: false, clearTray: true });
    expect(done.body.tray.items).toEqual([]);
    expect(seen[0]).toMatchObject({ choice: "ashen-crossing", inputs: { title: "Crates" }, items: [{ id: "SupplyCrate", ask: "supply" }] });
    // The ask wasn't ranked when the card was ticked: its levels are ranked for the action.
    expect(levels[0]).toEqual([["SupplyCrate", 0.4]]);
    expect(done.body.actions).toEqual([{ label: "Hand over", title: "", inputs: [{ name: "title", label: "Object", required: true }] }]);
  });

  it("says past the spend cap that it isn't ranking, and why", async () => {
    await open({ budget: spendCap(0) });
    const listening = await listen();
    expect((await listening.next("state")).capped).toContain("$0.00");
    await post("/ask", { text: "steel", mode: "enter" });
    expect((await listening.next("capped")).reason).toContain("--budget");
  });

  it("says so as soon as the call that reaches the spend cap answers", async () => {
    await open({ budget: spendCap(0.001) });
    const listening = await listen();
    expect((await listening.next("state")).capped).toBeNull();
    await post("/ask", { text: "steel", mode: "enter" });
    // Sent with the ranking's answer, before its cards.
    expect((await listening.next("state")).capped).toContain("$0.00");
    expect((await listening.next("ranked")).spend).toBeCloseTo(0.0013);
  });

  it("says at /status that it is the Doodad Finder, whatever its caller adds", async () => {
    await open({ status: { finder: "something else", project: null } });
    const status = (await (await fetch(new URL("/status", server!.url))).json()) as Record<string, unknown>;
    expect(status).toMatchObject({ finder: "doodad-finder", project: null });
  });

  it("refuses requests that don't name it as their host, and posts from another site", async () => {
    const { url } = await open();
    const port = new URL(url).port;
    expect(await raw("GET", "/", { host: "evil.example" })).toBe(403);
    expect(await raw("GET", "/", { host: `localhost:${port}` })).toBe(200);
    const json = { host: `127.0.0.1:${port}`, "content-type": "application/json" };
    expect(await raw("POST", "/ask", { ...json, origin: "https://evil.example" }, JSON.stringify({ text: "press", mode: "enter" }))).toBe(403);
    expect(await raw("POST", "/ask", { ...json, origin: `http://127.0.0.1:${port}` }, JSON.stringify({ text: "press", mode: "enter" }))).toBe(200);
    // A form post can't send JSON's content type.
    expect(await raw("POST", "/ask", { host: `127.0.0.1:${port}`, "content-type": "text/plain" }, JSON.stringify({ text: "press", mode: "enter" }))).toBe(415);
  });

  it("serves only the catalogs' own sheets, by id", async () => {
    await open();
    expect((await fetch(new URL("/sheet/FoundryStamperHead", server!.url))).status).toBe(404);
    expect((await fetch(new URL("/sheet/..%2F..%2Fetc%2Fpasswd", server!.url))).status).toBe(404);
    expect((await fetch(new URL("/sheet/%E0", server!.url))).status).toBe(404);
  });

  it("moves the state version only when what an ask runs with changes, so an ask's ranking is kept", async () => {
    await open({ badges: MAPS });
    const first = (await post("/tick", { ask: "steel", id: "FoundryStamperHead", ticked: true })).body;
    expect((await post("/settings", { idleMs: 1000 })).body).toMatchObject({ version: first.version, idleMs: 1000 });
    expect((await post("/tag", { facet: "story", value: "industry", action: "pin" })).body.version).toBe(first.version + 1);
    expect((await post("/choose", { choice: "ashen-crossing" })).body.version).toBe(first.version + 2);
  });

  it("serves a page whose script parses", async () => {
    const { url } = await open();
    const page = await (await fetch(url)).text();
    const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, script]) => script!);
    expect(scripts).toHaveLength(2);
    for (const script of scripts) expect(() => new Function(script)).not.toThrow();
  });
});
