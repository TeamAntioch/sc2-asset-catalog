# Contributing

The catalog gets better one description and one Doodad Use at a time, and the music one listening note at a time. They live in [`packages/sc2-asset-catalog/data/`](packages/sc2-asset-catalog/data) and are published under [CC BY 4.0](LICENSE-DATA): by opening a pull request you agree to license what you add under it.

## The one rule

Descriptions, Doodad Uses and music notes are about the doodad or the track, in general words a mapper would use. **They never name a campaign, a map, a mission, a character or a story**, yours or anyone's. Write "drop hatch at the edge of a raised floor", not "the hatch where the hero escapes in my third mission". The same goes for `from` and for pull request titles that end up in the history.

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

## Fixing or adding a music note

`packages/sc2-asset-catalog/data/music-notes.json` holds our listening notes, one a line, keyed by a music file's base name (no folder, no extension, any case): `"P07CinePart02": {…}`. Gemini wrote the words from the audio, with no file name or context, so it is sometimes wrong: it takes a sound effect for music, or a cue for something it isn't. If your ears say a note is wrong, edit it directly and open a pull request, saying what you heard. A note's fields and what they hold are in `packages/sc2-asset-catalog/src/catalog/music-notes.ts` (the tests refuse any other field, a repeated key or keys out of order). Edit only the words and ratings: `duration_s`, `lufs`, `lra`, `onset_rate`, `peak_at` and the other measurements are readings of the audio, and a reading changes only when the file does.

For a file a game patch added, which has an id but no note, make one from your own copy of the audio: [`scripts/music-notes/`](scripts/music-notes) measures it, has Gemini listen to it and adds the note. Sending the audio to Gemini needs your own billed API key, and the guide says why.

The one rule applies here as everywhere: a note describes what the music sounds like and what it suits, in general words. It never names a campaign, a map, a mission, a character or a story. "Tense build under a villain's reveal" is fine; the villain's name isn't. The tests can't know your campaign's names, so check your own: put them, one a line, in a file kept outside the repo and run `MUSIC_NOTES_DENYLIST=<that file> npm run check-music-notes` (after `npm run build`), which fails if any note names one as a whole word, in any case. With the variable set, `npm test` checks it too; without it, both do nothing.

Music Uses (what a track has worked as, as Doodad Uses are for doodads) aren't taken yet.

## Checking your change

```sh
npm install
npm test
```

The tests check every description and every uses file against the schema above, their order and layout, that each uses file is for a described doodad, and that every music note has the fields of a note and no others. CI runs the same checks on your pull request.

## Code

Code changes are welcome too. `npm run lint` and `npm test` must pass, and new behaviour comes with a test. The tests never call Jev or the network: they use fakes for the game data, the embeddings model and the ranker. Add a changeset (`npx changeset`) to say what changed for the packages' users. Why things are as they are: [docs/adr/](docs/adr/).
