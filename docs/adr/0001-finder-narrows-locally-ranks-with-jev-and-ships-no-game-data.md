# The Finder Narrows Locally, Ranks with Jev, and Ships No Game Data

Mappers ask for doodads many times in a row while they dress a map, and want to see candidates at once. Searching by name alone misses most of what fits ("a heavy press head" is a crate scaled up, a wall block, a storage locker), and judging every candidate from its picture is slow. So the Doodad Finder answers each ask in well under a second, from text alone, and lets the mapper tick what's worth a closer look.

**Narrow, then rank.** Each ask runs two local searches beside each other: the catalog's keyword search (names, id words, looks and Doodad Uses, about 100 results) and an embeddings search over the same text (about 100 results), merged without duplicates. Doodads a map's dependencies already bring in are never cut at this step. A ranker then grades every remaining candidate against the ask. The whole catalog is never sent to a model per ask. Jev chooses among at most 255 options and takes 64k tokens per request, so it couldn't take the catalog at once. Narrowing also keeps each ask's cost to a fraction of a cent.

**Local embeddings, not an API.** The embeddings model (gte-small, about 34 MB) runs on the user's machine, so narrowing stays under 50 ms with no network call. Its vectors are a cache that the Finder's process keeps current by embedding again only the cards whose text changed. They are tied to one model, and are only a copy of the catalog's text.

**Jev only, and optional.** The ranker is Jev, TypeSafe AI's System One model: typed, calibrated answers in a few hundred milliseconds. It grades each candidate on four levels, from *doesn't fit* to *reads as exactly this*, and the code orders the cards by those levels. The ranker is an internal slot, so tests can fill it with fakes. The key comes from `TYPESAFE_API_KEY` in the environment, else from a key file that `sc2-doodad-finder login` saves in the per-user config folder (0600 in a 0700 folder on POSIX), on every platform. The variable wins. There is no keychain or credential manager, and only the Finder's process holds the key. With no key the Finder shows the narrowing's order. Each session stops calling Jev once its estimated spend reaches a cap, $1.00 unless `--budget` sets another, and the page says why. What each ask sends is the ask, the tags and the narrowed cards' text, never pictures or files, and every payload is logged in the cache folder.

**Only what we wrote ships.** The hand-written descriptions (look, kind, size, role, story, biome, state) and the Doodad Uses ship as text keyed by doodad id, under CC BY 4.0. Nothing extracted from the game ships. Names from ObjectStrings, packages, categories, tilesets, variations, model files and footprints come from SC2Mapster's SC2GameData. Gallery file names come from sc2-mapping-reference's file list. All of them are extracted into each user's cache folder on the Finder's first start, or by the `extract` command, and joined to the descriptions by id. A described id that wasn't extracted is reported and left out. An extracted id with no description still matches by its name and id words. Pictures are linked from the gallery by URL, and rendered sheets are an optional local step behind a small model-renderer interface.

**Ticks go to a tray.** Ticked cards collect in a tray, whose ids and dependencies are copied through the browser's clipboard during the click. No system clipboard tool is needed, so it works the same on every platform. An opt-in tick log records each ask and what was ticked from it, as test cases.

**A library with start options, not plugins.** The Finder is started by one function, `startFinder`. Its CLI calls it with the public defaults. Another tool can call it with its own sources, badges and tray actions, each passed in as a value. Nothing is discovered or loaded by name. Those options are documented as "for sc2-adjutant, may change" until they settle.

## Considered Options

- **The whole catalog, trimmed, in one cached LLM prompt per ask.** It matches by meaning with nothing missed by a narrowing, but every ask still reads 25–30k tokens, it can't use Jev, and it takes seconds.
- **An embeddings API.** Better vectors, but a network round trip on every keystroke the narrowing follows.
- **An LLM that rewrites the ask into keywords for the keyword search.** Nothing new to build, but an LLM call before the ranker, which loses most of the speed Jev gives.
- **A second ranker to compare with, such as a general chat model.** Kept for a while and then removed: two SDKs and two credentials for every user, to answer a question the test command answers with numbers.
- **Ship the full catalog, extracted fields and all.** No first-start extraction, but names, packages, categories and gallery names are Blizzard's data. Shipping only our own text keeps the licence question to what we wrote, and every user can extract the same fields from SC2GameData, so they lose nothing.
- **Copy the code into a public repo and keep developing the original.** Two copies of the search and the narrowing would drift, and every fix would be made twice or lost in one. This repo owns the code, and other tools depend on its published packages.

## Consequences

- The keyword search must return about 100 results for the Finder, more than a person reads.
- A doodad the narrowing misses never reaches the ranker. The test command reports the narrowing's hit rate on its own, against `test-asks.json` and the tick log, so a miss there shows up before ranking is blamed. It fails on the speed targets: narrowing p95 50 ms, a warm start 3 s, Jev p50 300 ms and p95 800 ms.
- The first start needs a connection and takes about a minute: about 22 MB of SC2GameData, the gallery's file list and the model. Later starts need none except for Jev and the pictures. A game patch is picked up by running `extract` again.
- Without a key, nothing leaves the machine but the picture requests.
- A Doodad Use added to the catalog is findable by meaning on the next ask, once the Finder's process has embedded that doodad again.
- CI runs on Windows, macOS and Linux, including a start of the packed Finder in an empty folder with an empty cache, and never calls Jev.
