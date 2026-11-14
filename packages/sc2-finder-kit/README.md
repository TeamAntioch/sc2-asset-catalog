# @team-antioch/sc2-finder-kit

What the StarCraft II asset finders share. The [Doodad Finder](../sc2-doodad-finder) is built on it, and so can another finder be: the Music Finder is next.

A finder in this repo is a small local web page that answers an ask in plain words with cards. Asking narrows in well under a second from text alone (a keyword search and a local embeddings search, merged), then Jev puts the narrowed cards in order. The kit is the half of that which doesn't depend on what the cards are.

## What is here

| Module | What it does |
| --- | --- |
| `card.js` | `FinderCard`, the least the kit asks of a card: an id, a name, the text that is embedded and ranked, and optionally the dependency it needs and whether a map provides it. Also the tag types. |
| `finder.js` | `openFinder`: opens a finder's sources, embeds its cards (only the ones the cache hasn't seen), narrows each ask, and writes the cards again when a watched file changes. |
| `narrow.js` | The merge of the keyword results and the nearest cards, with the tags' raise and filter. |
| `embedder.js`, `embedding-index.js` | The local embeddings model (gte-small) and the vector cache. |
| `ranker.js`, `jev-ranker.js` | The ranker slot, the order by fit, and the Jev ranker, which takes the finder's wording. |
| `credentials.js`, `key-file.js`, `login.js` | Jev's key from `TYPESAFE_API_KEY` or the key file, and the `login` and `logout` commands. One key serves every finder. |
| `spend-cap.js`, `payload-log.js`, `settings.js`, `cache-dir.js` | The session's spend cap, the log of what each ask sent, the page's remembered settings, and where the model's weights go. |
| `asker.js` | When an ask narrows and when it ranks, and cancelling the older one. |
| `server.js` | `startFinderServer`: the process on 127.0.0.1 that serves the page and answers it, with its host and origin checks, the tray, the tray's objects and actions and the tick log. |
| `tray.js`, `test-asks.js` | The tray, and the test-ask cases and the tick log's lines, the test command's speed targets and its warm start. |
| `load-together.js`, `is-main.js` | The start-up race between a finder's extraction and the model, and the check that a CLI module is the one running. |

## What a finder passes in

- To `openFinder`: its sources' loader, how a source makes its cards, its keyword search, what a tag matches and what a dependency provides.
- To `startFinderServer`: a `FinderKind`, which is its name for `/status`, the noun its refusals use, its page, each card's markup, its tags, its copy text, an optional route of its own and a close hook.
- To `jevRanker` and `openRanker`: its `JevWording`, the words Jev judges by.

[ADR 0002](../../docs/adr/0002-the-finders-share-a-kit.md) has the reasoning. The tests build a toy finder from these, with no doodads or tracks in it.

## Using it

Every module imports on its own, as `@team-antioch/sc2-finder-kit/<module>.js`. The kit keeps its files in the asset catalog's cache folder, so it depends on `@team-antioch/sc2-asset-catalog` for where that is. It has no command of its own: a finder's package brings the CLI.

This project is not affiliated with or endorsed by Blizzard Entertainment. StarCraft II and its assets are Blizzard's.

MIT licence.
