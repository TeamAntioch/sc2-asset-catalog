# @team-antioch/sc2-hots-effects

Heroes of the Storm's effect models, described in words for StarCraft II map makers: what each one looks like, keyed by the model's path.

`data/hots-effect-looks.json` holds a look for 2,672 of the default skins' effect models (the `.m3` files under `Assets/Effects` in Heroes of the Storm's data whose names carry `_Base`). Each look has the same fields as the catalog's StarCraft II effect looks (`@team-antioch/sc2-asset-catalog`, `data/effect-looks.json`): its kind, a look in one to three sentences, its colours, its size next to a Marine, whether it follows a moving host, whether anything lingers after it is destroyed, search facets, what it suits, how confident the look is and what was wrong with its frames.

```js
import { readHotsEffectLooks } from "@team-antioch/sc2-hots-effects";

const looks = readHotsEffectLooks(); // Map of model path -> look
for (const [file, look] of looks) if (look.kind === "beam" && look.colors.includes("green")) console.log(file, look.look);
```

- `readHotsEffectLooks(file?)` reads the shipped file (or another), and `parseHotsEffectLooks(text, shown)` checks a file's text. Both use the catalog's effect look schema, so a look here is an `EffectLook` there.
- `HOTS_EFFECT_LOOKS_PATH` is the shipped file's path. The kinds, sizes and other values are re-exported from the catalog (`EFFECT_KINDS`, `EFFECT_SIZES`, `EFFECT_MOVING`, `EFFECT_AFTER_DESTROY`, `EFFECT_LOOK_FIELDS`).

No finder searches these yet.

## How the looks were made

As the StarCraft II effect looks were (docs/adr/0007):

1. **Filmed.** Each model was loaded into StarCraft II and played by sc2-adjutant's effect tour, attached to a Marine on plain dark ground. The tour recorded the game window and took stills part way through its Birth, Stand and Death, after the Marine slid sideways, and half a second after the effect was destroyed outright.
2. **Described.** One contact sheet per effect (the fullest frame whole, the recording's frames where most changed and the stills) went to an agent, 25 effects to an agent, with a fixed brief. The agent wrote what it saw, never a hero's, ability's, place's or game's name, even where the path has one.

So a look says how the effect draws **in StarCraft II**. These models were made for Heroes of the Storm's engine, and 89 of them draw wrongly in StarCraft II (black or white squares, a flat card, a mesh without its texture); their `problems` say so. 340 showed nothing in any frame: their kind is `nothing`, and their look is a guess from the path, at low confidence.

Two effects have no look, because they were never filmed: `Storm_FX_MalGanis_Base_Death` crashes the game, and `Storm_Effect_Arthas_Base_FrostStrike_Impact` has no footage.

Kinds: 842 burst, 422 aura, 410 ground, 340 nothing, 226 projectile, 178 object, 134 glow, 84 beam, 36 trail. Confidence: 1,052 high, 1,002 medium, 618 low.

## What ships

Only our words, keyed by each model's path. Nothing read from the models (their animations, emitters, textures, bounds) and no pictures, frames or footage ship here, and none is linked. The paths are Heroes of the Storm's file names, so they name its heroes and battlegrounds; the words never do.

A look can be wrong: see CONTRIBUTING.md, "Fixing a Heroes of the Storm effect look".

Heroes of the Storm, StarCraft II and their assets are Blizzard Entertainment's. This project is not affiliated with or endorsed by Blizzard Entertainment. The code is under the MIT License (LICENSE). The looks in `data/` are under CC BY 4.0 (LICENSE-DATA): attribute as "HotS effect looks from sc2-asset-catalog, CC BY 4.0".
