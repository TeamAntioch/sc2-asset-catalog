---
"@team-antioch/sc2-music-finder": patch
"@team-antioch/sc2-asset-catalog": patch
---

Fix what review found in the Music Finder. An aborted range request no longer leaks a file descriptor (the audio route pipes with `pipeline`); a `Range` header that is invalid, several ranges or another unit is ignored and the whole file sent, with a 416 only for a well-formed range the file can't meet; a section time of `h:mm:ss` or none no longer seeks to NaN; `--port ''` and `--budget ''` are refused; a file still loading no longer starts at the position of the one chosen before it; a half-typed filter isn't overwritten by a state event, and a range typed 4-2 is sent as 2-4. The catalog's `dependencyName` now lives in `catalog/doodad-dependencies.js` (still re-exported from `doodad-card-html.js`); the four packages release together, so the Music Finder's pin of the catalog has it.
