# @team-antioch/sc2-asset-catalog

StarCraft II doodads described in words (look, kind, size, role, story, biome), what mappers have used them as (Doodad Uses), a keyword and facet search over them, listening notes for the game's music and their search, the looks of the cinematic sets Blizzard's campaign cutscenes are filmed in, and extractors that build the game's own fields (names, packages, categories, tilesets, variations, gallery pictures) from SC2Mapster's SC2GameData into your cache folder. No game data ships in this package.

```sh
npx @team-antioch/sc2-asset-catalog extract
```

The music's extracted fields (every id a map can play music with, its files, the dependency it needs and where Blizzard's scripts use it) are built the same way, from a mirror of the game's data at a pinned commit (about 900 small files, a quarter of a minute):

```sh
npx @team-antioch/sc2-asset-catalog extract-music
```

The cliff sets' extracted fields (each tileset's cliff sets in order, and each set's gallery picture) come from SC2GameData's TerrainData the same way. `readCliffCatalog()` joins them to our descriptions (`data/cliff-descriptions.json`, CC BY 4.0: each set's look, kind, tone and the ground it pairs with), and `searchCliffSets()` and `tilesetCliffSets()` search and list them:

```sh
npx @team-antioch/sc2-asset-catalog extract-cliffs
```

The terrain textures' extracted fields (each tileset's blend textures in layer order, and each texture's file, name and gallery picture) come from SC2GameData's TerrainData, TerrainTexData and GameStrings the same way. `readTextureCatalog()` joins them to our descriptions (`data/texture-descriptions.json`, CC BY 4.0: each texture's look, kind, tone and the roles it suits), `searchTextures()`, `lookUpTextures()` and `tilesetTextures()` search and list them, and `textureSheetTiles()` and `textureSheetSvg()` draw a labelled sheet of their gallery pictures:

```sh
npx @team-antioch/sc2-asset-catalog extract-textures
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

The decal descriptions (`data/decal-descriptions.json`, CC BY 4.0) say what every variation of every decal doodad shows: its look, its glyphs and the text it reads, its shape, whether it tiles, and whether it can go anywhere or only where it labels something (docs/adr/0006). `findDecalVariations()` filters them:

```js
import { findDecalVariations, formatDecalVariations } from "@team-antioch/sc2-asset-catalog";

// Plain floor lane lines: no numbers, letters or words.
console.log(formatDecalVariations(findDecalVariations({ glyphs: ["none"], use: ["marking"], shows: ["stripe"], tiles: true })));
```

`sc2-asset-catalog extract-decals <folder>` adds each variation's texture and box in cells, read from a folder of the decals' model files and textures that you extracted from your own install with cascx. With ImageMagick, it also builds a picture of each variation and a numbered sheet of each decal doodad in your cache folder. It's optional, and it needs `extract` first.

The set looks (`data/set-looks.json`, CC BY 4.0) are what we wrote and measured of each cinematic set made only from Blizzard's files, keyed by set id: its look, facets, what it could stand in for, its size and camera count, with its name and Cutscene Editor files as keys. `readSetLooks()` (`@team-antioch/sc2-asset-catalog/catalog/set-looks.js`) loads them, and `setPictureUrl()` gives the address of each picture in the sc2-mapping-reference gallery, where they live (docs/adr/0005).

`sc2-asset-catalog setup-renderer` builds the WhiteoutFlakes model viewer, and `sc2-asset-catalog render` then renders reference sheets with it (optional; Apple silicon macOS with StarCraft II, Xcode and Homebrew). `--renderer <module>` renders with a model renderer of your own instead. The WhiteoutFlakes notice is in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

The [Doodad Finder](https://www.npmjs.com/package/@team-antioch/sc2-doodad-finder) is the page built on it. More: the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#readme).

Not affiliated with or endorsed by Blizzard Entertainment. The code is under the MIT License (LICENSE). The descriptions, Doodad Uses, decal descriptions, listening notes and set looks in `data/` are under CC BY 4.0 (LICENSE-DATA).
