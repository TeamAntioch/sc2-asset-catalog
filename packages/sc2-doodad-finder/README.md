# @teamantioch/sc2-doodad-finder

Ask for StarCraft II doodads in plain words and see ranked cards at once: a local page that narrows each ask with a keyword search and a local embeddings model, then ranks the candidates with Jev (optional: save a TypeSafe key with `npx @teamantioch/sc2-doodad-finder login`, or set `TYPESAFE_API_KEY`).

```sh
npx @teamantioch/sc2-doodad-finder --open
```

The first start extracts the catalog's fields from SC2GameData into your cache folder and downloads the embeddings model. `npx @teamantioch/sc2-doodad-finder extract` extracts again. `login` asks for your TypeSafe key and saves it in your config folder, and `logout` deletes it. Options: `--port <n>`, `--budget <dollars>` (Jev's spend cap per session, $1.00 by default), `--tick-log <folder>`, `--open`.

Getting a TypeSafe key, where it is kept, what each ask sends, the cost and the cap, the cache folders and the platforms: see the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#readme).

Not affiliated with or endorsed by Blizzard Entertainment. MIT License.
