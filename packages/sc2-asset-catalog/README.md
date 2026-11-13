# @team-antioch/sc2-asset-catalog

StarCraft II doodads described in words (look, kind, size, role, story, biome), what mappers have used them as (Doodad Uses), a keyword and facet search over them, and an extractor that builds the game's own fields (names, packages, categories, tilesets, variations, gallery pictures) from SC2Mapster's SC2GameData into your cache folder. No game data ships in this package.

```sh
npx @team-antioch/sc2-asset-catalog extract
```

On Windows, type `npx.cmd` in place of `npx`: PowerShell's default policy refuses `npx`.

```js
import { readStockDoodadSources, searchDoodads } from "@team-antioch/sc2-asset-catalog";

const { results } = searchDoodads({ words: ["crate"], limit: 10 }, readStockDoodadSources());
```

`sc2-asset-catalog setup-renderer` builds the WhiteoutFlakes model viewer, and `sc2-asset-catalog render` then renders reference sheets with it (optional; Apple silicon macOS with StarCraft II, Xcode and Homebrew). `--renderer <module>` renders with a model renderer of your own instead. The WhiteoutFlakes notice is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The [Doodad Finder](https://www.npmjs.com/package/@team-antioch/sc2-doodad-finder) is the page built on it. More: the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#readme).

Not affiliated with or endorsed by Blizzard Entertainment. The code is under the MIT License (LICENSE). The descriptions and Doodad Uses in `data/` are under CC BY 4.0 (LICENSE-DATA).
