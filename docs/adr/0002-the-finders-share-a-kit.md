# The Finders Share a Kit, and Each Finder Passes In What Makes It Its Own

A second finder (the Music Finder, sc2-adjutant#701) needs the same plumbing as the Doodad Finder: the local server and its host and origin checks, the embeddings model and vector cache, the Jev ranker, its key file, login and spend cap, the ask timing, the tray and the test-ask cases. About half of the Doodad Finder is that, and the other half is doodad-specific: the page, the cards, the keyword search, the tags and what a copy holds. So the generic half is `@team-antioch/sc2-finder-kit`, and each finder is a layer on it.

**Seams are values passed in, not subclasses or plugins.** The kit is generic over a card that has an id, a name, the text that is embedded and ranked, and optionally the dependency it needs and whether a map provides it (`FinderCard`). A finder passes `openFinder` its sources' loader, how a source makes its cards, its keyword search, what a tag matches and what a dependency provides. It passes `startFinderServer` a `FinderKind`: its name for `/status`, the noun in its refusals, its page, each card's markup, its tags, its copy text, an optional route of its own (a doodad's sheet) and a close hook. It gives `jevRanker` and `openRanker` its wording (the state note, the Score question, the field the card goes under, the levels). Nothing is discovered or loaded by name, as ADR-0001 has it.

**What stays doodad-specific:** the page and its markup, cards, tags, the keyword search's words and pinned facets, the sheet route, the extracted catalog and its sources, and the CLI. A finder keeps its own port, command name, cache file names and test asks.

**The Doodad Finder keeps every import path.** Each module it had is still there, as a re-export of the kit's or a thin layer that fills in the doodads' side (its ranker, `openRanker`, `openFinder`, `startFinderServer`, `login`, the tags' types), so `@team-antioch/sc2-doodad-finder/<module>.js` imports from sc2-adjutant's wrapper resolve as before. The Doodad Finder's own tests pass unchanged against them. A later breaking release can retire the re-exports.

## Considered Options

- **Copy the files into each finder.** Rejected, as in sc2-adjutant's ADR-0022: the copies drift, and a fix to the spend cap or the origin check would be made twice or lost.
- **One package with a doodads mode and a music mode.** Rejected. It ties two data sets, two pages and two release stories together, and a mapper who wants only music installs the doodad pictures' code.
- **A class hierarchy, with the finders extending a base server.** Rejected. What differs is a handful of values, and passing them in keeps the kit free of any one finder's types.

## Consequences

- The kit depends on `@team-antioch/sc2-asset-catalog` for the cache and config folders and a few utilities, so every finder keeps its files in the same cache folder, and one `login` saves the one key for all of them.
- The three packages release together at one version, and each pins the others exactly.
- The kit's tests use a toy finder with neither doodads nor tracks in it, which keeps the seams honest.
