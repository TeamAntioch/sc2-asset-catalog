# Contributing

The catalog gets better one description and one Doodad Use at a time. Both live in [`packages/sc2-asset-catalog/data/`](packages/sc2-asset-catalog/data) and are published under [CC BY 4.0](LICENSE-DATA): by opening a pull request you agree to license what you add under it.

## The one rule

Descriptions and Doodad Uses are about the doodad, in general words a mapper would use. **They never name a campaign, a map, a mission, a character or a story**, yours or anyone's. Write "drop hatch at the edge of a raised floor", not "the hatch where the hero escapes in my third mission". The same goes for `from` and for pull request titles that end up in the history.

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

## Checking your change

```sh
npm install
npm test
```

The tests check every description and every uses file against the schema above, their order and layout, and that each uses file is for a described doodad. CI runs the same checks on your pull request.

## Code

Code changes are welcome too. `npm run lint` and `npm test` must pass, and new behaviour comes with a test. The tests never call Jev or the network: they use fakes for the game data, the embeddings model and the ranker. Add a changeset (`npx changeset`) to say what changed for the packages' users. Why things are as they are: [docs/adr/](docs/adr/).
