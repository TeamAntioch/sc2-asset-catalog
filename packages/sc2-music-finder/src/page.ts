// The Music Finder's page, served by its process (server.ts). The mapper types what the scene
// needs; the process sends the narrowing's cards, then the ranked order, as events. The page keeps
// one element per card, so a re-sort moves the cards it has (sliding each from where it was)
// instead of drawing new ones. Its filters pin tags (narrow.ts). A card's Play starts the file
// from its start or from a section, through the one player at the foot of the page; the in-point
// the mapper sets on a card goes into what the tray copies (in-point.ts).

import { IN_POINT_SCRIPT } from "./in-point.ts";

const STYLE = `
body { background: #f5f5f3; color: #1a1a1a; font: 16px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0 auto; max-width: 1400px; padding: 1.5rem 2rem 6rem; }
h1 { margin: 0 0 0.25rem; }
code { font-size: 0.85rem; background: #efefec; padding: 0 0.25rem; border-radius: 3px; overflow-wrap: anywhere; }
.bar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 0.5rem 0; }
#ask { font: inherit; font-size: 1.3rem; width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border: 1px solid #bbb; border-radius: 6px; }
.status { color: #666; font-size: 0.9rem; min-height: 1.3em; }
.status.failed { color: #a00; }
.filters { display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; font-size: 0.9rem; margin: 0.5rem 0; }
.filters label { display: inline-flex; gap: 0.3rem; align-items: center; }
.filters input[type=number] { width: 4.5em; }
.deps { display: inline-flex; gap: 0.6rem; flex-wrap: wrap; }
.tags { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.5rem 0; min-height: 1.6rem; }
.tag { display: inline-flex; gap: 0.3rem; align-items: center; background: #e7ebef; border-radius: 999px; padding: 0.1rem 0.6rem; font-size: 0.9rem; }
.tag.pinned { background: #2c5a85; color: #fff; }
.tag button { font: inherit; font-size: 0.8rem; border: none; background: none; color: inherit; cursor: pointer; padding: 0 0.15rem; text-decoration: underline; }
.layout { display: grid; grid-template-columns: 1fr 300px; gap: 1.5rem; align-items: start; }
.tray { position: sticky; top: 1rem; background: #fff; border: 1px solid #e0e0dc; border-radius: 8px; padding: 0.75rem; font-size: 0.9rem; }
.tray h2 { font-size: 1rem; border: none; margin: 0 0 0.5rem; padding: 0; }
.tray ol { margin: 0 0 0.5rem; padding-left: 1.2rem; }
.tray li { margin-bottom: 0.5rem; }
.tray li button { font-size: 0.8rem; }
.tray .from { color: #666; }
.tray .buttons { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.cards { list-style: none; padding: 0; margin: 0.5rem 0 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 1rem; }
.card { position: relative; background: #fff; border: 1px solid #e0e0dc; border-radius: 8px; padding: 0.75rem; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
.card.ticked { outline: 3px solid #2c5a85; }
.card header { margin-bottom: 0.4rem; }
.card header label { cursor: pointer; }
.name { font-weight: bold; overflow-wrap: anywhere; }
.kind { color: #666; font-size: 0.85rem; }
.facts { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; font-size: 0.85rem; color: #555; margin: 0.3rem 0; }
.level:empty { display: none; }
.level { font-weight: bold; color: #1a1a1a; }
.badge { background: #f1e6c8; border-radius: 4px; padding: 0 0.35rem; }
.badge.warn { background: #f3d2d2; }
.badge.quiet { background: #eef0f2; color: #666; }
.desc { margin: 0.4rem 0; }
.moods { margin: 0.2rem 0; }
.mood { display: inline-block; background: #eef0f2; border-radius: 4px; padding: 0 0.35rem; font-size: 0.8rem; margin-right: 0.2rem; }
.piece { border-top: 1px solid #ecece8; padding: 0.35rem 0; font-size: 0.9rem; }
.nofile, .used, .layer { color: #666; font-size: 0.85rem; }
.layer .label { font-weight: bold; }
.sections { margin: 0.3rem 0 0; padding-left: 0; list-style: none; font-size: 0.85rem; }
.sections li { margin-bottom: 0.25rem; }
.sections .at { display: inline-block; min-width: 2.5rem; color: #666; }
.inpoint { font-size: 0.85rem; margin: 0.4rem 0 0.2rem; }
.inpoint input { font: inherit; }
.inpoint input.bad { outline: 2px solid #a00; }
dialog.inputs { border: 1px solid #ccc; border-radius: 8px; padding: 1rem 1.25rem; max-width: 32rem; }
dialog.inputs label { display: block; margin: 0.5rem 0; }
dialog.inputs input { font: inherit; width: 100%; box-sizing: border-box; }
.error { color: #a00; }
button { font: inherit; }
.taken { margin-top: 0.75rem; }
.taken textarea { font: inherit; font-size: 0.85rem; width: 100%; box-sizing: border-box; height: 7rem; }
.player { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top: 1px solid #d0d0cc; padding: 0.5rem 2rem; display: flex; gap: 1rem; align-items: center; }
.player[hidden] { display: none; }
.player audio { flex: 1; min-width: 0; }
.note { color: #666; font-size: 0.85rem; }
`;

// The page's own script: asks, events, cards, ticks, filters, tags, the player, the tray and its actions.
const SCRIPT = `
const $ = (selector) => document.querySelector(selector);
const askBox = $("#ask"), statusLine = $("#status"), grid = $("#cards"), tagsRow = $("#tags"), trayBox = $("#tray"), takenBox = $("#taken");
const player = $("#player"), playerBar = $("#playerbar"), nowPlaying = $("#nowplaying");
const inputsDialog = $("dialog.inputs");
let state = { tags: [], tray: { items: [], copy: "" }, objects: null, actions: [], badges: null, ranker: null, off: null, idleMs: 1500, spend: 0, budget: null, capped: null, tickLog: false };
let facets = { kinds: [], factions: [], dependencies: [], audio: { on: false, files: 0 } };
// The ask the cards on the page came from: what a tick is filed under.
let shown = { text: "", ranked: false };
// The tray action waiting on its inputs.
let pendingAction;
// The in-point the mapper set on each card, in seconds, by card id.
const inPoints = new Map();
// The file the player has, and the card it was started from.
let playing = { key: "", card: "" };
const elements = new Map();
const drawn = new WeakMap();

${IN_POINT_SCRIPT}

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
/** Shows a new state, and asks again with what it changed (the filters, the tags). */
const updateAndAsk = (next) => { update(next); if (currentAsk()) ask("refresh"); };

askBox.addEventListener("input", () => {
  if (!currentAsk()) { place([], "", false); say(""); }
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
    // A card is drawn again only when it changed: its audio once a folder is known.
    if (drawn.get(element) !== card.html) {
      element.innerHTML = card.html;
      drawn.set(element, card.html);
      if (inPoints.has(card.id)) element.querySelector("input.from").value = formatClock(inPoints.get(card.id));
    }
    const level = element.querySelector(".level");
    level.textContent = card.level === undefined ? "" : card.level.toFixed(1) + " " + card.levelName;
    const box = element.querySelector("input.tick");
    box.checked = ticked.has(card.id);
    element.classList.toggle("ticked", box.checked);
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

const spent = () => money(state.spend) + (state.budget !== null ? " of " + money(state.budget) : "") + " this session";

const events = new EventSource("/events");
events.addEventListener("state", (event) => update(JSON.parse(event.data)));
events.addEventListener("narrowed", (event) => {
  const data = JSON.parse(event.data);
  if (data.text.trim() !== currentAsk()) return;
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
  if (box) {
    const id = box.closest(".card").dataset.id;
    try { update(await post("/tick", { ask: shown.text, id, ticked: box.checked })); }
    catch (error) { box.checked = !box.checked; showError(error); }
    return;
  }
  const field = event.target.closest("input.from");
  if (field) {
    const id = field.closest(".card").dataset.id;
    const seconds = field.value.trim() ? parseClock(field.value) : 0;
    field.classList.toggle("bad", seconds === undefined);
    if (seconds === undefined) return say("An in-point is minutes and seconds, like 0:38, or seconds, like 38.");
    if (seconds > 0) inPoints.set(id, seconds); else inPoints.delete(id);
    render();
  }
});

grid.addEventListener("click", (event) => {
  const button = event.target.closest("button.play");
  if (button) return start(button.closest(".card").dataset.id, button.dataset.key, Number(button.dataset.from));
  const here = event.target.closest("button.here");
  if (here) {
    const card = here.closest(".card");
    const keys = [...card.querySelectorAll("button.play")].map((b) => b.dataset.key);
    if (!keys.includes(playing.key)) return say("Play one of this card's files first, then use its position.");
    const field = card.querySelector("input.from");
    field.value = formatClock(player.currentTime);
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
});

/** What the player does once the file it is loading has its length: the one start still waiting. */
let waiting;

/** Starts a file at a position in the one player. */
function start(card, key, from) {
  playerBar.hidden = false;
  nowPlaying.textContent = key;
  const begin = () => { player.currentTime = from; player.play().catch(showError); };
  // A file still loading when another is chosen mustn't start the old position on the new file.
  if (waiting) player.removeEventListener("loadedmetadata", waiting);
  waiting = undefined;
  if (playing.key === key && player.readyState >= 1) begin();
  else {
    playing = { key, card };
    waiting = begin;
    player.addEventListener("loadedmetadata", begin, { once: true });
    player.src = "/audio/" + encodeURIComponent(key);
  }
  playing = { key, card };
}
player.addEventListener("error", () => say("The player couldn't play that file. Safari can't play Ogg: try Chrome or Firefox."));

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

/** The filters pin tags of their own facets: one at a time per facet. */
async function setFilter(facet, value) {
  try {
    let next = state;
    for (const tag of state.tags.filter((t) => t.pinned && t.facet === facet)) next = await post("/tag", { facet, value: tag.value, action: "unpin" });
    if (value) next = await post("/tag", { facet, value, action: "pin" });
    updateAndAsk(next);
  } catch (error) { showError(error); }
}
const pinnedValue = (facet) => state.tags.find((tag) => tag.pinned && tag.facet === facet)?.value ?? "";
/** A range's value from its two ends: 3, 2-4, 2- or -4; empty for none. */
const rangeValue = (min, max) => {
  // 4-2 is 2-4: the ends are swapped, not sent as a range nothing is in.
  if (min && max && Number(min) > Number(max)) [min, max] = [max, min];
  return min && max ? (min === max ? min : min + "-" + max) : min ? min + "-" : max ? "-" + max : "";
};
const rangeEnds = (value) => { const m = /^(\\d*(?:\\.\\d+)?)(-?)(\\d*(?:\\.\\d+)?)$/.exec(value); return !m ? ["", ""] : m[2] ? [m[1], m[3]] : [m[1], m[1]]; };

for (const facet of ["energy", "tension", "valence", "length"]) {
  const [min, max] = ["min", "max"].map((end) => $("#" + facet + "-" + end));
  const change = () => setFilter(facet, rangeValue(min.value, max.value));
  min.addEventListener("change", change);
  max.addEventListener("change", change);
}
for (const facet of ["kind", "faction"]) $("#" + facet).addEventListener("change", (event) => setFilter(facet, event.target.value));
$("#show").addEventListener("change", (event) => setFilter("show", event.target.checked ? "everything" : ""));
$("#deps").addEventListener("change", () => setFilter("map has", [...document.querySelectorAll("#deps input:checked")].map((box) => box.value).join(", ")));

/** Sets a filter's field from the page's state, unless it is being edited: a state event mustn't overwrite what is half typed. */
const settle = (field, value) => { if (document.activeElement !== field) field.value = value; };

function renderFilters() {
  for (const facet of ["energy", "tension", "valence", "length"]) {
    const [min, max] = rangeEnds(pinnedValue(facet));
    settle($("#" + facet + "-min"), min);
    settle($("#" + facet + "-max"), max);
  }
  for (const facet of ["kind", "faction"]) settle($("#" + facet), pinnedValue(facet));
  $("#show").checked = pinnedValue("show") === "everything";
  const have = pinnedValue("map has").split(",").map((name) => name.trim()).filter(Boolean);
  for (const box of document.querySelectorAll("#deps input")) box.checked = have.includes(box.value);
}

function render() {
  const tray = state.tray;
  trayBox.querySelector("ol").replaceChildren(...tray.items.map((item) => {
    const entry = document.createElement("li");
    const from = inPoints.get(item.id);
    entry.innerHTML = "<strong>" + escapeText(item.name) + "</strong>" + (item.id !== item.name ? " <code>" + escapeText(item.id) + "</code>" : "") + (from ? " · from " + formatClock(from) : "") + (item.level !== undefined ? " · " + item.level.toFixed(1) + " " + escapeText(item.levelName) : "") +
      '<div class="from">from “' + escapeText(item.ask) + '”</div><button data-do="copy">Copy</button> <button data-do="untick">Untick</button>';
    entry.querySelector('[data-do="copy"]').addEventListener("click", () => copy(itemWithInPoint(item.copy, item.id, inPoints.get(item.id)), item.id));
    entry.querySelector('[data-do="untick"]').addEventListener("click", () => post("/tick", { ask: item.ask, id: item.id, ticked: false }).then(update).catch(showError));
    return entry;
  }));
  trayBox.querySelector(".empty").hidden = tray.items.length > 0;
  const buttons = trayBox.querySelector(".buttons");
  buttons.hidden = tray.items.length === 0;
  buttons.replaceChildren();
  const button = (label, title, run) => { const b = document.createElement("button"); b.textContent = label; b.title = title; b.addEventListener("click", run); buttons.append(b); };
  button("Copy all", "Copies every id, with its in-point, then the dependencies they need", () => copy(trayWithInPoints(tray.copy, inPoints), "the tray"));
  button("Clear", "Empties the tray", () => post("/clear").then(update).catch(showError));
  state.actions.forEach((action, index) => button(action.label, action.title, () => startAction(index)));
  trayBox.querySelector(".logged").hidden = !state.tickLog;

  tagsRow.replaceChildren(...state.tags.map((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag" + (tag.pinned ? " pinned" : "");
    chip.innerHTML = escapeText(tag.facet + ": " + tag.value) + ' <button data-action="' + (tag.pinned ? "unpin" : "pin") + '">' + (tag.pinned ? "unpin" : "pin") + '</button><button data-action="drop">drop</button>';
    chip.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      try { updateAndAsk(await post("/tag", { facet: tag.facet, value: tag.value, action: b.dataset.action })); } catch (error) { showError(error); }
    }));
    return chip;
  }));
  renderFilters();

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
    // The process may have copied it already; if not, try the browser's clipboard, the text shown selected meanwhile.
    if (done.text !== undefined && !done.copied && navigator.clipboard) {
      if (await navigator.clipboard.writeText(done.text).then(() => true, () => false)) showTaken({ ...done, copied: true });
    }
    return true;
  } catch (error) { onError(error); return false; }
}

$("#idle").addEventListener("change", (event) => post("/settings", { idleMs: Math.round(Number(event.target.value) * 1000) }).then(update).catch(showError));

// What the filters offer, and whether there is an Audio folder, from the process.
fetch("/facets").then((response) => response.json()).then((found) => {
  facets = found;
  for (const [id, values] of [["kind", facets.kinds], ["faction", facets.factions]]) $("#" + id).append(...values.map((value) => new Option(value, value)));
  $("#deps").replaceChildren(...facets.dependencies.map((name) => {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.value = name;
    label.append(box, " " + name);
    return label;
  }));
  $("#audionote").textContent = facets.audio.on
    ? "Playing from your Audio folder (" + facets.audio.files + " files). Safari can't play Ogg: use Chrome or Firefox."
    : "No Audio folder: cards can't play. Start the Finder with --audio <folder> to hear them (see the README).";
  renderFilters();
}).catch(showError);
`;

/** The page: self-contained, with no credential or path in it; everything else comes from the process. */
export function finderPage(): string {
  const range = (id: string, label: string, ends: string) => `<label>${label} <select id="${id}-min" aria-label="${label}, lowest">${ends}</select>–<select id="${id}-max" aria-label="${label}, highest">${ends}</select></label>`;
  const ratings = `<option value="">any</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n}</option>`).join("")}`;
  const seconds = (id: string) => `<label>Length <input id="${id}-min" type="number" min="0" aria-label="Length, shortest, in seconds"> to <input id="${id}-max" type="number" min="0" aria-label="Length, longest, in seconds"> s</label>`;
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>Music Finder</title>`,
    `<link rel="icon" href="data:,">`,
    `<style>${STYLE}</style>`,
    `</head>`,
    `<body>`,
    `<h1>Music Finder</h1>`,
    `<input id="ask" type="search" placeholder="What does the scene need? a tense build under an alien approach, about a minute" autocomplete="off" autofocus>`,
    `<div class="bar"><span class="status" id="status"></span></div>`,
    `<div class="filters">`,
    range("energy", "Energy", ratings),
    range("tension", "Tension", ratings),
    range("valence", "Valence", ratings),
    seconds("length"),
    `<label>Kind <select id="kind"><option value="">any</option></select></label>`,
    `<label>Faction <select id="faction"><option value="">any</option></select></label>`,
    `<span>My map has <span class="deps" id="deps"></span></span>`,
    `<label><input type="checkbox" id="show"> Show silent, unplayable and map-local ids</label>`,
    `</div>`,
    `<div class="bar"><span class="status" id="ranker"></span><label>Rank after a pause of <input id="idle" type="number" min="0.25" step="0.25" style="width: 4em"> s</label></div>`,
    `<div class="tags" id="tags"></div>`,
    `<div class="layout">`,
    `<ol class="cards" id="cards"></ol>`,
    `<aside class="tray" id="tray"><h2>Tray</h2>`,
    `<p class="empty">Tick cards to collect them here, then copy their ids, in-points and the dependencies they need.</p><ol></ol>`,
    `<div class="buttons" hidden></div><p class="logged from" hidden>Ticks are logged for the test command.</p>`,
    `<div class="taken" id="taken" hidden><p></p><textarea readonly aria-label="Text to copy"></textarea></div>`,
    `<p class="note" id="audionote"></p></aside>`,
    `</div>`,
    `<dialog class="inputs"><form method="dialog">`,
    `<h2></h2>`,
    `<div class="fields"></div>`,
    `<p class="error"></p>`,
    `<p><button value="run">Go</button> <button value="cancel" formnovalidate>Cancel</button></p>`,
    `</form></dialog>`,
    `<div class="player" id="playerbar" hidden><strong id="nowplaying"></strong><audio id="player" controls preload="metadata"></audio></div>`,
    `<script>${SCRIPT}</script>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}
