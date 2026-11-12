// The doodad cards' shared markup: escaping, a dependency's name, a card's zoomable picture, and the
// light style and zoom script for a page of doodad cards, such as the Doodad Finder's.

import { pathToFileURL } from "node:url";

import { SHEET_BACKGROUND } from "./catalog-sheets.js";
import type { DoodadPicture } from "./doodad-search.js";

/** Text made safe for HTML. */
export const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A dependency's name, as `bnet:Void (Campaign)/0.0/999,file:…` gives it; a note for an unknown one as it is. */
export const dependencyName = (dependency: string): string => /^bnet:([^/]+)\//.exec(dependency)?.[1] ?? dependency;

/**
 * A card's picture, zoomable on a page with ZOOM_SCRIPT: a sheet by its file URL, or by `sheetSrc`
 * on a page served over HTTP, which can't load files; a gallery picture by its URL.
 */
export const pictureHtml = (picture: DoodadPicture, alt: string, oneAngle = picture.kind === "image", sheetSrc?: (path: string) => string): string => {
  if (picture.kind === "none") return `<div class="picture none"></div>`;
  const src = picture.kind === "sheet" ? (sheetSrc ? sheetSrc(picture.path) : pathToFileURL(picture.path).href) : picture.url;
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" class="picture${oneAngle ? " one-angle" : ""}" loading="lazy">`;
};

// The page is light; only the pictures sit on the sheets' mid-grey, so dark and pale models both show.
export const DOODAD_PAGE_STYLE = `
body { background: #f5f5f3; color: #1a1a1a; font: 16px/1.45 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0 auto; max-width: 1400px; padding: 1.5rem 2rem 3rem; }
h1 { margin: 0 0 0.25rem; }
.for { margin: 0 0 1.5rem; color: #555; }
section { margin: 2rem 0; }
h2 { margin: 0 0 0.25rem; border-bottom: 1px solid #d0d0cc; padding-bottom: 0.25rem; }
.reads-as { font-style: italic; margin: 0.25rem 0; }
.searched { color: #666; font-size: 0.9rem; margin: 0.25rem 0 1rem; }
.cards { list-style: none; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
.card { background: #fff; border: 1px solid #e0e0dc; border-radius: 8px; padding: 0.75rem; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); }
.card header { margin-bottom: 0.5rem; }
.rank { font-weight: bold; }
.name { font-weight: bold; }
code { font-size: 0.85rem; background: #efefec; padding: 0 0.25rem; border-radius: 3px; }
.picture { display: block; width: 100%; aspect-ratio: 1; object-fit: contain; background: ${SHEET_BACKGROUND}; border-radius: 4px; }
img.picture { cursor: zoom-in; }
.picture.none { display: flex; align-items: center; justify-content: center; background: #efefec; border: 1px dashed #bbb; box-sizing: border-box; }
.picture.none::after { content: "no picture"; color: #777; }
.facts { font-size: 0.9rem; color: #555; margin: 0.5rem 0 0.25rem; }
.note { margin: 0.25rem 0; }
.variations { margin: 0.25rem 0; padding-left: 1.25rem; font-size: 0.9rem; }
.missing .facts { font-weight: bold; }
details { margin-top: 0.5rem; }
summary { cursor: pointer; font-weight: bold; }
.next { margin-top: 2.5rem; border-top: 1px solid #d0d0cc; padding-top: 1rem; }
dialog.zoom { padding: 0; border: none; background: ${SHEET_BACKGROUND}; border-radius: 6px; cursor: zoom-out; }
dialog.zoom::backdrop { background: rgba(0, 0, 0, 0.75); }
dialog.zoom img { display: block; width: min(92vw, 92vh); height: min(92vw, 92vh); object-fit: contain; }
`;

// Clicking a picture opens it large; a click anywhere or Escape closes it.
export const ZOOM_SCRIPT = `
const zoom = document.querySelector("dialog.zoom");
const zoomed = zoom.querySelector("img");
document.addEventListener("click", (event) => {
  const picture = event.target.closest("img.picture");
  if (picture) { zoomed.src = picture.src; zoomed.alt = picture.alt; zoom.showModal(); }
  else if (zoom.open) zoom.close();
});
`;
