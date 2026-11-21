# @team-antioch/sc2-set-finder

Ask for a StarCraft II cinematic set in plain words ("the bridge of a small starship", "a jungle clearing at night", "a hall of sleeping warriors in stasis pods") and see the sets that fit, best first. A set is one of the pre-built locations Blizzard's campaign cutscenes are filmed in: a cluster of scenery in a Cutscene Editor file, with its own cameras. Each card shows pictures of the set, what it looks like, what it could stand in for, its size and camera count, and the Cutscene Editor file it is in.

It's a local page that narrows each ask with a keyword search and a local embeddings model over the sets' **looks**, then (optionally) ranks the candidates with Jev, TypeSafe AI's System One model.

This project is not affiliated with or endorsed by Blizzard Entertainment. StarCraft II and its assets are Blizzard's. No game data ships here. The looks (`data/set-looks.json` in `@team-antioch/sc2-asset-catalog`) are our own words and measurements of 77 sets made only from Blizzard's files, and the pictures are linked by URL from the [sc2-mapping-reference](https://github.com/TeamAntioch/sc2-mapping-reference) gallery ([ADR 0005](https://github.com/TeamAntioch/sc2-asset-catalog/blob/main/docs/adr/0005-cinematic-sets-ship-our-looks-and-link-their-pictures.md)).

## Install and start

You need [Node.js](https://nodejs.org/) 22.18 or later, on Windows, macOS or Linux. No StarCraft II install is needed to search.

```sh
npx @team-antioch/sc2-set-finder --open
```

On Windows, type `npx.cmd` in place of `npx`, and install the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist) first if the machine doesn't have it: the embeddings model needs it. The page is at `http://127.0.0.1:4636/`. It listens on your own machine only. Ctrl-C stops it.

The first start downloads the embeddings model (gte-small, about 34 MB) into your cache folder, unless the Doodad or Music Finder already has, and embeds every card. Later starts take a second or so and need no connection, except to Jev and for the pictures.

Options:

- `--port <n>`: another port (`0` for any free one).
- `--budget <dollars>`: the session's spend cap on Jev, $1.00 by default.
- `--tick-log <folder>`: logs every tick to `<folder>/ticks.jsonl`, for the test asks.
- `--open`: opens the page in your browser.

`login` asks for your TypeSafe key and saves it in your config folder (the same key file the other finders use), and `logout` deletes it. Or set `TYPESAFE_API_KEY`. With no key every ask is narrowed only. What a ranked ask costs and how the cap works are in the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#ranking-with-jev). The Set Finder sends Jev the ask, your tags and each candidate's card text (its name, kind, look, facets, uses and size), never pictures. An ask is cut to the best 24 sets, about 13,000 tokens by our estimate, so it costs about $0.0005.

## Using the page

1. **Browse.** With nothing asked, the page shows every set by name.
2. **Ask** for the place your scene is in. Cards come from the narrowing as you type; on Enter, or after the pause set on the page, Jev puts them in order.
3. **Pick kinds** with the chips: room, exterior, space, props (loose objects with no room around them), effects (only particles, holograms or light) and unclear. With none picked every kind is shown.
4. **Open a set's page** from its card: its look in full, each chosen picture beside the same view filmed in game, its plan and overview, what is wrong with its pictures and the files it is in.
5. **Tick** a card to put it in the tray. **Copy** gives the set's id, name and the Cutscene Editor files it is in, which is where the Editor finds it.

**Reading a card.** The pictures are Blender renders of the set's pieces where its file puts them, roof cut away, and frames of the same views filmed in the game, where one came out. The look was written by an agent from those pictures. Its confidence says how much the pictures showed, and a set's page lists the problems it saw. Sizes are in cells, measured from the pieces.

## For a host: sc2-adjutant

These are for sc2-adjutant, and may change.

The package's main export has what a host needs: `setCards` to make the cards, `startSetFinder` to serve the page with them, `openSetFinder` for a finder with no page whose `find` narrows and ranks one ask, and `setAnswer`, the shape a found set is handed on in.

A host lays its own sets over the published ones as a **layer**: its looks (the catalog's `SetLook` shape) and where its pictures are, either a gallery address laid out as sc2-mapping-reference's `public/sets` or a folder on the machine laid out the same way (`<folder>/<set id>/card/1.jpg`, `card/1-game.jpg`, `plan.jpg`, `overview.jpg`). A set whose id is already there replaces it. The page serves a folder's pictures itself, at `/pictures/<id>/<file>`, and only those names; an answer gives each such picture's `path` too.

```js
import { readSetLooks } from "@team-antioch/sc2-asset-catalog/catalog/set-looks.js";
import { localEmbedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import { spendCap } from "@team-antioch/sc2-finder-kit/spend-cap.js";
import { openRanker, openSetFinder, setAnswer, setCards, setVectorCacheFile, startSetFinder } from "@team-antioch/sc2-set-finder";

const extra = [{ looks: myLooks, pictures: { dir: "/path/to/set-views" }, source: "my campaign" }];

// The page:
const running = await startSetFinder({ extra, port: 0 });

// Or a finder with no page, for a tool:
const embedder = await localEmbedder();
const jev = openRanker();
const finder = await openSetFinder({ cards: setCards(readSetLooks(), { extra }), embedder, cacheFile: setVectorCacheFile(embedder.model), ranker: jev.ranker, off: jev.off, cap: spendCap(1) });
const found = await finder.find("a cramped ship corridor");
const answers = found.sets.slice(0, 5).map((set) => setAnswer(set.card, set));
```

An answer has the set's id, name, kind, look, facets, what it could stand in for, its places (`rooms`), confidence, source, size, camera count, files, its pictures (each with `url`, `thumbnail`, `path` for a folder's, and `inGame` where it has a frame filmed in game) and its plan and overview, and Jev's `level` (0 to 3) when the ask was ranked. `startSetFinder` also takes `trayActions`, a `ranker`, a `tickLog` function and `status`, as the Music Finder's start does, and gives back the `finder` its page asks, whose `find` spends under the page's cap.

## Testing it

`npm run test-set-asks` in the repo runs the narrowing on `test-set-asks.json` (places to set a scene, each with the sets it should find) with the real model, and reports the hit rate, how many expected sets are in the first three and how fast. With a key it has Jev rank each ask too, which costs about a cent in all; `--no-rank` makes no calls.

Not affiliated with or endorsed by Blizzard Entertainment. MIT License; the looks it reads are CC BY 4.0.
