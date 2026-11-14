// Checks that no shipped listening note names a term you keep out of the public repo: a
// campaign's missions, characters or places. The names themselves aren't in this repo; put them
// in a file of your own, one a line (blank lines and `#` comments are skipped), and point
// MUSIC_NOTES_DENYLIST at it. Without the variable the check does nothing. Needs a build first.
//
//   MUSIC_NOTES_DENYLIST=~/my-names.txt node scripts/check-music-notes.mjs [notes.json]

import { readFileSync } from "node:fs";

import { MUSIC_NOTES_PATH } from "../packages/sc2-asset-catalog/dist/catalog/catalog-dirs.js";
import { findDeniedNames, parseDenylist } from "../packages/sc2-asset-catalog/dist/catalog/music-notes.js";

const list = process.env.MUSIC_NOTES_DENYLIST;
if (!list) {
  console.log("MUSIC_NOTES_DENYLIST isn't set: no names to check for.");
  process.exit(0);
}
const terms = parseDenylist(readFileSync(list, "utf8"));
const file = process.argv[2] ?? MUSIC_NOTES_PATH;
const { notes } = JSON.parse(readFileSync(file, "utf8"));
const found = findDeniedNames(notes, terms);
if (found.length) {
  for (const { note, term } of found) console.error(`${note}: names "${term}"`);
  console.error(`${found.length} notes name a denied term.`);
  process.exit(1);
}
console.log(`${Object.keys(notes).length} notes checked against ${terms.length} terms: none named.`);
