// A set's card on the Finder's page: its first picture large, the rest and their frames filmed in
// game in a strip below (a click swaps one into the large place), then its name, kind, source, size,
// camera count, the look, its facets and what it could stand in for. A card is plain markup the
// page's script reads; the level is filled in on the page when the ranker answers. Pictures are
// loaded by their address: the gallery's, or the page's own /pictures route for a layer's folder.

import { escapeHtml } from "@team-antioch/sc2-asset-catalog/catalog/doodad-card-html.js";

import type { SetCard, SetCardPicture } from "./cards.ts";

export { escapeHtml };

/** A set's page on this Finder. */
export const setPageHref = (id: string): string => `/set/${encodeURIComponent(id)}`;

/** A set's size and camera count, as its card says them. */
export function sizeLine(card: SetCard): string {
  const [x, y, z] = card.look.size.map(Math.round);
  return `${x} × ${y} cells, ${z} high · ${card.look.cameras} camera${card.look.cameras === 1 ? "" : "s"}`;
}

/** The pictures a card shows: its chosen ones, else its plan and overview; then each one's frame filmed in game. */
export function cardPictures(card: SetCard): { readonly url: string; readonly thumbnail: string; readonly shows: string }[] {
  const chosen: readonly SetCardPicture[] = card.pictures.length ? card.pictures : card.views;
  return [...chosen.map(({ url, thumbnail, shows }) => ({ url, thumbnail, shows })), ...chosen.flatMap(({ inGame, shows }) => (inGame ? [{ ...inGame, shows: `in game: ${shows}` }] : []))];
}

/** A card's markup, with its tick box and an empty level. */
export function cardHtml(card: SetCard): string {
  const { look } = card;
  const [first, ...rest] = cardPictures(card);
  const href = setPageHref(card.id);
  const image = (picture: { url: string; thumbnail: string; shows: string }, large: boolean) =>
    `<img loading="lazy" src="${escapeHtml(large ? picture.url : picture.thumbnail)}" data-large="${escapeHtml(picture.url)}" alt="${escapeHtml(picture.shows)}" title="${escapeHtml(picture.shows)}">`;
  return [
    first ? `<a class="first" href="${href}" target="_blank" rel="noopener">${image(first, true)}</a>` : "",
    rest.length ? `<div class="strip">${rest.map((picture) => image(picture, false)).join("")}</div>` : "",
    `<div class="body">`,
    `<header><label><input type="checkbox" class="tick" aria-label="Tick ${escapeHtml(card.id)}"> <span class="name">${escapeHtml(card.name)}</span></label> <a class="open" href="${href}" target="_blank" rel="noopener">its page</a></header>`,
    `<p class="facts"><span class="level"></span><span class="badge kind">${escapeHtml(look.kind)}</span><span>${escapeHtml(card.source)}</span><span>${escapeHtml(sizeLine(card))}</span>${look.confidence === "high" ? "" : `<span class="badge quiet">look: ${escapeHtml(look.confidence)} confidence</span>`}</p>`,
    `<p class="look">${escapeHtml(look.look)}</p>`,
    `<p class="facets">${look.facets.map((facet) => `<span>${escapeHtml(facet)}</span>`).join("")}</p>`,
    look.standsInFor.length ? `<p class="uses">Could stand in for: ${escapeHtml(look.standsInFor.join("; "))}</p>` : "",
    `</div>`,
  ].join("");
}
