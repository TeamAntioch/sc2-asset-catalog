// The Set Finder's pages, served by its process (server.ts). The gallery: with nothing asked it
// shows every set by name (from /cards); the mapper types the place they need, and the process sends
// the narrowing's cards, then the ranked order, as events. The page keeps one element per card, so a
// re-sort moves the cards it has instead of drawing new ones. The kind chips pin a `kind` tag
// (narrow.ts), and hide the other kinds' cards in the gallery. A set's own page has its look in
// full, each card picture beside its frame filmed in game, and its plan and overview.

import { SET_KINDS } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";

import { escapeHtml, sizeLine } from "./card-html.ts";
import type { SetCard, SetCardPicture } from "./cards.ts";

const STYLE = `
:root { color-scheme: light dark; --bg: #f5f5f3; --card: #fff; --ink: #1a1a1a; --dim: #666; --line: #e0e0dc; --chip: #eef0f2; --accent: #2c5a85; }
@media (prefers-color-scheme: dark) { :root { --bg: #161719; --card: #1f2124; --ink: #e8e8ea; --dim: #9a9aa0; --line: #33363b; --chip: #2a2d31; --accent: #7db7e0; } }
body { background: var(--bg); color: var(--ink); font: 16px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0 auto; max-width: 1400px; padding: 1.5rem 2rem 4rem; }
a { color: var(--accent); }
h1 { margin: 0 0 0.25rem; }
code { font-size: 0.85rem; background: var(--chip); padding: 0 0.25rem; border-radius: 3px; overflow-wrap: anywhere; }
.bar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 0.5rem 0; }
#ask { font: inherit; font-size: 1.3rem; width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border: 1px solid #bbb; border-radius: 6px; background: var(--card); color: var(--ink); }
.status { color: var(--dim); font-size: 0.9rem; min-height: 1.3em; }
.status.failed { color: #c33; }
.kinds { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0; }
.kinds button { font: inherit; font-size: 0.9rem; border: 1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 999px; padding: 0.1rem 0.7rem; cursor: pointer; }
.kinds button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
.tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0; min-height: 1.6rem; }
.tag { display: inline-flex; gap: 0.3rem; align-items: center; background: var(--chip); border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.9rem; }
.tag.pinned { background: var(--accent); color: #fff; }
.tag button { font: inherit; font-size: 0.8rem; border: none; background: none; color: inherit; cursor: pointer; padding: 0 0.15rem; text-decoration: underline; }
.layout { display: grid; grid-template-columns: 1fr 300px; gap: 1.5rem; align-items: start; }
@media (max-width: 800px) { body { padding: 1rem; } .layout { grid-template-columns: 1fr; } }
.tray { position: sticky; top: 1rem; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem; font-size: 0.9rem; }
.tray h2 { font-size: 1rem; margin: 0 0 0.5rem; }
.tray ol { margin: 0 0 0.5rem; padding-left: 1.2rem; }
.tray li { margin-bottom: 0.5rem; overflow-wrap: anywhere; }
.tray .from { color: var(--dim); }
.tray .buttons { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.cards { list-style: none; padding: 0; margin: 0.5rem 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; }
.card[hidden] { display: none; }
.card.ticked { outline: 3px solid var(--accent); }
.first { display: block; aspect-ratio: 16 / 9; background: #000; }
.first img { width: 100%; height: 100%; object-fit: cover; display: block; }
.strip { display: flex; gap: 2px; background: var(--line); }
.strip img { flex: 1; min-width: 0; aspect-ratio: 16 / 9; object-fit: cover; cursor: pointer; display: block; }
.body { padding: 0.6rem 0.75rem 0.75rem; }
.card header label { cursor: pointer; }
.card .open { float: right; font-size: 0.85rem; }
.name { font-weight: bold; overflow-wrap: anywhere; }
.facts { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; font-size: 0.85rem; color: var(--dim); margin: 0.3rem 0; }
.level:empty { display: none; }
.level { font-weight: bold; color: var(--ink); }
.badge { background: #f1e6c8; color: #1a1a1a; border-radius: 4px; padding: 0 0.35rem; }
.badge.quiet { background: var(--chip); color: var(--dim); }
.look { margin: 0.4rem 0; display: -webkit-box; -webkit-line-clamp: 5; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
.look.open { display: block; }
.facets { display: flex; flex-wrap: wrap; gap: 0.25rem; margin: 0.3rem 0; }
.facets span { background: var(--chip); border-radius: 4px; padding: 0 0.35rem; font-size: 0.8rem; }
.uses { color: var(--dim); font-size: 0.85rem; margin: 0.4rem 0 0; }
button { font: inherit; }
.taken { margin-top: 0.75rem; }
.taken textarea { font: inherit; font-size: 0.85rem; width: 100%; box-sizing: border-box; height: 7rem; }
dialog.inputs { border: 1px solid #ccc; border-radius: 8px; padding: 1rem 1.25rem; max-width: 32rem; }
dialog.inputs label { display: block; margin: 0.5rem 0; }
dialog.inputs input { font: inherit; width: 100%; box-sizing: border-box; }
.error { color: #c33; }
.detail { max-width: 1200px; margin: 0 auto; }
.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 10px; }
@media (max-width: 700px) { .pair { grid-template-columns: 1fr; } }
figure { margin: 0; }
figure img { width: 100%; display: block; border: 1px solid var(--line); }
figcaption { font-size: 0.8rem; color: var(--dim); margin-top: 3px; }
.missing { aspect-ratio: 16 / 9; display: grid; place-items: center; border: 1px dashed var(--line); color: var(--dim); font-size: 0.85rem; }
`;

// The page's own script: asks, events, cards, the kind chips, ticks, tags, the tray and its actions.
const SCRIPT = `
const $ = (selector) => document.querySelector(selector);
const askBox = $("#ask"), statusLine = $("#status"), grid = $("#cards"), tagsRow = $("#tags"), trayBox = $("#tray"), takenBox = $("#taken"), kindsRow = $("#kinds");
const inputsDialog = $("dialog.inputs");
const KINDS = ${JSON.stringify(SET_KINDS)};
let state = { tags: [], tray: { items: [], copy: "" }, actions: [], ranker: null, off: null, idleMs: 1500, spend: 0, budget: null, capped: null, tickLog: false };
// Every set, by name: what the gallery shows with nothing asked.
let gallery = [];
// The ask the cards on the page came from: what a tick is filed under.
let shown = { text: "", ranked: false };
let pendingAction;
const elements = new Map();
const drawn = new WeakMap();

const post = async (route, body = {}) => {
  const response = await fetch(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const answer = await response.json();
  if (!response.ok) throw new Error(answer.error || response.statusText);
  return answer;
};
const escapeText = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ask = (mode) => post("/ask", { text: askBox.value, mode }).catch(showError);
const showError = (error) => { statusLine.textContent = error.message; statusLine.className = "status failed"; };
const say = (text) => { statusLine.textContent = text; statusLine.className = "status"; };
const currentAsk = () => askBox.value.trim();
const update = (next) => { state = next; render(); };
const money = (amount) => "$" + amount.toFixed(amount < 1 ? 4 : 2);
const spent = () => money(state.spend) + (state.budget !== null ? " of " + money(state.budget) : "") + " this session";

/** The kinds the chips pick: none picked shows every kind. */
const picked = () => new Set([...kindsRow.querySelectorAll("button[aria-pressed=true]")].map((b) => b.value));
const showsKind = (kind) => { const kinds = picked(); return kinds.size === 0 || kinds.has(kind); };

const showGallery = () => { place(gallery, "", false); say(gallery.length + " sets"); };

askBox.addEventListener("input", () => {
  if (!currentAsk()) showGallery();
  ask("type");
});
askBox.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); if (state.ranker && !state.capped && !(shown.ranked && shown.text === currentAsk())) say("Ranking..."); ask("enter"); } });

const inTray = () => new Set(state.tray.items.map(({ id }) => id));

/** Puts the cards in this order, moving the ones shown: each slides from where it was, so nothing jumps. */
function place(cards, text, ranked) {
  shown = { text: text.trim(), ranked };
  const before = new Map();
  for (const [id, element] of elements) if (element.isConnected) before.set(id, element.getBoundingClientRect());
  const ticked = inTray();
  const order = cards.map((card) => {
    let element = elements.get(card.id);
    if (!element) {
      element = document.createElement("li");
      element.className = "card";
      element.dataset.id = card.id;
      elements.set(card.id, element);
    }
    if (drawn.get(element) !== card.html) {
      element.innerHTML = card.html;
      drawn.set(element, card.html);
      element.dataset.kind = element.querySelector(".kind").textContent;
    }
    element.querySelector(".level").textContent = card.level === undefined ? "" : card.level.toFixed(1) + " " + card.levelName;
    const box = element.querySelector("input.tick");
    box.checked = ticked.has(card.id);
    element.classList.toggle("ticked", box.checked);
    element.hidden = !showsKind(element.dataset.kind);
    return element;
  });
  grid.replaceChildren(...order);
  for (const element of order) {
    const was = before.get(element.dataset.id);
    if (!was) continue;
    const now = element.getBoundingClientRect();
    const dx = was.left - now.left, dy = was.top - now.top;
    if (dx || dy) element.animate([{ transform: "translate(" + dx + "px, " + dy + "px)" }, { transform: "none" }], { duration: 250, easing: "ease-out" });
  }
}

const events = new EventSource("/events");
events.addEventListener("state", (event) => update(JSON.parse(event.data)));
events.addEventListener("narrowed", (event) => {
  const data = JSON.parse(event.data);
  if (data.text.trim() !== currentAsk() || !currentAsk()) return;
  place(data.cards, data.text, false);
  say(data.cards.length + " found in " + data.ms + " ms" + (state.ranker && !state.capped ? "; ranking when you press Enter or pause" : ""));
});
events.addEventListener("ranked", (event) => {
  const data = JSON.parse(event.data);
  state.spend = data.spend;
  if (data.text.trim() !== currentAsk()) return;
  place(data.cards, data.text, true);
  say(data.cards.length + " ranked by Jev in " + data.ms + " ms · " + spent());
});
events.addEventListener("failed", (event) => {
  const data = JSON.parse(event.data);
  if (data.text.trim() === currentAsk()) showError(new Error(data.message));
});
events.addEventListener("capped", (event) => {
  const data = JSON.parse(event.data);
  if (data.text.trim() === currentAsk()) showError(new Error("Not ranked: " + data.reason + "."));
});

grid.addEventListener("change", async (event) => {
  const box = event.target.closest("input.tick");
  if (!box) return;
  const id = box.closest(".card").dataset.id;
  // A tick from the gallery is filed under the set's own name: the kit files every tick under an ask.
  const from = shown.text || gallery.find((card) => card.id === id)?.name || id;
  try { update(await post("/tick", { ask: from, id, ticked: box.checked })); }
  catch (error) { box.checked = !box.checked; showError(error); }
});

// A look opens in full; a strip picture swaps with the large one.
grid.addEventListener("click", (event) => {
  if (event.target.matches(".look")) return void event.target.classList.toggle("open");
  if (!event.target.matches(".strip img")) return;
  const large = event.target.closest(".card").querySelector(".first img");
  const [small, big] = [{ src: event.target.dataset.large, title: event.target.title }, { src: large.dataset.large, title: large.title }];
  large.src = small.src; large.dataset.large = small.src; large.title = large.alt = small.title;
  event.target.src = big.src; event.target.dataset.large = big.src; event.target.title = event.target.alt = big.title;
});

kindsRow.replaceChildren(...KINDS.map((kind) => {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.value = kind;
  chip.textContent = kind;
  chip.setAttribute("aria-pressed", "false");
  return chip;
}));
kindsRow.addEventListener("click", async (event) => {
  const chip = event.target.closest("button");
  if (!chip) return;
  chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
  for (const element of elements.values()) element.hidden = !showsKind(element.dataset.kind);
  // With an ask, the kinds are a pinned tag, so the narrowing keeps only them.
  try {
    let next = state;
    for (const tag of state.tags.filter((t) => t.pinned && t.facet === "kind")) next = await post("/tag", { facet: "kind", value: tag.value, action: "unpin" });
    const kinds = [...picked()];
    if (kinds.length) next = await post("/tag", { facet: "kind", value: kinds.join(", "), action: "pin" });
    update(next);
    if (currentAsk()) ask("refresh");
  } catch (error) { showError(error); }
});

/** Copies on the click itself, so the browser counts it as the mapper's; else shows the text selected to copy by hand. */
function copy(text, what) {
  const fallback = () => showTaken({ message: "Copy " + what + " by hand:", text, copied: false });
  if (!navigator.clipboard) return fallback();
  navigator.clipboard.writeText(text).then(() => say("Copied " + what + "."), fallback);
}

function showTaken(done) {
  takenBox.hidden = false;
  takenBox.querySelector("p").textContent = done.message;
  const area = takenBox.querySelector("textarea");
  area.hidden = done.text === undefined || done.copied === true;
  area.value = done.text ?? "";
  if (!area.hidden) area.select();
}

function render() {
  const tray = state.tray;
  trayBox.querySelector("ol").replaceChildren(...tray.items.map((item) => {
    const entry = document.createElement("li");
    entry.innerHTML = "<strong>" + escapeText(item.name) + "</strong> <code>" + escapeText(item.id) + "</code>" + (item.level !== undefined ? " · " + item.level.toFixed(1) + " " + escapeText(item.levelName) : "") +
      '<div class="from">from “' + escapeText(item.ask) + '”</div><button data-do="copy">Copy</button> <button data-do="untick">Untick</button>';
    entry.querySelector('[data-do="copy"]').addEventListener("click", () => copy(item.copy, item.id));
    entry.querySelector('[data-do="untick"]').addEventListener("click", () => post("/tick", { ask: item.ask, id: item.id, ticked: false }).then(update).catch(showError));
    return entry;
  }));
  trayBox.querySelector(".empty").hidden = tray.items.length > 0;
  const buttons = trayBox.querySelector(".buttons");
  buttons.hidden = tray.items.length === 0;
  buttons.replaceChildren();
  const button = (label, title, run) => { const b = document.createElement("button"); b.textContent = label; b.title = title; b.addEventListener("click", run); buttons.append(b); };
  button("Copy all", "Copies every set's id, name and Cutscene Editor files, a line each", () => copy(tray.copy, "the tray"));
  button("Clear", "Empties the tray", () => post("/clear").then(update).catch(showError));
  state.actions.forEach((action, index) => button(action.label, action.title, () => startAction(index)));
  trayBox.querySelector(".logged").hidden = !state.tickLog;

  // The kind chips stand for the pinned kind tag, so it isn't shown again among the tags.
  tagsRow.replaceChildren(...state.tags.filter((tag) => !(tag.pinned && tag.facet === "kind")).map((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag" + (tag.pinned ? " pinned" : "");
    chip.innerHTML = escapeText(tag.facet + ": " + tag.value) + ' <button data-action="' + (tag.pinned ? "unpin" : "pin") + '">' + (tag.pinned ? "unpin" : "pin") + '</button><button data-action="drop">drop</button>';
    chip.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      try { update(await post("/tag", { facet: tag.facet, value: tag.value, action: b.dataset.action })); if (currentAsk()) ask("refresh"); } catch (error) { showError(error); }
    }));
    return chip;
  }));

  $("#ranker").textContent = state.ranker ? (state.capped ? "Jev is paused: " + state.capped : "Ranked by Jev · " + spent()) : "Not ranked: " + (state.off || "no ranker");
  $("#idle").parentElement.hidden = !state.ranker;
  $("#idle").value = (state.idleMs / 1000).toString();
  const ticked = inTray();
  for (const [id, element] of elements) {
    const box = element.querySelector("input.tick");
    box.checked = ticked.has(id);
    element.classList.toggle("ticked", box.checked);
  }
}

function startAction(index) {
  const action = state.actions[index];
  if (!action.inputs.length) return runAction(index, {});
  pendingAction = index;
  const form = inputsDialog.querySelector("form");
  inputsDialog.querySelector("h2").textContent = action.label;
  inputsDialog.querySelector(".error").textContent = "";
  form.querySelector(".fields").replaceChildren(...action.inputs.map((input) => {
    const label = document.createElement("label");
    label.textContent = input.label + " ";
    const field = document.createElement("input");
    field.name = input.name;
    field.placeholder = input.placeholder || "";
    field.required = !!input.required;
    label.append(field);
    return label;
  }));
  inputsDialog.showModal();
  form.querySelector("input")?.focus();
}

inputsDialog.querySelector("form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (event.submitter?.value === "cancel") { pendingAction = undefined; inputsDialog.close(); return; }
  const inputs = Object.fromEntries([...event.target.querySelectorAll(".fields input")].map((field) => [field.name, field.value]));
  runAction(pendingAction, inputs, (error) => { inputsDialog.querySelector(".error").textContent = error.message; }).then((ran) => { if (ran) inputsDialog.close(); });
});

async function runAction(index, inputs, onError = showError) {
  try {
    const answer = await post("/action", { index, inputs });
    update(answer);
    const done = answer.done;
    showTaken(done);
    if (done.text !== undefined && !done.copied && navigator.clipboard) {
      if (await navigator.clipboard.writeText(done.text).then(() => true, () => false)) showTaken({ ...done, copied: true });
    }
    return true;
  } catch (error) { onError(error); return false; }
}

$("#idle").addEventListener("change", (event) => post("/settings", { idleMs: Math.round(Number(event.target.value) * 1000) }).then(update).catch(showError));

fetch("/cards").then((response) => response.json()).then((found) => {
  gallery = found.cards;
  if (!currentAsk()) showGallery();
  else ask("enter");
}).catch(showError);
`;

/** The gallery page: self-contained, with no credential or path in it; everything else comes from the process. */
export function finderPage(): string {
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>Set Finder</title>`,
    `<link rel="icon" href="data:,">`,
    `<style>${STYLE}</style>`,
    `</head>`,
    `<body>`,
    `<h1>Set Finder</h1>`,
    `<input id="ask" type="search" placeholder="Where is the scene? a cramped ship corridor with a cockpit at one end" autocomplete="off" autofocus>`,
    `<div class="bar"><span class="status" id="status"></span></div>`,
    `<div class="kinds" id="kinds" role="group" aria-label="Kinds of set"></div>`,
    `<div class="bar"><span class="status" id="ranker"></span><label>Rank after a pause of <input id="idle" type="number" min="0.25" step="0.25" style="width: 4em"> s</label></div>`,
    `<div class="tags" id="tags"></div>`,
    `<div class="layout">`,
    `<ol class="cards" id="cards"></ol>`,
    `<aside class="tray" id="tray"><h2>Tray</h2>`,
    `<p class="empty">Tick sets to collect them here, then copy their ids and the Cutscene Editor files they are in.</p><ol></ol>`,
    `<div class="buttons" hidden></div><p class="logged from" hidden>Ticks are logged for the test command.</p>`,
    `<div class="taken" id="taken" hidden><p></p><textarea readonly aria-label="Text to copy"></textarea></div></aside>`,
    `</div>`,
    `<dialog class="inputs"><form method="dialog">`,
    `<h2></h2>`,
    `<div class="fields"></div>`,
    `<p class="error"></p>`,
    `<p><button value="run">Go</button> <button value="cancel" formnovalidate>Cancel</button></p>`,
    `</form></dialog>`,
    `<script>${SCRIPT}</script>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}

const figure = (picture: { readonly url: string; readonly shows?: string }, caption = picture.shows ?? ""): string =>
  `<figure><a href="${escapeHtml(picture.url)}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeHtml(picture.url)}" alt="${escapeHtml(caption)}"></a><figcaption>${escapeHtml(caption)}</figcaption></figure>`;

const list = (title: string, items: readonly string[]): string => (items.length ? `<h3>${title}</h3><ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "");

/** Each chosen picture beside the same view filmed in game, or a note that there is no usable frame of it. */
const pairHtml = (picture: SetCardPicture): string =>
  `<div class="pair">${figure(picture)}${picture.inGame ? figure(picture.inGame, `in game: ${picture.shows}`) : `<div class="missing">no frame of this view filmed in game</div>`}</div>`;

/** One set's page: its look in full, its pictures beside their frames in game, its plan and overview, and what its look rests on. */
export function setPage(card: SetCard): string {
  const { look } = card;
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(card.name)} · Set Finder</title>`,
    `<link rel="icon" href="data:,">`,
    `<style>${STYLE}</style>`,
    `</head>`,
    `<body><div class="detail">`,
    `<p><a href="/">← Set Finder</a></p>`,
    `<h1>${escapeHtml(card.name)} <small style="font-weight:normal;color:var(--dim)">${escapeHtml(card.id)}</small></h1>`,
    `<p class="facts"><span class="badge">${escapeHtml(look.kind)}</span><span>${escapeHtml(card.source)}</span><span>${escapeHtml(sizeLine(card))}</span><span>look: ${escapeHtml(look.confidence)} confidence</span></p>`,
    `<p>${escapeHtml(look.look)}</p>`,
    `<p class="facets">${look.facets.map((facet) => `<span>${escapeHtml(facet)}</span>`).join("")}</p>`,
    list("Could stand in for", look.standsInFor),
    list("Places in it", look.rooms ?? []),
    card.pictures.length ? `<h3>The chosen pictures, and the same views in game</h3>${card.pictures.map(pairHtml).join("")}` : "",
    `<h3>Plan and overview</h3><div class="grid">${card.views.map((view) => figure(view)).join("")}</div>`,
    list("Problems with the pictures", look.problems),
    `<p class="uses">Look written from: ${escapeHtml(look.basis)}</p>`,
    `<h3>Where it is</h3><ul>${look.files.map((file) => `<li><code>${escapeHtml(file)}</code></li>`).join("")}</ul>`,
    `</div></body>`,
    `</html>`,
    ``,
  ].join("\n");
}
