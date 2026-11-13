// The Doodad Finder's process (docs/adr/0001): an HTTP server on 127.0.0.1 only that serves
// the page and answers it. It holds the cards, the embeddings, the model and the ranker's
// credential; the page gets cards and levels, never a credential. Node's own http, no framework.
//
//   GET  /             the page
//   GET  /status       { finder: "doodad-finder", pid, url, rankers: { on, off }, ...status }: how a
//                      caller tells a Finder from anything else on a port
//   GET  /events       server-sent events: `state` on every change, and each ask's `narrowed`,
//                      `ranked`, `failed` and `capped`
//   GET  /sheet/<id>   a doodad's sheet, from the catalogs' own path for that id
//   POST /ask          { text, mode: type | enter | refresh, idleMs? }: see asker.ts
//   POST /tick         { ask, id, ticked }: ticks a card into the tray, or unticks it
//   POST /clear        empties the tray
//   POST /choose       { choice }: the badges' choice (a map, say), or null
//   POST /tag          { facet, value, action: pin | unpin | drop }
//   POST /settings     { idleMs }
//   POST /action       { index, inputs }: runs a tray action on the tray
//
// With objects (for sc2-adjutant, may change), the tray can be kept for one, named or reopened:
//
//   POST /object       { title }: starts an object for the badges' choice, keeping the tray's cards
//   POST /reopen       { key }: reopens an unfinished one, its ticks in the tray
//   POST /put-away     puts the open object away; the tray is empty again
//   POST /line         { ask, line }: edits the line of the open object's part an ask made
//
// The tray's copy text comes with each state, so the page copies it on the click itself.
//
// Requests must name this server as their Host, and a POST from a page must come from this
// server's own: another site open in the browser can't spend on the ranker or write files.

import { createReadStream } from "node:fs";
import { appendFile, mkdir, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { type DoodadPicture, doodadPictures, type DoodadSearchSources } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";

import { type AskEvent, type AskMode, type AskRequest, type AskTiming, ASK_TIMING, createAsker } from "./asker.ts";
import type { CandidateCard } from "./cards.ts";
import { cardHtml, levelName } from "./card-html.ts";
import type { KeySource } from "./credentials.ts";
import type { NarrowOptions, Narrowing } from "./finder.ts";
import type { Narrowed, Tag } from "./narrow.ts";
import { finderPage } from "./page.ts";
import type { Ranker, RankerName } from "./ranker.ts";
import type { FinderSettings } from "./settings.ts";
import type { SpendCap } from "./spend-cap.ts";
import { type ObjectTag, objectTags, type TagChoice, type TagChoices } from "./tags.ts";
import { itemCopyText, ticked, type TrayItem, trayCopyText } from "./tray.ts";

/** The port the page is at unless another is asked for. */
export const FINDER_PORT = 4634;

/**
 * Badges for a choice the page offers, such as a project's maps: with one chosen, the cards
 * its dependencies provide say so, and come first. With no choice, a card says the package it needs.
 */
export type Badges = {
  /** What the choice is called on the page, such as "Map". */
  readonly label: string;
  readonly choices: readonly string[];
  /** The badge of a card the chosen one provides, such as "in this map". */
  readonly provided: string;
  dependenciesOf(choice: string): Promise<readonly string[]>;
};

/** A field a tray action asks for before it runs. */
export type TrayActionInput = { readonly name: string; readonly label: string; readonly placeholder?: string; readonly required?: boolean };

export type TrayActionContext = {
  readonly items: readonly TrayItem[];
  /** The badges' choice, if any. */
  readonly choice: string | undefined;
  readonly inputs: Readonly<Record<string, string>>;
  /** The open object, as last saved, when there is one. */
  readonly object?: TrayObject | undefined;
  /** The ranker's levels for an ask's cards, ranked now if it wasn't: rejects with no ranker, or past the spend cap. */
  levels(ask: string, tags: readonly Tag[]): Promise<ReadonlyMap<string, number>>;
};

export type TrayActionResult = {
  /** Shown on the page. */
  readonly message: string;
  /** Text for the mapper to take away, shown selected when `copied` isn't true. */
  readonly text?: string;
  readonly copied?: boolean;
  /** Empties the tray afterwards: what it held is handed over. */
  readonly clearTray?: boolean;
  /** Puts the open object away afterwards, emptying the tray. */
  readonly putAway?: boolean;
};

/**
 * For sc2-adjutant, may change: an object the tray is kept for, such as one of sc2-adjutant's searches. Its
 * title is context for the ranker, and its ticks and lines are saved on every change, so a tick
 * from it carries the ranker's level.
 */
export type TrayObject = {
  /** What it is reopened by. */
  readonly key: string;
  readonly title: string;
  /** The badges' choice it is for (its map): the page's choice while it is open. */
  readonly choice?: string | undefined;
  readonly ticks: readonly ObjectTick[];
  /** Each ask's line, where the mapper edited it from the ask as typed. */
  readonly lines: Readonly<Record<string, string>>;
  /** The tags to pin when it is opened: for a reopened one, those its asks ran pinned with. */
  readonly pinned?: readonly TagChoice[];
};

/** A tick kept with an object: the ask it came from, that ask's tags, and the ranker's level for it there. */
export type ObjectTick = { readonly id: string; readonly ask: string; readonly tags: readonly Tag[]; readonly level: number };

/** An object that can be reopened, as the page lists it. */
export type UnfinishedObject = { readonly key: string; readonly title: string; readonly choice?: string | undefined; readonly ticked: number };

/** For sc2-adjutant, may change: where the tray's objects come from and are kept. */
export type TrayObjects = {
  /** What one is called on the page: "Object". */
  readonly label: string;
  readonly placeholder?: string;
  /** A new one, for the badges' choice; rejects a title it can't take. */
  start(title: string, choice: string | undefined): Promise<TrayObject>;
  /** The ones that can be reopened. */
  unfinished(): Promise<readonly UnfinishedObject[]>;
  reopen(key: string): Promise<TrayObject>;
  /** Keeps its ticks and lines as they are now: on every tick, untick, clear and line edit. */
  save(object: TrayObject): Promise<void>;
};

/** A button on the tray that hands its cards to something else, such as one of sc2-adjutant's. */
export type TrayAction = {
  readonly label: string;
  readonly title?: string;
  readonly inputs?: readonly TrayActionInput[];
  run(context: TrayActionContext): Promise<TrayActionResult>;
};


export type FinderServerOptions = {
  readonly finder: { narrow(ask: string, options?: NarrowOptions): Promise<Narrowing>; readonly cards: ReadonlyMap<string, CandidateCard>; readonly sources: DoodadSearchSources };
  readonly ranker?: Ranker | undefined;
  /** Why there is no ranker: shown on the page. */
  readonly off?: string | undefined;
  /** Where the ranker's key came from, for /status to say: never the key. */
  readonly keySource?: KeySource | undefined;
  /** The session's spend cap. */
  readonly budget?: SpendCap;
  readonly badges?: Badges | undefined;
  readonly trayActions?: readonly TrayAction[];
  /** For sc2-adjutant, may change: objects the tray can be kept for. None by default. */
  readonly objects?: TrayObjects | undefined;
  /** The tick log's file for a choice; no tick log when left out. */
  readonly tickLog?: ((choice: string | undefined) => string) | undefined;
  readonly settings?: FinderSettings;
  /** Where the settings are kept; not written when left out. */
  readonly saveSettings?: (settings: FinderSettings) => Promise<void>;
  readonly timing?: Partial<AskTiming>;
  readonly port?: number;
  /** More for /status to say. */
  readonly status?: Readonly<Record<string, unknown>>;
  /** Lines worth showing the user as the Finder runs, such as a failed ranking. */
  readonly log?: (line: string) => void;
};

export type FinderServer = {
  readonly url: string;
  /** US dollars the ranker's calls have cost since the process started, estimated. */
  readonly spend: number;
  close(): Promise<void>;
};

/** How often a failure that lasts is said again in the log. */
const FAILURE_REPEAT_MS = 60_000;

/** A failed ask in words, the same on the page and in the log. */
export const failureText = (event: { readonly error: string; readonly narrowed: boolean }): string =>
  event.narrowed ? `The ranker failed: ${event.error}. The narrowing's order is shown.` : `The search failed: ${event.error}.`;

/** A card as an event gives it to the page. */
type CardOut = { readonly id: string; readonly html: string; readonly level?: number; readonly levelName?: string };

/** A tick log's line: the ask, its tags and the ids in the tray ticked from it, in the order ticked. */
export type TickLogLine = { readonly ask: string; readonly tags: readonly Tag[]; readonly ticked: readonly string[]; readonly object?: string; readonly ranker?: RankerName; readonly at: string };

/** How many asks' grades are kept for ticking from them. */
const KEPT_GRADES = 50;

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const readBody = async (request: IncomingMessage): Promise<Record<string, unknown>> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, "Too large");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // Answered below.
  }
  throw new HttpError(400, "The body must be a JSON object");
};

const text = (body: Record<string, unknown>, field: string, required = true): string | undefined => {
  const value = body[field];
  if (typeof value === "string") return value;
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `${field} is missing`);
    return undefined;
  }
  throw new HttpError(400, `${field} must be text`);
};

const SHEET_TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

export async function startFinderServer(options: FinderServerOptions): Promise<FinderServer> {
  const { finder, ranker, badges, budget, objects } = options;
  const actions = options.trayActions ?? [];
  const timing = { ...ASK_TIMING, ...options.timing };
  let settings: FinderSettings = { ...options.settings };
  let version = 1;
  let tray: TrayItem[] = [];
  let choices: Required<TagChoices> = { pinned: [], dropped: [] };
  let choice: string | undefined;
  let dependencies: readonly string[] | undefined;
  // The object the tray is kept for, as last saved; its lines by ask; what can be reopened.
  let object: TrayObject | undefined;
  let lines: Record<string, string> = {};
  let unfinished: readonly UnfinishedObject[] = [];
  // What the ranker cost this session: the spend cap's count, which also has calls answered but not read; this one's with no cap.
  let uncapped = 0;
  const spent = (): number => (budget ? budget.spent : uncapped);
  const clients = new Set<ServerResponse>();
  // Each ask's grades as the page was shown them, by its text: what a tick from it records.
  const grades = new Map<string, { readonly tags: readonly Tag[]; readonly levels: ReadonlyMap<string, number> }>();
  // Pictures by id, for the sources they were looked up in.
  let pictures = new WeakMap<DoodadSearchSources, Map<string, DoodadPicture>>();

  const send = (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) client.write(message);
  };

  const tags = (): ObjectTag[] => objectTags(tray.map(({ id }) => finder.cards.get(id)).filter((card): card is CandidateCard => card !== undefined), choices);

  const picturesOf = (ids: readonly string[]): Map<string, DoodadPicture> => {
    const { sources } = finder;
    let known = pictures.get(sources);
    if (!known) pictures.set(sources, (known = new Map()));
    const missing = ids.filter((id) => !known!.has(id));
    if (missing.length) for (const [id, picture] of doodadPictures(missing, sources)) known.set(id, picture);
    return known;
  };

  const cardsOut = (candidates: readonly (Narrowed & { readonly level?: number })[]): CardOut[] => {
    const found = picturesOf(candidates.map(({ id }) => id));
    const provided = dependencies !== undefined ? badges?.provided : undefined;
    return candidates.map(({ id, card, level }) => ({
      id,
      html: cardHtml(card, found.get(id) ?? { kind: "none" }, provided),
      ...(level !== undefined ? { level: Math.round(level * 100) / 100, levelName: levelName(level) } : {}),
    }));
  };

  /** The last failure the log said, and when, so a lasting one isn't said on every ask. */
  let lastFailure: { readonly same: string; readonly at: number } | undefined;
  const emit = (event: AskEvent) => {
    if (event.type === "failed") {
      const line = failureText(event);
      // A failure that lasts (a revoked key, an outage) comes again on every Enter and idle pause:
      // said once a minute while it fails the same way, numbers aside (a timeout's milliseconds).
      const same = line.replace(/\d+/g, "#");
      const now = Date.now();
      if (same !== lastFailure?.same || now - lastFailure.at >= FAILURE_REPEAT_MS) {
        options.log?.(line);
        lastFailure = { same, at: now };
      }
      return send("failed", { ...event, message: line });
    }
    if (event.type === "capped") return send("capped", event);
    if (event.type === "ranked") {
      grades.delete(event.text.trim());
      grades.set(event.text.trim(), { tags: event.tags, levels: new Map(event.candidates.map(({ id, level }) => [id, level])) });
      if (grades.size > KEPT_GRADES) grades.delete(grades.keys().next().value!);
      return send("ranked", { text: event.text, ranker: event.ranker, ms: Math.round(event.ms), cost: event.cost, spend: spent(), cards: cardsOut(event.candidates) });
    }
    send("narrowed", { text: event.text, ms: Math.round(event.ms * 10) / 10, cards: cardsOut(event.candidates) });
  };

  const onRanking = (cost: number) => {
    if (!budget) uncapped += cost;
    // The call that reached the cap: the page's ranker line says so now, not on the next change.
    if (budget && !budget.allows()) changed();
  };
  const asker = createAsker({ narrow: (ask, narrowOptions) => finder.narrow(ask, narrowOptions), ranker, ...(budget ? { budget } : {}), emit, timing, onRanking: (ranking) => onRanking(ranking.cost) });

  const askTags = (): Tag[] => tags().map(({ facet, value, pinned }) => ({ facet, value, ...(pinned ? { pinned } : {}) }));

  const requestFor = (askText: string, mode: AskMode, idleMs?: number): AskRequest => ({
    text: askText,
    mode,
    version,
    tags: askTags(),
    object: object?.title,
    dependencies,
    ...(idleMs !== undefined ? { idleMs } : {}),
  });

  const state = () => ({
    version,
    tags: tags(),
    tray: {
      items: tray.map((item) => ({
        id: item.id,
        name: item.name,
        ask: item.ask,
        ...(item.level !== undefined ? { level: Math.round(item.level * 100) / 100, levelName: levelName(item.level) } : {}),
        copy: itemCopyText(item),
      })),
      copy: trayCopyText(tray),
      // With an object open, each ask its cards came from, and the line its part reads as.
      ...(object ? { asks: [...new Set(tray.map(({ ask }) => ask))].map((ask) => ({ ask, line: lines[ask] ?? ask })) } : {}),
    },
    objects: objects
      ? { label: objects.label, placeholder: objects.placeholder ?? "", open: object ? { title: object.title, choice: object.choice ?? null } : null, unfinished: object ? [] : unfinished }
      : null,
    actions: actions.map(({ label, title, inputs }) => ({ label, title: title ?? "", inputs: inputs ?? [] })),
    badges: badges ? { label: badges.label, choices: badges.choices, chosen: choice ?? null } : null,
    ranker: ranker ? ranker.name : null,
    off: options.off ?? null,
    idleMs: settings.idleMs ?? timing.idleMs,
    spend: spent(),
    budget: budget ? budget.limit : null,
    capped: budget && !budget.allows() ? budget.reason : null,
    tickLog: options.tickLog !== undefined,
  });

  // An ask is its text and the state version: the version moves only when what an ask runs with does.
  const contextOf = () => JSON.stringify([askTags(), object?.title, dependencies]);
  let context = contextOf();
  const changed = () => {
    const now = contextOf();
    if (now !== context) {
      context = now;
      version++;
    }
    const next = state();
    send("state", next);
    return next;
  };

  const saveSettings = async (next: FinderSettings) => {
    settings = { ...settings, ...next };
    await options.saveSettings?.(settings);
  };

  const choose = async (next: string | undefined) => {
    if (next !== undefined && !badges?.choices.includes(next)) throw new HttpError(400, `${next} isn't one of the choices`);
    dependencies = next !== undefined ? await badges!.dependenciesOf(next) : undefined;
    choice = next;
  };
  // The last choice, while it is still one.
  if (badges && settings.lastChoice !== undefined && badges.choices.includes(settings.lastChoice)) await choose(settings.lastChoice);

  const logTicks = async (ask: string) => {
    if (!options.tickLog) return;
    const from = tray.filter((item) => item.ask === ask);
    const line: TickLogLine = {
      ask,
      tags: grades.get(ask)?.tags ?? from[0]?.tags ?? [],
      ticked: from.map(({ id }) => id),
      ...(object ? { object: object.title } : {}),
      ...(grades.has(ask) && ranker ? { ranker: ranker.name } : {}),
      at: new Date().toISOString(),
    };
    const file = options.tickLog(choice);
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(line)}\n`);
  };

  const pick = (list: readonly TagChoice[], picked: TagChoice, keep: boolean): TagChoice[] => {
    const rest = list.filter((known) => known.facet.toLowerCase() !== picked.facet.toLowerCase() || known.value.toLowerCase() !== picked.value.toLowerCase());
    return keep ? [...rest, picked] : rest;
  };

  const levels = async (ask: string, askedTags: readonly Tag[]): Promise<ReadonlyMap<string, number>> => {
    const known = grades.get(ask.trim());
    if (known) return known.levels;
    const ranked = await asker.ranked({ ...requestFor(ask, "enter"), tags: askedTags });
    return new Map(ranked.candidates.map(({ id, level }) => [id, level]));
  };

  /** The tray's cards with the ranker's level each, ranked now for an ask that wasn't: what an object keeps. */
  const levelled = async (items: readonly TrayItem[]): Promise<TrayItem[]> => {
    const known = new Map<string, ReadonlyMap<string, number>>();
    const out: TrayItem[] = [];
    for (const item of items) {
      if (item.level !== undefined) {
        out.push(item);
        continue;
      }
      if (!known.has(item.ask)) {
        if (!ranker) throw new HttpError(409, `An object keeps the ranker's level for each card, and no ranker is on: ${options.off ?? "no ranker"}`);
        known.set(item.ask, await levels(item.ask, item.tags).catch((error: Error) => Promise.reject(new HttpError(409, `An object keeps the ranker's level for each card, and "${item.ask}" has none: ${error.message}`))));
      }
      const level = known.get(item.ask)!.get(item.id);
      if (level === undefined) throw new HttpError(409, `${item.id} isn't among what "${item.ask}" finds now, so it has no level: untick it, or ask again and tick it`);
      out.push({ ...item, level });
    }
    return out;
  };

  const trayItem = ({ id, ask, tags: tickTags, level }: { id: string; ask: string; tags: readonly Tag[]; level?: number | undefined }): TrayItem => {
    const card = finder.cards.get(id);
    return { id, name: card?.name ?? id, ask, tags: tickTags, ...(level !== undefined ? { level } : {}), ...(card?.dependency !== undefined ? { dependency: card.dependency } : {}) };
  };

  // With an object open, every tray item has its level (levelled() gives it before a card goes in).
  const tickOf = ({ id, ask, tags: tickTags, level }: TrayItem): ObjectTick => ({ id, ask, tags: tickTags, level: level! });

  /** Saves the open object as the tray is now. */
  const keep = async () => {
    if (!object || !objects) return;
    const asks = new Set(tray.map(({ ask }) => ask));
    const next: TrayObject = { ...object, ticks: tray.map(tickOf), lines: Object.fromEntries(Object.entries(lines).filter(([ask]) => asks.has(ask))) };
    await objects.save(next);
    object = next;
  };

  const refreshUnfinished = async () => {
    unfinished = objects && !object ? await objects.unfinished() : [];
  };

  /** Opens an object, with no wait from here on: its ticks in the tray, its pinned tags and its choice (chosen already). */
  const openObject = (next: TrayObject) => {
    object = next;
    tray = next.ticks.map(trayItem);
    lines = { ...next.lines };
    choices = { pinned: [...(next.pinned ?? [])], dropped: [] };
  };

  /** A store's refusal, as the page's answer. */
  const refused = (error: Error) => Promise.reject(new HttpError(400, error.message));

  const putAway = async () => {
    object = undefined;
    lines = {};
    tray = [];
    choices = { pinned: [], dropped: [] };
    await refreshUnfinished();
  };

  const needObjects = (): TrayObjects => {
    if (!objects) throw new HttpError(404, "Not found");
    return objects;
  };

  const answer = async (route: string, body: Record<string, unknown>): Promise<unknown> => {
    switch (route) {
      case "/ask": {
        const mode = text(body, "mode") as AskMode;
        if (!["type", "enter", "refresh"].includes(mode)) throw new HttpError(400, "mode is type, enter or refresh");
        const idleMs = typeof body.idleMs === "number" && body.idleMs >= 250 ? body.idleMs : (settings.idleMs ?? undefined);
        asker.ask(requestFor(text(body, "text")!, mode, idleMs));
        return { ok: true };
      }
      case "/tick": {
        const ask = text(body, "ask")!.trim();
        const id = text(body, "id")!;
        if (!ask) throw new HttpError(400, "ask is empty");
        const card = finder.cards.get(id);
        if (body.ticked === false) {
          tray = tray.filter((item) => item.id !== id);
        } else {
          if (!card) throw new HttpError(400, `No doodad ${id}`);
          const graded = grades.get(ask);
          const level = graded?.levels.get(id);
          const kept = object?.key;
          let item = trayItem({ id, ask, tags: graded?.tags ?? askTags(), level });
          // An object keeps each card's level: one ticked before its ask was ranked is ranked now.
          if (kept !== undefined) [item] = (await levelled([item])) as [TrayItem];
          // The author may have put the object away, or opened another, while the card was ranked.
          if (object?.key !== kept) throw new HttpError(409, "The object changed while the card was being ranked");
          tray = ticked(tray, item, true);
        }
        await keep();
        await logTicks(ask);
        break;
      }
      case "/clear":
        tray = [];
        await keep();
        break;
      case "/choose": {
        const next = text(body, "choice", false) || undefined;
        if (object && next !== object.choice) throw new HttpError(409, `${object.title} is for ${object.choice ?? "no " + (badges?.label ?? "choice")}: put it away to choose another`);
        await choose(next);
        await saveSettings({ lastChoice: next });
        break;
      }
      case "/tag": {
        const picked = { facet: text(body, "facet")!, value: text(body, "value")! };
        const action = text(body, "action");
        const { pinned, dropped } = choices;
        if (action === "pin") choices = { pinned: pick(pinned, picked, true), dropped: pick(dropped, picked, false) };
        else if (action === "unpin") choices = { pinned: pick(pinned, picked, false), dropped };
        else if (action === "drop") choices = { pinned: pick(pinned, picked, false), dropped: pick(dropped, picked, true) };
        else throw new HttpError(400, "action is pin, unpin or drop");
        break;
      }
      case "/object": {
        const store = needObjects();
        if (object) throw new HttpError(409, `${object.title} is open: put it away first`);
        const title = text(body, "title")!.trim();
        if (!title) throw new HttpError(400, "title is empty");
        // The tray's cards go into it, each with its level, those ticked while it was ranked too. They
        // are levelled before it is started, so a tray that can't be levelled starts no object.
        const done = new Map<TrayItem, TrayItem>();
        for (let todo = tray; todo.length; todo = tray.filter((item) => !done.has(item))) {
          const items = await levelled(todo);
          todo.forEach((item, i) => done.set(item, items[i]!));
        }
        const started = await store.start(title, choice).catch(refused);
        if (object) throw new HttpError(409, `${(object as TrayObject).title} was opened meanwhile`);
        openObject({ ...started, ticks: [...started.ticks, ...tray.map((item) => tickOf(done.get(item)!))], pinned: [...(started.pinned ?? []), ...choices.pinned] });
        await keep();
        break;
      }
      case "/reopen": {
        const store = needObjects();
        if (object) throw new HttpError(409, `${object.title} is open: put it away first`);
        if (tray.length) throw new HttpError(409, "The tray has cards: clear it, or start an object with them, before reopening another");
        const key = text(body, "key")!;
        // An object whose choice (its map) is no longer one can't be opened for it: said before reopening.
        const listed = unfinished.find((known) => known.key === key);
        if (listed?.choice !== undefined && !badges?.choices.includes(listed.choice)) {
          throw new HttpError(409, `${listed.title} is for ${listed.choice}, which isn't one of the ${(badges?.label ?? "choice").toLowerCase()}s any more`);
        }
        const next = await store.reopen(key).catch(refused);
        if (object || tray.length) throw new HttpError(409, "The tray changed while it was being reopened");
        // Its choice is chosen; when the tray changes while that waits, the page's own choice comes back.
        const before = { choice, dependencies };
        await choose(next.choice);
        if (object || tray.length) {
          ({ choice, dependencies } = before);
          throw new HttpError(409, "The tray changed while it was being reopened");
        }
        openObject(next);
        await saveSettings({ lastChoice: next.choice });
        break;
      }
      case "/put-away":
        needObjects();
        if (!object) throw new HttpError(409, "No object is open");
        await putAway();
        break;
      case "/line": {
        needObjects();
        if (!object) throw new HttpError(409, "No object is open");
        const ask = text(body, "ask")!.trim();
        const line = text(body, "line")!.trim();
        if (!tray.some((item) => item.ask === ask)) throw new HttpError(400, `Nothing in the tray was ticked from "${ask}"`);
        if (!line) throw new HttpError(400, "A part needs a line");
        lines = { ...lines, [ask]: line };
        await keep();
        break;
      }
      case "/settings": {
        if (body.idleMs !== undefined) {
          if (typeof body.idleMs !== "number" || !(body.idleMs >= 250)) throw new HttpError(400, "idleMs must be 250 or more");
          await saveSettings({ idleMs: body.idleMs });
        }
        break;
      }
      case "/action": {
        const index = body.index;
        const action = typeof index === "number" ? actions[index] : undefined;
        if (!action) throw new HttpError(404, "No such tray action");
        if (!tray.length) throw new HttpError(409, `Tick a card before "${action.label}": it takes the tray's cards`);
        const raw = typeof body.inputs === "object" && body.inputs !== null ? (body.inputs as Record<string, unknown>) : {};
        const inputs: Record<string, string> = {};
        for (const input of action.inputs ?? []) {
          const value = typeof raw[input.name] === "string" ? (raw[input.name] as string).trim() : "";
          if (input.required && !value) throw new HttpError(400, `${input.label} is missing`);
          inputs[input.name] = value;
        }
        let done: TrayActionResult;
        try {
          done = await action.run({ items: tray, choice, inputs, object, levels });
        } catch (error) {
          throw new HttpError(409, (error as Error).message);
        }
        if (done.putAway) await putAway();
        else if (done.clearTray) {
          tray = [];
          choices = { pinned: [], dropped: [] };
          await keep();
        }
        return { ...changed(), done };
      }
      default:
        throw new HttpError(404, "Not found");
    }
    return changed();
  };

  await refreshUnfinished();

  let origin = "";
  const allowedHosts = new Set<string>();

  const handle = async (request: IncomingMessage, response: ServerResponse) => {
    const host = request.headers.host ?? "";
    if (!allowedHosts.has(host)) throw new HttpError(403, "Wrong host");
    const url = new URL(request.url ?? "/", origin);
    if (request.method === "POST") {
      const from = request.headers.origin;
      if (from !== undefined && !allowedHosts.has(from.replace(/^http:\/\//, ""))) throw new HttpError(403, "Wrong origin");
      if (!(request.headers["content-type"] ?? "").startsWith("application/json")) throw new HttpError(415, "Send JSON");
      const result = await answer(url.pathname, await readBody(request));
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return void response.end(JSON.stringify(result));
    }
    if (request.method !== "GET") throw new HttpError(405, "GET or POST");
    if (url.pathname === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return void response.end(finderPage());
    }
    if (url.pathname === "/state") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return void response.end(JSON.stringify(state()));
    }
    if (url.pathname === "/status") {
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      const rankers = { on: ranker ? [ranker.name] : [], off: options.off ? [{ ranker: "jev", reason: options.off }] : [], ...(ranker && options.keySource ? { keySource: options.keySource } : {}) };
      // The caller's additions first, so none can hide what tells a Finder apart.
      return void response.end(JSON.stringify({ ...options.status, finder: "doodad-finder", pid: process.pid, url: `${origin}/`, rankers }));
    }
    if (url.pathname === "/events") {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      await refreshUnfinished();
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return void response.write(`event: state\ndata: ${JSON.stringify(state())}\n\n`);
    }
    if (url.pathname.startsWith("/sheet/")) {
      let id: string;
      try {
        id = decodeURIComponent(url.pathname.slice("/sheet/".length));
      } catch {
        throw new HttpError(404, "No sheet");
      }
      const picture = finder.cards.has(id) ? picturesOf([id]).get(id) : undefined;
      if (picture?.kind !== "sheet") throw new HttpError(404, "No sheet");
      const type = SHEET_TYPES[path.extname(picture.path).toLowerCase()];
      if (!type) throw new HttpError(404, "No sheet");
      const { size } = await stat(picture.path).catch(() => Promise.reject(new HttpError(404, "No sheet")));
      response.writeHead(200, { "content-type": type, "content-length": size, "cache-control": "max-age=3600" });
      // A sheet rebuilt between the stat and the read ends the answer early, not the process.
      return void createReadStream(picture.path)
        .on("error", () => response.destroy())
        .pipe(response);
    }
    throw new HttpError(404, "Not found");
  };

  const server: Server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      if (!response.headersSent) response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: (error as Error).message }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;
  for (const name of ["127.0.0.1", "localhost"]) allowedHosts.add(`${name}:${port}`);

  return {
    url: `${origin}/`,
    get spend() {
      return spent();
    },
    async close() {
      asker.close();
      for (const client of clients) client.end();
      clients.clear();
      pictures = new WeakMap();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // A browser's kept-alive connections end with the server, not when the browser drops them.
      server.closeAllConnections();
      await closed;
    },
  };
}
