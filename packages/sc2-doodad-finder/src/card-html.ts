// A candidate's card on the Finder's page: its sheet or gallery picture (zoomable), its
// name, id and look, the ranker's level once it has one, and its dependency badge: "needs Void
// (Campaign)", or with a choice from the Finder's badges option, its own text ("in this map")
// for a card the choice provides. The picture and the escaping are the catalog's doodad-card-html.ts. A sheet is served by the Finder's process, since a page served over
// HTTP can't load a file.

import { dependencyName, escapeHtml, pictureHtml } from "@team-antioch/sc2-asset-catalog/catalog/doodad-card-html.js";
import type { DoodadPicture } from "@team-antioch/sc2-asset-catalog/catalog/doodad-search.js";

import type { CandidateCard } from "./cards.ts";
import { LEVELS } from "./wording.ts";

/** Where the process serves a doodad's sheet. */
export const sheetUrl = (id: string): string => `/sheet/${encodeURIComponent(id)}`;

/** A level's short name: the four levels' words before the colon. */
export const levelName = (level: number): string => {
  const words = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))]!;
  return words.slice(0, words.indexOf(":")).toLowerCase();
};

/** The dependency badge: with a choice, `provided`'s text for a card it provides; else what the card needs, if anything. */
export function badge(card: CandidateCard, provided?: string): { readonly text: string; readonly provided: boolean } | undefined {
  if (provided !== undefined && card.provided) return { text: provided, provided: true };
  if (card.dependency !== undefined) return { text: `needs ${dependencyName(card.dependency)}`, provided: false };
  return undefined;
}

/** A card's markup, with its tick box; the level is filled in on the page when the ranker answers. */
export function cardHtml(card: CandidateCard, picture: DoodadPicture, provided?: string): string {
  const { id, name } = card;
  const look = card.entry.description?.look;
  const needs = badge(card, provided);
  return [
    `<header><label><input type="checkbox" class="tick" aria-label="Tick ${escapeHtml(name)}"> <span class="name">${escapeHtml(name)}</span></label> <code>${escapeHtml(id)}</code></header>`,
    pictureHtml(picture, name, picture.kind === "image", () => sheetUrl(id)),
    `<p class="look">${look ? escapeHtml(look) : "no description"}${card.pending ? " (description pending)" : ""}</p>`,
    `<p class="facts"><span class="level"></span>${needs ? `<span class="badge${needs.provided ? " provided" : ""}">${escapeHtml(needs.text)}</span>` : ""}</p>`,
  ].join("");
}
