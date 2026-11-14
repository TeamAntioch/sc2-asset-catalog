# The Music Finder's Filters Are Pinned Tags, and Its Audio Is Served From an Index

The Music Finder (sc2-adjutant#701) is a layer on the finder kit (ADR 0002). Two of its choices differ from the Doodad Finder's, and a reader of the code would wonder why.

**The page's filters are pinned tags.** Energy, tension, valence, length, kind, faction and the dependencies a map has are tags of their own facets (`energy: 2-4`, `length: 40-`, `map has: Void (Campaign)`), pinned from the page's controls. The kit already keeps a pinned tag whatever is ticked, filters both searches by it, sends it to the ranker as context and logs it in the tick log, so a filter costs the kit nothing and a tick log records what an ask ran with. The keyword search takes the pinned facets it can, so its hundred results are already filtered, and the kit checks the rest on the merge (`tagMatches`). What the kit has no seam for is a default: with nothing pinned, no tag is checked. So the Finder's `narrow` adds `show: playable` to each ask unless the page pinned a `show` tag, which hides what a map can't play (silent files, sound effects and ids that exist only inside one of Blizzard's maps). The page's "show everything" box pins `show: everything`. The default is added inside the narrowing, never to the page's own tags, so the ranker and the tick log don't see it.

**Audio is served only from an index of the Audio folder.** `--audio <folder>` is indexed once: every `.ogg` under it by its base name, lower case. A request is `/audio/<key>`, and a key not in the index is a 404. Nothing from a request is joined to a path, so no encoding of `..`, a separator or a null byte can reach a file outside the folder. A name that two files share takes the first by path, and the start says so. The route answers byte ranges, since a player can't seek in a file without them. The page's player is one element, so a card's section buttons all play through it.

An in-point is the mapper's choice on the page, which the process never sees: the page writes it into the copy text the process sent with its state. The text it edits is a plain script (`in-point.ts`) that a test runs as the page does.

## Considered Options

- **Filters as their own request fields.** Rejected: the kit's asks, ranker context and tick log carry tags and nothing else, so each of the three would grow a second place for what an ask ran with.
- **Show every card and mark the unplayable ones.** Rejected: the silent files, sound effects and map-local ids would sit among the results of every ask, and the ranker would have to grade them away each time.
- **Serve the Audio folder as static files.** Rejected: a static handler resolves request paths against a folder, which is the check an index makes unnecessary.

## Consequences

- A tag whose value isn't one the facet reads (`energy: nonsense`) matches nothing. The page offers selects and numbers, so only a hand-made request makes one.
- The Music Finder keeps its vectors in `music-vectors-<model>.bin` in the shared cache folder, so it and the Doodad Finder don't replace each other's.

## Since the first test run: Jev's token limit

The first ranked run of the test asks had Jev refuse 4 of 15 with `400 max_tokens_exceeded`. A request is one question per candidate, and the music's cards are long (about 640 characters, with the four levels repeated in each question), so a candidate costs about 355 input tokens. The 11 asks Jev took had 168 to 187 candidates (57k to 65.7k tokens); the 4 it refused had 189 to 198. The narrowing returns about 200, so the Music Finder opens the kit's finder with `MUSIC_RANK_BUDGET` (the kit's `jevRankBudget`, 55,000 estimated tokens, ADR 0002) and each ask's candidates are cut to it, lowest ranked first. About 145 candidates are ranked and shown for a typical ask. The first cut of a session is said in the log.
