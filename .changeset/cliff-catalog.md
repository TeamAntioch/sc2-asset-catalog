---
"@team-antioch/sc2-asset-catalog": minor
---

Cliff sets join the catalog. `data/cliff-descriptions.json` describes 142 cliff sets (look, kind, tone and the ground each pairs with), and the new `extract-cliffs` command builds each tileset's cliff sets and each set's gallery picture from SC2GameData into the cache. `readCliffCatalog`, `getCliffSet`, `searchCliffSets`, `tilesetCliffSets`, `cliffSetKind`, `cliffSetNaming` and `cliffPictureUrl` read, search and link them. `galleryFileNames` takes a `folder` to list another of the gallery's folders.
