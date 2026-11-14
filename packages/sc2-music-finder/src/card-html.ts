// A candidate's card on the Finder's page: its id and kind, its dependency badge ("needs Void
// (Campaign)"), its length, ratings and description, its moods, each file it plays with a play
// button, an in-point and its timestamped sections, and where Blizzard used it. A card is plain
// markup with data attributes the page's script reads: it plays from a section's start, and the
// mapper's in-point goes into what the tray copies.

import { escapeHtml } from "@team-antioch/sc2-asset-catalog/catalog/doodad-card-html.js";
import { dependencyName } from "@team-antioch/sc2-asset-catalog/catalog/doodad-dependencies.js";

import { type MusicCard, type MusicPiece, mmss } from "./cards.ts";
import { levelName as levelNameOf } from "./wording.ts";

export const levelName = levelNameOf;

export { escapeHtml };

/** What a card can say about hearing a file: no Audio folder given, the file isn't in it, or it is. */
export type AudioState = "none" | "missing" | "ready";

/** A section's start in seconds: `0:38`, `00:38` or `1:02:03`; 0 when it isn't a clock time, so a button never seeks to NaN. */
export const sectionSeconds = (start: string): number => {
  const parts = start.trim().split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((part) => !/^\d+(?:\.\d+)?$/.test(part))) return 0;
  return parts.reduce((seconds, part) => seconds * 60 + Number(part), 0);
};

/** The badges a card wears: what a map needs to call it, and why it is shown when it normally wouldn't be. */
export function badges(card: MusicCard): { readonly text: string; readonly warn: boolean }[] {
  const { entry } = card;
  return [
    ...(entry.dependency !== undefined ? [{ text: `needs ${dependencyName(entry.dependency)}`, warn: false }] : []),
    ...(entry.mapLocal !== undefined ? [{ text: `only inside ${entry.mapLocal}`, warn: true }] : []),
    ...(entry.silent ? [{ text: "silent", warn: true }] : entry.empty ? [{ text: "plays no file", warn: true }] : entry.unplayable ? [{ text: "sound effect", warn: true }] : []),
  ];
}

function pieceHtml(piece: MusicPiece, audio: AudioState): string {
  const { note } = piece;
  const length = note ? ` <span class="length">${mmss(note.duration_s)}</span>` : "";
  const hear =
    audio === "ready"
      ? `<button type="button" class="play" data-key="${escapeHtml(piece.key)}" data-from="0">Play</button>`
      : audio === "missing"
        ? `<span class="nofile">not in your Audio folder</span>`
        : `<span class="nofile">no Audio folder: see the README to hear it</span>`;
  const sections =
    note && note.sections.length
      ? `<details><summary>${note.sections.length} section${note.sections.length === 1 ? "" : "s"}</summary><ol class="sections">${note.sections
          .map((section) => {
            const at = sectionSeconds(section.start);
            const start = audio === "ready" ? `<button type="button" class="play" data-key="${escapeHtml(piece.key)}" data-from="${at}">${escapeHtml(mmss(at))}</button>` : `<span class="at">${escapeHtml(mmss(at))}</span>`;
            return `<li>${start} ${escapeHtml(section.description)}</li>`;
          })
          .join("")}</ol></details>`
      : "";
  return `<div class="piece"><code>${escapeHtml(piece.name)}</code>${length} ${hear}${note ? "" : ` <span class="nofile">no listening notes</span>`}${sections}</div>`;
}

/** A card's markup, with its tick box and in-point; the level is filled in on the page when the ranker answers. */
export function cardHtml(card: MusicCard, audio: (key: string) => AudioState): string {
  const { entry, id, name } = card;
  const notes = card.pieces.flatMap(({ note }) => (note ? [note] : []));
  const description = [...new Set(notes.map((note) => note.description))].join(" ");
  const moods = [...new Set(notes.flatMap((note) => note.mood))];
  const used = entry.usedIn.map((place) => `${place.file.split("/").at(-1)}:${place.line}${place.func ? ` (${place.func})` : ""}`);
  const ratings = [entry.energy !== undefined ? `energy ${entry.energy}` : "", entry.tension !== undefined ? `tension ${entry.tension}` : "", entry.valence !== undefined ? `valence ${entry.valence}` : ""].filter(Boolean).join(" · ");
  const length = entry.seconds ? (entry.seconds.min === entry.seconds.max ? mmss(entry.seconds.min) : `${mmss(entry.seconds.min)}-${mmss(entry.seconds.max)}`) : "";
  return [
    `<header><label><input type="checkbox" class="tick" aria-label="Tick ${escapeHtml(id)}"> <span class="name">${escapeHtml(name)}</span></label> <span class="kind">${escapeHtml(entry.kind)}${id !== name ? " (same id as a Soundtrack)" : ""}</span></header>`,
    `<p class="facts"><span class="level"></span>${badges(card)
      .map(({ text, warn }) => `<span class="badge${warn ? " warn" : ""}">${escapeHtml(text)}</span>`)
      .join("")}${length ? `<span class="length">${escapeHtml(length)}</span>` : ""}${ratings ? `<span class="ratings">${escapeHtml(ratings)}</span>` : ""}</p>`,
    `<p class="desc">${description ? escapeHtml(description) : "no listening notes"}</p>`,
    moods.length ? `<p class="moods">${moods.map((mood) => `<span class="mood">${escapeHtml(mood)}</span>`).join(" ")}</p>` : "",
    card.pieces.map((piece) => pieceHtml(piece, audio(piece.key))).join(""),
    `<p class="inpoint"><label>In-point <input class="from" size="5" placeholder="0:00" aria-label="In-point for ${escapeHtml(id)}"></label> <button type="button" class="here" title="Use the player's position as the in-point">Use position</button></p>`,
    used.length ? `<p class="used">Blizzard used it in: ${escapeHtml(used.slice(0, 3).join(", "))}${entry.usedCount > 3 ? ` and ${entry.usedCount - 3} more` : ""}</p>` : `<p class="used">Not named in Blizzard's scripts or cutscenes.</p>`,
    ...(card.layer?.facts ?? []).map(({ label, value }) => `<p class="layer"><span class="label">${escapeHtml(label)}</span> ${escapeHtml(value)}</p>`),
  ].join("");
}
