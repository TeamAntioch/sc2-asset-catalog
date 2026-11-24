---
"@team-antioch/sc2-asset-catalog": minor
---

Add the effect library: `data/effect-looks.json` describes what each of the game's effect models (the `.m3` files under `Assets/Effects`) looks like, written from frames of it filmed in the game, keyed by the model's path. `catalog/effect-looks.js` reads it (`readEffectLooks`, `parseEffectLooks`) and gives each effect's picture in the sc2-mapping-reference gallery (`effectPictureUrl`).
