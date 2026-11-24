# Contributing

The catalog gets better one description and one Doodad Use at a time, and the music one listening note at a time. They live in [`packages/sc2-asset-catalog/data/`](packages/sc2-asset-catalog/data) and are published under [CC BY 4.0](LICENSE-DATA): by opening a pull request you agree to license what you add under it.

## The one rule

Descriptions, Doodad Uses, decal descriptions and music notes are about the doodad or the track, in general words a mapper would use. **They never name a campaign, a map, a mission, a character or a story**, yours or anyone's. Write "drop hatch at the edge of a raised floor", not "the hatch where the hero escapes in my third mission". The same goes for `from` and for pull request titles that end up in the history.

## Fixing or adding a description

`data/doodad-descriptions.json` maps each doodad id (the Editor's actor id, such as `DOM_Crate`) to its description:

```json
"DOM_Crate": {
  "look": "black Dominion cargo crates, stackable",
  "kind": "built",
  "size": "small",
  "role": "clutter",
  "story": ["military", "terran"],
  "biome": ["any"]
}
```

| Field | What goes in it |
| --- | --- |
| `look` | What you see, in a short phrase: shape, material, colour, condition. Write it from a picture of the doodad: its [gallery picture](https://github.com/TeamAntioch/sc2-mapping-reference/tree/main/public/doodads), a render, or the Editor. If it has variations, say how they differ. |
| `kind` | `natural`, `built` or `creature`. |
| `size` | `tiny`, `small`, `medium`, `large` or `huge`, next to a Marine. |
| `role` | `cliff`, `structure`, `prop`, `clutter`, `foliage`, `decal` or `effect`. |
| `story` | Settings it suits, lower case, such as `industry`, `military`, `ruins`, `space-station`, `wild`, `zerg`. Use the words already in the file where they fit. |
| `biome` | Biomes it suits, lower case, such as `desert`, `jungle`, `snow`, `urban`, `space`, or `any`. |
| `state` | Optional: the state it's shown in, such as `destroyed` or `abandoned`. |

Nothing else goes in a description. Names, packages, categories and tilesets are the game's, and the extractor fills them in from SC2GameData. Keep the ids in order and the two-space indentation: the tests check both.

A doodad without a description still turns up in searches, by its name and the words of its id, so describing one makes it findable by what it looks like.

## Fixing or adding a cliff set description

`data/cliff-descriptions.json` maps each cliff set id (such as `AgriaCliff0`) to its description, written from its [gallery picture](https://github.com/TeamAntioch/sc2-mapping-reference/tree/main/public/cliffs):

```json
"AgriaCliff0": {
  "look": "grey-brown layered rock, terraced strata, soft rounded lip",
  "kind": "natural",
  "tone": "mid",
  "pairsWith": "dirt, grass, farmland"
}
```

| Field | What goes in it |
| --- | --- |
| `look` | What the walls look like, in a short phrase: material, colour, the lip at the top. |
| `kind` | `natural` or `built`, as the picture shows. An id ending `Cliff0` is usually natural and `Cliff1` built, but not always, and `kind` says what the picture shows. |
| `tone` | `light`, `mid` or `dark`. |
| `pairsWith` | The ground it sits well beside, a few words separated by commas. |

Nothing else goes in a description: the tilesets and the picture are extracted. Keep the ids in order and the two-space indentation.

## Fixing or adding a terrain texture description

`data/texture-descriptions.json` maps each terrain texture id (such as `AgriaDirt`) to its description, written from its [gallery picture](https://github.com/TeamAntioch/sc2-mapping-reference/tree/main/public/tilesets):

```json
"AgriaDirt": {
  "look": "tan-brown packed dirt, fine even grain",
  "kind": "natural",
  "tone": "mid",
  "suits": ["base", "path"]
}
```

| Field | What goes in it |
| --- | --- |
| `look` | What it looks like, in a short phrase: material, colour, pattern, grain. Judge it from the picture, never from its name. |
| `kind` | `natural` or `built` (paving, plating, grating). |
| `tone` | `light`, `mid` or `dark`. |
| `suits` | The roles it suits in a palette, at least one: `base` (the main ground), `path`, `variety` (patches in the base), `high` or `low` ground, `accent`. |
| `seen` | `false` only when the gallery has no picture of it and it was described from its name. Leave it out otherwise. |
| `pictureUncertain` | `true` only when the gallery picture may not be this texture's. Leave it out otherwise. |

Nothing else goes in a description: the tilesets, file, name and picture are extracted. Keep the ids in order and the two-space indentation.

## Adding a Doodad Use

A Doodad Use says what a doodad has worked as, in a mapper's words. It is often something its name doesn't suggest: a crate that makes a good press head, or a rail that makes a slide. Each doodad's uses are a file of their own, `data/doodad-uses/doodads/<doodad id>.json`, a list of records:

```json
[
  { "use": "square, heavy press head over a conveyor belt", "variation": 1, "scale": 3, "from": "crushing-press search, 2026-11-09" }
]
```

| Field | What goes in it |
| --- | --- |
| `use` | Required. A short, general phrase: what it stood in for. |
| `variation` | Optional. The Editor's variation number that worked (0 for 00). |
| `scale` | Optional. A uniform scale that worked. |
| `from` | Optional. Where it came from and when, in general words: "crushing-press search, 2026-11-09". |

Add to the end of a doodad's list, or start its file if it has none. A use that differs only in case or spacing from one already there is the same use.

## Fixing or adding a decal description

`packages/sc2-asset-catalog/data/decal-descriptions.json` maps each decal doodad's id to its variations, in variation order (the first is the Editor's 00):

```json
"BattleStation_Number_Decals": [
  { "look": "pale stencilled number 0", "shows": ["number"], "glyphs": "number", "text": "0", "shape": "patch", "tiles": false, "use": "label" }
]
```

| Field | What goes in it |
| --- | --- |
| `look` | What the variation shows, in a few words, written from its picture: "yellow-and-black hazard stripe, a quarter curve". |
| `shows` | What it draws, from the list in `src/catalog/decal-catalog.ts`: `stripe`, `curve`, `corner`, `hazard-stripes`, `arrow`, `frame`, `hazard-sign`, `symbol`, `emblem`, `text`, `number`, `ornament`, `glow-line`, `light-strip`. |
| `glyphs` | `none`, `number`, `letter`, `words`, or `script` for alien inscriptions, which read as ornament. |
| `text` | The number, letter or words it reads, as painted. Needed for any glyphs but `none` and `script`. |
| `shape` | `line`, `corner` (a turn or bend in a line) or `patch`. |
| `tiles` | Whether copies laid end to end make a longer run. |
| `use` | `marking` or `ornament`, which can go anywhere, or `label`, `sign` or `emblem`, which go only where they mean something. |

`extract-decals` builds a numbered sheet of each decal doodad's variations to describe them from. The texture and the box in cells are read from the game, so they never go in the file. Keep the ids in order and the two-space indentation, as for the doodad descriptions.

## Fixing or adding a music note

`packages/sc2-asset-catalog/data/music-notes.json` holds our listening notes, one a line, keyed by a music file's base name (no folder, no extension, any case): `"P07CinePart02": {…}`. Gemini wrote the words from the audio, with no file name or context, so it is sometimes wrong: it takes a sound effect for music, or a cue for something it isn't. If your ears say a note is wrong, edit it directly and open a pull request, saying what you heard. A note's fields and what they hold are in `packages/sc2-asset-catalog/src/catalog/music-notes.ts` (the tests refuse any other field, a repeated key or keys out of order). Edit only the words and ratings: `duration_s`, `lufs`, `lra`, `onset_rate`, `peak_at` and the other measurements are readings of the audio, and a reading changes only when the file does.

For a file a game patch added, which has an id but no note, make one from your own copy of the audio: [`scripts/music-notes/`](scripts/music-notes) measures it, has Gemini listen to it and adds the note. Sending the audio to Gemini needs your own billed API key, and the guide says why.

The one rule applies here as everywhere: a note describes what the music sounds like and what it suits, in general words. It never names a campaign, a map, a mission, a character or a story. "Tense build under a villain's reveal" is fine; the villain's name isn't. The tests can't know your campaign's names, so check your own: put them, one a line, in a file kept outside the repo and run `MUSIC_NOTES_DENYLIST=<that file> npm run check-music-notes` (after `npm run build`), which fails if any note names one as a whole word, in any case. With the variable set, `npm test` checks it too; without it, both do nothing.

Music Uses (what a track has worked as, as Doodad Uses are for doodads) aren't taken yet.

## Fixing an effect look

`packages/sc2-asset-catalog/data/effect-looks.json` says what each of the game's effect models looks like, keyed by the model's path (`"Assets/Effects/Protoss/Blink/Blink.m3": {…}`). An agent wrote each look from frames of the effect filmed in the game on a Marine, so it can be wrong: a burst over before any frame caught it, or an effect too small to make out. Check it against the effect's [gallery picture](https://github.com/TeamAntioch/sc2-mapping-reference/tree/main/public/effects) or the effect in the Editor, then edit it directly and open a pull request saying what you saw.

| Field | What goes in it |
| --- | --- |
| `kind` | `burst`, `beam`, `projectile`, `aura`, `ground`, `trail`, `glow`, `object`, or `nothing` when nothing shows. `effect-looks.ts` says what each means. |
| `look` | One to three plain sentences: what it shows, its shape, colours and size, how it moves and how it ends. |
| `colors` | Its main colours, lower case. |
| `size` | `tiny`, `small`, `medium`, `large` or `huge`, next to a Marine. Left out when `kind` is `nothing`. |
| `moving` | What it did while its host slid sideways: `follows`, `stays`, `trails` or `unclear`. |
| `afterDestroy` | What was left half a second after its actor was destroyed: `gone`, `lingers` or `unclear`. |
| `facets` | Short lower-case search words. |
| `suits` | What a mapper could use it for, in general words. |
| `confidence` | `high`, `medium` or `low`. |
| `problems` | What's wrong with its frames, if anything. |

Nothing read from the model goes in a look: its animations, emitters, textures and bounds are the game's. The one rule holds even though many paths name a hero: write "a violet psionic slash", never the hero's name. Keep the paths in order and the two-space indentation.

## Checking your change

```sh
npm install
npm test
```

The tests check every description and every uses file against the schema above, their order and layout, that each uses file is for a described doodad, and that every music note has the fields of a note and no others. CI runs the same checks on your pull request.

## Code

Code changes are welcome too. `npm run lint` and `npm test` must pass, and new behaviour comes with a test. The tests never call Jev or the network: they use fakes for the game data, the embeddings model and the ranker. Add a changeset (`npx changeset`) to say what changed for the packages' users. Why things are as they are: [docs/adr/](docs/adr/).
