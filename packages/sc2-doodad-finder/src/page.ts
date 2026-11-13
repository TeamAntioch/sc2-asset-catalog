// The Doodad Finder's page, served by its process (server.ts). The mapper types an
// ask; the process sends the narrowing's cards, then the ranked order, as events. The page keeps
// one element per card, so a re-sort moves the cards it has (sliding each from where it was)
// instead of drawing new ones, and a picture loads once. Ticked cards collect in the tray, whose
// copy buttons write to the browser's clipboard during the click. With objects (an option, for
// sc2-adjutant), the tray is kept for one, named or reopened there, and each ask's line can be
// edited. It shares the catalog's card style and zoom (doodad-card-html.ts).

import { DOODAD_PAGE_STYLE, ZOOM_SCRIPT } from "@team-antioch/sc2-asset-catalog/catalog/doodad-card-html.js";

const STYLE = `
.bar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin: 0.5rem 0; }
#ask { font: inherit; font-size: 1.3rem; width: 100%; box-sizing: border-box; padding: 0.5rem 0.75rem; border: 1px solid #bbb; border-radius: 6px; }
.status { color: #666; font-size: 0.9rem; min-height: 1.3em; }
.status.failed { color: #a00; }
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
.object { border-bottom: 1px solid #e0e0dc; padding-bottom: 0.5rem; margin-bottom: 0.5rem; }
.object form { display: flex; gap: 0.4rem; }
.object input, .lines input { font: inherit; flex: 1; min-width: 0; }
.object ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
.lines label { display: block; margin: 0 0 0.4rem; }
.lines input { width: 100%; box-sizing: border-box; }
.cards { margin-top: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); }
.card code { overflow-wrap: anywhere; }
.card { position: relative; }
.card.ticked { outline: 3px solid #2c5a85; }
.card header label { cursor: pointer; }
.card .look { margin: 0.4rem 0 0.2rem; }
.card .facts { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.level:empty { display: none; }
.level { font-weight: bold; }
.badge { background: #f1e6c8; border-radius: 4px; padding: 0 0.35rem; }
.badge.provided { background: #d4ecd4; }
dialog.inputs { border: 1px solid #ccc; border-radius: 8px; padding: 1rem 1.25rem; max-width: 32rem; }
dialog.inputs label { display: block; margin: 0.5rem 0; }
dialog.inputs input { font: inherit; width: 100%; box-sizing: border-box; }
.error { color: #a00; }
button { font: inherit; }
.taken { margin-top: 0.75rem; }
.taken textarea { font: inherit; font-size: 0.85rem; width: 100%; box-sizing: border-box; height: 7rem; }
`;

// The page's own script: asks, events, cards, ticks, tags, the tray and its actions.
const SCRIPT = `
const $ = (selector) => document.querySelector(selector);
const askBox = $("#ask"), statusLine = $("#status"), grid = $("#cards"), tagsRow = $("#tags"), trayBox = $("#tray"), takenBox = $("#taken");
const inputsDialog = $("dialog.inputs");
let state = { tags: [], tray: { items: [], copy: "" }, objects: null, actions: [], badges: null, ranker: null, off: null, idleMs: 1500, spend: 0, budget: null, capped: null, tickLog: false };
// The ask the cards on the page came from: what a tick is filed under.
let shown = { text: "", ranked: false };
// The tray action waiting on its inputs.
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
/** Shows a new state, and asks again with what it changed (an object's title, its choice, its tags). */
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
    // A card is drawn again only when it changed: its badge once a choice is made, a new picture.
    if (drawn.get(element) !== card.html) { element.innerHTML = card.html; drawn.set(element, card.html); }
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
  if (data.text.trim() === currentAsk()) showError(new Error(data.narrowed ? "The ranker failed: " + data.error + ". The narrowing's order is shown." : "The search failed: " + data.error + "."));
});
events.addEventListener("capped", (event) => {
  const data = JSON.parse(event.data);
  if (data.text.trim() === currentAsk()) showError(new Error("Not ranked: " + data.reason + "."));
});

grid.addEventListener("change", async (event) => {
  const box = event.target.closest("input.tick");
  if (!box) return;
  const id = box.closest(".card").dataset.id;
  try { update(await post("/tick", { ask: shown.text, id, ticked: box.checked })); }
  catch (error) { box.checked = !box.checked; showError(error); }
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
      '<div class="from">from \\u201c' + escapeText(item.ask) + '\\u201d</div><button data-do="copy">Copy</button> <button data-do="untick">Untick</button>';
    entry.querySelector('[data-do="copy"]').addEventListener("click", () => copy(item.copy, item.id));
    entry.querySelector('[data-do="untick"]').addEventListener("click", () => post("/tick", { ask: item.ask, id: item.id, ticked: false }).then(update).catch(showError));
    return entry;
  }));
  trayBox.querySelector(".empty").hidden = tray.items.length > 0;
  const buttons = trayBox.querySelector(".buttons");
  buttons.hidden = tray.items.length === 0;
  buttons.replaceChildren();
  const button = (label, title, run) => { const b = document.createElement("button"); b.textContent = label; b.title = title; b.addEventListener("click", run); buttons.append(b); };
  button("Copy all", "Copies every id, then the packages they need", () => copy(tray.copy, "the tray"));
  button("Clear", state.objects?.open ? "Unticks every card, in the object too" : "Empties the tray", () => post("/clear").then(update).catch(showError));
  state.actions.forEach((action, index) => button(action.label, action.title, () => startAction(index)));
  trayBox.querySelector(".logged").hidden = !state.tickLog;
  renderObject();

  tagsRow.replaceChildren(...state.tags.map((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag" + (tag.pinned ? " pinned" : "");
    chip.innerHTML = escapeText(tag.facet + ": " + tag.value) + ' <button data-action="' + (tag.pinned ? "unpin" : "pin") + '">' + (tag.pinned ? "unpin" : "pin") + '</button><button data-action="drop">drop</button>';
    chip.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      try { update(await post("/tag", { facet: tag.facet, value: tag.value, action: b.dataset.action })); if (currentAsk()) ask("refresh"); } catch (error) { showError(error); }
    }));
    return chip;
  }));

  const chooser = $("#choice");
  chooser.parentElement.hidden = !state.badges;
  // An open object keeps its choice until it is put away.
  chooser.disabled = !!state.objects?.open;
  if (state.badges) {
    chooser.previousSibling.textContent = state.badges.label + " ";
    chooser.replaceChildren(new Option("none", ""), ...state.badges.choices.map((c) => new Option(c, c, false, c === state.badges.chosen)));
    if (!state.badges.chosen) chooser.value = "";
  }
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

/** The object the tray is kept for: named or reopened when none is open, else its title and each ask's line. */
function renderObject() {
  const box = $("#object"), objects = state.objects;
  box.hidden = !objects;
  if (!objects) return;
  const open = objects.open;
  box.querySelector("form").hidden = !!open;
  box.querySelector(".label").textContent = objects.label + " ";
  box.querySelector("form input").placeholder = objects.placeholder;
  const opened = box.querySelector(".opened");
  opened.hidden = !open;
  if (open) opened.querySelector("strong").textContent = open.title + (open.choice ? " (" + open.choice + ")" : "");
  box.querySelector("ul").replaceChildren(...(open ? [] : objects.unfinished).map((known) => {
    const entry = document.createElement("li");
    entry.innerHTML = escapeText(known.title) + (known.choice ? " (" + escapeText(known.choice) + ")" : "") + ", " + known.ticked + " ticked <button>Reopen</button>";
    entry.querySelector("button").addEventListener("click", () => post("/reopen", { key: known.key }).then(updateAndAsk).catch(showError));
    return entry;
  }));
  const lines = trayBox.querySelector(".lines");
  const asks = state.tray.asks || [];
  lines.hidden = !asks.length;
  // A line being typed in isn't drawn over.
  if (lines.contains(document.activeElement)) return;
  lines.querySelector("div").replaceChildren(...asks.map(({ ask: from, line }) => {
    const label = document.createElement("label");
    label.innerHTML = '<span class="from">\u201c' + escapeText(from) + '\u201d reads as</span> ';
    const field = document.createElement("input");
    field.value = line;
    field.addEventListener("change", () => post("/line", { ask: from, line: field.value }).then(update).catch((error) => { field.value = line; showError(error); }));
    label.append(field);
    return label;
  }));
}

$("#object form").addEventListener("submit", (event) => {
  event.preventDefault();
  const field = event.target.querySelector("input");
  post("/object", { title: field.value }).then((next) => { field.value = ""; updateAndAsk(next); }).catch(showError);
});
$("#object .opened button").addEventListener("click", () => post("/put-away").then(updateAndAsk).catch(showError));

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

$("#choice").addEventListener("change", (event) => post("/choose", { choice: event.target.value || null }).then(updateAndAsk).catch(showError));
$("#idle").addEventListener("change", (event) => post("/settings", { idleMs: Math.round(Number(event.target.value) * 1000) }).then(update).catch(showError));
`;

/** The page: self-contained, with no credential or path in it; everything else comes from the process. */
export function finderPage(): string {
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>Doodad Finder</title>`,
    `<link rel="icon" href="data:,">`,
    `<style>${DOODAD_PAGE_STYLE}${STYLE}</style>`,
    `</head>`,
    `<body>`,
    `<h1>Doodad Finder</h1>`,
    `<input id="ask" type="search" placeholder="Ask for a doodad: industrial press head, something to hide behind on a catwalk" autocomplete="off" autofocus>`,
    `<div class="bar"><span class="status" id="status"></span></div>`,
    `<div class="bar"><label hidden><span></span><select id="choice"></select></label><span class="status" id="ranker"></span><label>Rank after a pause of <input id="idle" type="number" min="0.25" step="0.25" style="width: 4em"> s</label></div>`,
    `<div class="tags" id="tags"></div>`,
    `<div class="layout">`,
    `<ol class="cards" id="cards"></ol>`,
    `<aside class="tray" id="tray"><h2>Tray</h2>`,
    `<div class="object" id="object" hidden><form><span class="label"></span><input aria-label="Title" required><button>Start</button></form>`,
    `<p class="opened" hidden><strong></strong> <button title="Its ticks are kept: reopen it later">Put away</button></p><ul></ul></div>`,
    `<p class="empty">Tick cards to collect them here, then copy their ids and the packages they need.</p><ol></ol>`,
    `<div class="lines" hidden><p class="from">Each ask's line: what its cards have to read as.</p><div></div></div>`,
    `<div class="buttons" hidden></div><p class="logged from" hidden>Ticks are logged for the test command.</p>`,
    `<div class="taken" id="taken" hidden><p></p><textarea readonly aria-label="Text to copy"></textarea></div></aside>`,
    `</div>`,
    `<dialog class="inputs"><form method="dialog">`,
    `<h2></h2>`,
    `<div class="fields"></div>`,
    `<p class="error"></p>`,
    `<p><button value="run">Go</button> <button value="cancel" formnovalidate>Cancel</button></p>`,
    `</form></dialog>`,
    `<dialog class="zoom"><img alt=""></dialog>`,
    `<script>${ZOOM_SCRIPT}</script>`,
    `<script>${SCRIPT}</script>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}
