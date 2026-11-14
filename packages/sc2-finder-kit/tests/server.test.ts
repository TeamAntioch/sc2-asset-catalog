// The kit's server with a toy finder: what a finder passes in (its name, page, cards' markup, tags,
// copy text and routes) is what the page gets, and nothing in the server names a doodad.
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Narrowing } from "../src/finder.ts";
import type { Grade, Ranker } from "../src/ranker.ts";
import { type FinderServer, HttpError, startFinderServer } from "../src/server.ts";
import { type ToyCard, toyKind, TOYS } from "./toy.ts";

const CARDS = new Map<string, ToyCard>(TOYS.map((card) => [card.id, card]));

const finder = {
  cards: CARDS,
  async narrow(text: string): Promise<Narrowing<ToyCard>> {
    const word = text.trim().split(/\s+/)[0]!.toLowerCase();
    const candidates = [...CARDS.values()].filter((card) => card.text.toLowerCase().includes(word)).map((card, i) => ({ id: card.id, card, score: 1 / (i + 1) }));
    return { candidates, timings: { keyword: 1, embed: 1, nearest: 1, merge: 1, total: 4 } };
  },
};

const ranker: Ranker<ToyCard> = {
  name: "jev",
  async rank(request) {
    const grades = new Map<string, Grade>(request.candidates.map((card) => [card.id, { level: card.id === "RedBall" ? 3 : 0.4 }]));
    return { ranker: "jev", model: "fake", grades, timings: { request: 1, total: 1 }, usage: { input: 10, output: 0 }, cost: 0 };
  },
};

let server: FinderServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const open = async (kind = toyKind()) => {
  server = await startFinderServer<ToyCard>({ kind, finder, ranker, port: 0, timing: { debounceMs: 5, idleMs: 5000, budgetMs: 50 } });
  return server;
};

const post = async (route: string, body: unknown) => {
  const response = await fetch(new URL(route, server!.url), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: (await response.json()) as Record<string, any> };
};

describe("the kit's server with a toy finder", () => {
  it("serves the finder's page and says which finder it is", async () => {
    const { url } = await open();
    expect(await (await fetch(url)).text()).toContain("<title>Toys</title>");
    const status = (await (await fetch(new URL("/status", url))).json()) as Record<string, any>;
    expect(status).toMatchObject({ finder: "toy-finder", rankers: { on: ["jev"] } });
  });

  it("shows each card as the finder renders it, with the ranker's level named by the finder", async () => {
    await open();
    const response = await fetch(new URL("/events", server!.url));
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    await post("/ask", { text: "round", mode: "enter" });
    let seen = "";
    while (!seen.includes("event: ranked")) seen += (await reader.read()).value ?? "";
    await reader.cancel();
    const ranked = JSON.parse(/event: ranked\ndata: (.*)\n/.exec(seen)![1]!) as { cards: { id: string; html: string; levelName: string }[] };
    expect(ranked.cards[0]).toMatchObject({ id: "RedBall", html: "<b>Red Ball</b>", levelName: "exactly" });
  });

  it("ticks cards into a tray with the finder's copy text and tags", async () => {
    await open();
    await post("/ask", { text: "red", mode: "enter" });
    await post("/tick", { ask: "red", id: "RedBall", ticked: true });
    const { body } = await post("/tick", { ask: "red", id: "RedCube", ticked: true });
    expect(body.tray.copy).toBe("RedBall + RedCube");
    expect(body.tray.items.map((item: { copy: string }) => item.copy)).toEqual(["RedBall", "RedCube [Extra Pack]"]);
    expect(body.tags).toEqual([{ facet: "colour", value: "red", pinned: false, count: 2 }]);
  });

  it("refuses a tick for a card that isn't there, naming what the finder calls a card", async () => {
    await open();
    const { status, body } = await post("/tick", { ask: "red", id: "Nope", ticked: true });
    expect(status).toBe(400);
    expect(body.error).toBe("No toy Nope");
  });

  it("answers the finder's own routes, and lets one fail with a status", async () => {
    const closed = vi.fn();
    await open(
      toyKind({
        async route(url, _request, response) {
          if (url.pathname === "/toy-picture") {
            response.writeHead(200, { "content-type": "text/plain" });
            response.end("picture");
            return true;
          }
          if (url.pathname === "/toy-missing") throw new HttpError(404, "No picture");
          return false;
        },
        close: closed,
      }),
    );
    expect(await (await fetch(new URL("/toy-picture", server!.url))).text()).toBe("picture");
    const missing = await fetch(new URL("/toy-missing", server!.url));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: "No picture" });
    expect((await fetch(new URL("/elsewhere", server!.url))).status).toBe(404);
    await server!.close();
    expect(closed).toHaveBeenCalledOnce();
    server = undefined;
  });

  it("refuses a request from another page", async () => {
    await open();
    const response = await fetch(new URL("/ask", server!.url), { method: "POST", headers: { "content-type": "application/json", origin: "http://evil.example" }, body: "{}" });
    expect(response.status).toBe(403);
  });
});
