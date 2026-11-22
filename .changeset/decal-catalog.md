---
"@team-antioch/sc2-asset-catalog": minor
---

The decal catalog: `data/decal-descriptions.json` says what every variation of every decal doodad shows (its look, glyphs and the text it reads, shape, whether it tiles and its use), with `readDecalCatalog`, `findDecalVariations`, `isScatterable` and `formatDecalVariations` to search it. The new `extract-decals <folder>` command reads each variation's texture and box in cells from the decals' model files, extracted from your own install with cascx, into the cache. With ImageMagick it also builds a picture of each variation and a numbered sheet of each decal doodad.
