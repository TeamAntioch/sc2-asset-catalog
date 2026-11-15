# @team-antioch/sc2-asset-catalog

StarCraft II doodads described in words (look, kind, size, role, story, biome), what mappers have used them as (Doodad Uses), a keyword and facet search over them, listening notes for the game's music and their search, and extractors that build the game's own fields (names, packages, categories, tilesets, variations, gallery pictures) from SC2Mapster's SC2GameData into your cache folder. No game data ships in this package.

```sh
npx @team-antioch/sc2-asset-catalog extract
```

The music's extracted fields (every id a map can play music with, its files, the dependency it needs and where Blizzard's scripts use it) are built the same way, from a mirror of the game's data at a pinned commit (about 900 small files, a quarter of a minute):

```sh
npx @team-antioch/sc2-asset-catalog extract-music
```

On Windows, type `npx.cmd` in place of `npx`: PowerShell's default policy refuses `npx`.

```js
import { readStockDoodadSources, searchDoodads } from "@team-antioch/sc2-asset-catalog";

const { results } = searchDoodads({ words: ["crate"], limit: 10 }, readStockDoodadSources());
```

```js
import { readMusicCatalog, searchMusic } from "@team-antioch/sc2-asset-catalog";

// After `extract-music`: the extracted ids joined to the listening notes in data/music-notes.json.
const catalog = readMusicCatalog();
const { entry } = searchMusic(catalog, { words: "tense build under an alien approach", energy: [2, 4], minSeconds: 40, limit: 5 })[0]!;
```

The listening notes (`data/music-notes.json`, CC BY 4.0) are what we wrote and measured of each music file, keyed by file base name: Gemini's description, mood, tension, valence, sections and uses, and our length, loudness and tempo. The audio itself is Blizzard's and never ships.

`sc2-asset-catalog setup-renderer` builds the WhiteoutFlakes model viewer, and `sc2-asset-catalog render` then renders reference sheets with it (optional; Apple silicon macOS with StarCraft II, Xcode and Homebrew). `--renderer <module>` renders with a model renderer of your own instead. The WhiteoutFlakes notice is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The [Doodad Finder](https://www.npmjs.com/package/@team-antioch/sc2-doodad-finder) is the page built on it. More: the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#readme).

Not affiliated with or endorsed by Blizzard Entertainment. The code is under the MIT License (LICENSE). The descriptions, Doodad Uses and listening notes in `data/` are under CC BY 4.0 (LICENSE-DATA).
