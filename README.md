# sc2-asset-catalog

Find StarCraft II doodads by asking for them in plain words.

The **Doodad Finder** is a small local web page for StarCraft II mappers. Type what you need ("a heavy press head over a conveyor", "snowy pine trees", "road barricade") and cards of matching doodads appear as you type, each with its gallery picture, its id, what it looks like and which dependency your map needs for it. Tick the ones you like, then copy their ids into the Editor.

It's built on **sc2-asset-catalog**, a catalog of more than 2,400 doodads described in words: what each one looks like, its kind, size, role, setting and biome, and what mappers have used it as (its **Doodad Uses**).

This project is not affiliated with or endorsed by Blizzard Entertainment. StarCraft II and its assets are Blizzard's. No game data ships here: on its first start the Finder builds the game's own fields into your cache folder from [SC2Mapster's SC2GameData](https://github.com/SC2Mapster/SC2GameData), and cards link pictures from the [sc2-mapping-reference](https://github.com/TeamAntioch/sc2-mapping-reference) gallery by URL.

Two npm packages:

| Package | What it is |
| --- | --- |
| [`@team-antioch/sc2-doodad-finder`](packages/sc2-doodad-finder) | The Finder: the page, the Jev ranker and the `sc2-doodad-finder` command. |
| [`@team-antioch/sc2-asset-catalog`](packages/sc2-asset-catalog) | The library: the descriptions and Doodad Uses, the keyword search, and the extractor (`sc2-asset-catalog extract`). |

## Install and start

You need [Node.js](https://nodejs.org/) 22.18 or later, on Windows, macOS or Linux. No StarCraft II install is needed.

On Windows, you also need the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist) for the embeddings model. Many machines already have it; a fresh Windows doesn't, and Node doesn't install it. Without it the Finder stops on its first start and says where to get it. You can also install it with `winget install Microsoft.VCRedist.2015+.x64` (or `.arm64` on an ARM PC). Open a new terminal after installing Node, so it finds `npx`.

Start it without installing anything:

```sh
npx @team-antioch/sc2-doodad-finder --open
```

Or install it once and start it by name:

```sh
npm install -g @team-antioch/sc2-doodad-finder
sc2-doodad-finder --open
```

The page is at `http://127.0.0.1:4634/`. The Finder listens on your own machine only. Ctrl-C stops it. To have Jev rank the cards, run `npx @team-antioch/sc2-doodad-finder login` once ([Ranking with Jev](#ranking-with-jev)).

The first start takes a minute or so. It downloads the game's doodad data from SC2GameData (about 22 MB, read and then thrown away) and builds the catalog's names, packages, categories and gallery picture names into your cache folder. It also downloads the embeddings model (gte-small, about 34 MB) and embeds every card. Later starts take a few seconds and need no connection, except to Jev and for the pictures.

On Windows, PowerShell's default policy refuses to run `npx`, so type `npx.cmd` instead, as in `npx.cmd @team-antioch/sc2-doodad-finder --open`. It works in PowerShell and cmd.exe alike, and the Finder's own hints say `npx.cmd` there. When you stop it with Ctrl-C, Windows asks "Terminate batch job (Y/N)?" after the Finder has stopped; answer Y.

Some npm versions warn that install scripts were blocked (for `onnxruntime-node`, `protobufjs` and others). You can ignore it: the Finder doesn't need those scripts, and it starts and searches with them blocked.

Options:

- `--port <n>`: another port (`0` for any free one).
- `--budget <dollars>`: the session's spend cap on Jev, $1.00 by default (see [Jev](#ranking-with-jev)).
- `--tick-log <folder>`: logs every tick to `<folder>/ticks.jsonl` (see [Tests](#tests-and-the-test-asks)).
- `--open`: opens the page in your browser.

`npx @team-antioch/sc2-doodad-finder extract` (`sc2-doodad-finder extract` where it is installed) builds the catalog's extracted fields again, for instance after a game patch, and starts nothing. It is the catalog's own `sc2-asset-catalog extract`.

The extraction lists the gallery's pictures through GitHub's API, which allows 60 calls an hour from one address without a token. Past that, or with `GITHUB_TOKEN` unset on a shared address, it lists them with `git` instead (a shallow clone with no pictures in it, a second or so). Without either, set `GITHUB_TOKEN` or install git.

### The cache folder

The extracted fields, the model's weights, the card vectors, Jev's payload logs and the page's settings go in your platform's cache folder:

| Platform | Folder |
| --- | --- |
| Windows | `%LOCALAPPDATA%\sc2-asset-catalog\` |
| macOS | `~/Library/Caches/sc2-asset-catalog/` |
| Linux and others | `$XDG_CACHE_HOME/sc2-asset-catalog/`, else `~/.cache/sc2-asset-catalog/` |

`SC2_ASSET_CATALOG_CACHE` puts it somewhere else, and `SC2_ASSET_CATALOG_MODEL_CACHE` moves only the model's weights. Everything in the folder is a copy of something else, so it's safe to delete. The next start builds it again.

## Using the page

1. **Ask.** Type what you're looking for. Cards come from the narrowing as you type. On Enter, or after the pause set on the page, Jev puts them in order.
2. **Tick** a card to put it in the tray. The facets of the tray's cards become tags. Pin a tag to keep only cards that have it, or drop it.
3. **Copy.** Each card in the tray has **Copy**, for its id and the dependency it needs, such as `FoundryStamperHead (needs Void (Campaign))`. The tray's **Copy all** gives every id, one a line, then each dependency your map needs, once. If the browser won't copy, the page shows the text selected so you can copy it by hand.

A card's badge says which map dependency brings the doodad in. Doodads from the base mods need nothing beyond the default `Void (Mod)`. Campaign doodads need `Void (Campaign)` or `Void Story (Campaign)`, added in the Editor under File, Dependencies.

## Ranking with Jev

The Finder narrows each ask on your machine, with a keyword search and the local embeddings model, to about 200 candidates. Then Jev, [TypeSafe AI](https://typesafe.ai)'s System One model, grades each candidate against your ask: from "doesn't fit" to "reads as exactly this". Jev is optional. Without it the cards come in the narrowing's order, which is often good enough.

**Getting a key.** Jev needs a TypeSafe API key. Get one from [TypeSafe AI](https://typesafe.ai) ([docs](https://docs.typesafe.ai/)).

**Saving it.** Run:

```sh
npx @team-antioch/sc2-doodad-finder login
```

Paste the key and press Enter. Nothing shows as you paste. `login` checks the key with TypeSafe by listing your account's models, which asks Jev nothing and uses no tokens, then saves it and says whether TypeSafe accepted it. If TypeSafe refuses the key, nothing is saved. If TypeSafe can't be reached, the key is saved unchecked. From then on the Finder ranks with Jev each time it starts. Only the Finder's process reads the key, and the page never sees it.

The key is kept in `typesafe-key` in your config folder (on macOS and Linux, a file only you can read):

- Windows: `%APPDATA%\sc2-asset-catalog\`
- macOS and Linux: `$XDG_CONFIG_HOME/sc2-asset-catalog/`, else `~/.config/sc2-asset-catalog/`

`SC2_ASSET_CATALOG_CONFIG` puts the folder somewhere else. `npx @team-antioch/sc2-doodad-finder logout` deletes the key file.

**Or set `TYPESAFE_API_KEY`**, for CI or if you'd rather keep keys in your shell. The variable wins over the saved key while it is set.

```powershell
$env:TYPESAFE_API_KEY = "your-key"
```

```sh
export TYPESAFE_API_KEY="your-key"
```

**What each ask sends.** Each ranked ask sends Jev the ask, the tags you've picked and the narrowed cards' text: each doodad's name, id words, look, facets and Doodad Uses. It sends no pictures and no files. Every call's exact payload and answer is logged in the cache folder's `ranker-payloads/`, so you can see what was sent.

**What it costs.** Jev charges for input tokens only, at $0.042 per million. A ranked ask of about 200 cards is about 30,000 tokens, measured at about $0.0013 an ask, so $1.00 covers roughly 750 asks. The page shows the estimated spend this session.

**The spend cap.** Once the session's estimated spend reaches the cap ($1.00 by default), the Finder stops calling Jev, shows the narrowing's order and says why on the page. A call already sent may take the spend a little past the cap. Set another cap with `--budget`, such as `--budget 0.25`, or start the Finder again for a new session.

**Running with no key.** With no key saved and `TYPESAFE_API_KEY` unset, the page says Jev is off and why, and every ask is narrowed only. Nothing is sent anywhere except the picture requests to GitHub.

## Optional: rendered sheets (macOS)

Cards show the gallery's picture of each doodad, from one angle. On a Mac with StarCraft II installed you can render your own pictures instead: each doodad from four sides, as a 2×2 reference sheet. Cards then show the sheet. Renders and sheets are pictures of Blizzard's assets, so they stay in your cache folder and are never shared.

This step is optional, and only tried on macOS. It needs:

- An Apple silicon Mac.
- StarCraft II installed. It is looked for in `/Applications/StarCraft II`; name another folder with `--sc2 <folder>` or `SC2_ASSET_CATALOG_SC2_PATH`.
- Xcode, from the App Store, with its Metal toolchain (`xcodebuild -downloadComponent MetalToolchain`, about 840 MB). Command Line Tools alone aren't enough.
- [Homebrew](https://brew.sh), and ImageMagick (`brew install imagemagick`), whose `montage` builds the sheets.

First build the renderer, once:

```sh
npx @team-antioch/sc2-asset-catalog setup-renderer
```

It checks for the above and says what's missing and how to get it. Then it builds the [WhiteoutFlakes](https://github.com/FernandoS27/WhiteoutFlakes) model viewer from source into the cache folder's `whiteoutflakes/`, installing cmake, ninja, vulkan-loader and molten-vk with Homebrew. It records the viewer's path in your config folder (`renderer.json`, beside the Jev key). The build took about 3 minutes on an M1 Max, plus the downloads. Running it again skips the steps already done.

Then render, for every doodad or only the ids you name:

```sh
npx @team-antioch/sc2-asset-catalog render [doodad ids…] [--jobs 4] [--force]
```

The viewer reads each model straight from the game's storage. A full render of about 2,600 doodads takes roughly half an hour with 4 jobs on an M1 Max. Some doodads always fail, such as decals that draw nothing on a turntable and helpers with no model. Renders go in the cache folder's `thumbnails/doodads/` and sheets in `catalog-sheets/doodads/`. A doodad already drawn by the same viewer build is skipped, a failed one is tried again next time, and one whose renders you deleted is drawn again (a deleted sheet is built again from its renders). Two `render` runs can share a cache folder at once: each viewer run gets a home of its own for its caches, and the record of what was drawn keeps both runs' results. Give them different doodads, or both draw the ones they share. The viewer sometimes writes a garbled frame, or a white or black background. Each frame is checked, a garbled model is rendered again (up to 3 times), and the background is keyed out. `--viewer <WhiteoutFlakes.app>` or `SC2_ASSET_CATALOG_VIEWER` runs a viewer other than the one setup built.

**Other renderers.** `--renderer <module>` draws with a JavaScript module instead. Its default export draws one model:

```js
// my-renderer.mjs
export default {
  // Draw `model` (a game storage path such as Assets/Doodads/Rock/Rock.m3) from four turntable
  // angles, pitched down, as transparent size×size PNGs at outputPaths, in angle order.
  async render({ model, outputPaths, size }) { /* run your viewer here */ },
  // Optional: what makes your output what it is, so a change renders everything again.
  async key() { return "my-viewer-1"; },
  // Optional: whether an error means the game has no such model file.
  isNotFound: (error) => /not found/i.test(String(error)),
};
```

## Platforms

- **macOS:** CI-tested and tried by hand.
- **Linux:** CI-tested.
- **Windows:** CI-tested, and tried by hand on Windows 11 on ARM64 (login, Jev ranking, logout and extract included). Rendering isn't supported on Windows yet.

CI runs the unit tests and a clean-folder start of the Finder on Windows, macOS and Linux for every change.

## Using the library

```js
import { readStockDoodadSources, searchDoodads } from "@team-antioch/sc2-asset-catalog";

// After `npx @team-antioch/sc2-asset-catalog extract` (or the Finder's first start):
const sources = readStockDoodadSources();
const { results } = searchDoodads({ words: ["crate"], biome: ["desert"], limit: 10 }, sources);
```

A search works out its candidates once per sources object, so keep the sources you read for later searches. `cachedStockDoodadSources()` does that for you: it reads them once per set of folders, until `forgetStockDoodadSources()` (call it when a source file changes). Pictures are looked for under the cache folder; `pictureFallback` (a function from a picture's path to another place to look) lets them be found elsewhere too.

Every module can also be imported on its own, as `@team-antioch/sc2-asset-catalog/catalog/<name>.js`. The Finder can be started from code with `startFinder` from `@team-antioch/sc2-doodad-finder`. Its options beyond `port`, `budget`, `tickLog` and `cacheDir` are for sc2-adjutant and may change.

## Tests and the test asks

`npm test` runs the unit tests. They use fakes for the game data, the embeddings model and Jev, and make no network calls.

[`test-asks.json`](test-asks.json) holds typical asks, each with the doodads it should find. `npm run test-asks` runs the narrowing on each of them with the real model and reports how many of the expected doodads it found and how fast. It also reads a tick log when given one with `--tick-log <folder>`, so the asks you ticked cards from count as tests too. With a key saved by `login` or in `TYPESAFE_API_KEY`, it also has Jev rank every ask, with live calls made only when you run it, and stops before the spend passes `--budget` ($0.50 by default). `--no-rank` makes no calls. CI never calls Jev.

## Contributing

New and better descriptions and Doodad Uses are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Why the Finder works the way it does: [docs/adr/](docs/adr/). Terms: [GLOSSARY.md](GLOSSARY.md).

## Licences

- The code is under the [MIT License](LICENSE).
- The doodad descriptions (`packages/sc2-asset-catalog/data/doodad-descriptions.json`) and the Doodad Uses (`packages/sc2-asset-catalog/data/doodad-uses/`) are under [CC BY 4.0](LICENSE-DATA). Attribute as "SC2 doodad descriptions and Doodad Uses from sc2-asset-catalog, CC BY 4.0".
- The built-in renderer runs [WhiteoutFlakes](https://github.com/FernandoS27/WhiteoutFlakes) by Fernando Sahmkow, under the BSD 3-Clause License. `setup-renderer` builds it from its source, and none of its code ships in the packages. Its notice is in [THIRD-PARTY-NOTICES.md](packages/sc2-asset-catalog/THIRD-PARTY-NOTICES.md).

## Releasing

Releases go through [Changesets](https://github.com/changesets/changesets) and the [release workflow](.github/workflows/release.yml), which publishes with npm trusted publishing: no npm token is stored anywhere. Once the repository variable `RELEASE` is `on`, each push to `main` opens or updates a version pull request from the changesets, and merging it publishes the new versions. Setting it up, once:

1. Publish 0.1.0 of both packages by hand, so they exist on npm: `npm ci` and `npm run build`, then `npm publish` in `packages/sc2-asset-catalog` and then in `packages/sc2-doodad-finder`. Always build from the root first: packing doesn't build, because Changesets packs both packages at once and one package's build would empty the other's types mid-build.
2. On npmjs.com, add a trusted publisher to each package: GitHub Actions, repository `TeamAntioch/sc2-asset-catalog`, workflow `release.yml`.
3. Set the repository variable `RELEASE` to `on`.
