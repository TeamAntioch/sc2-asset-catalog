# @team-antioch/sc2-music-finder

## 0.4.0

### Patch Changes

- Updated dependencies [0ed8f1e]
- Updated dependencies [2aaef6b]
- Updated dependencies [3c7a97e]
  - @team-antioch/sc2-asset-catalog@0.4.0
  - @team-antioch/sc2-finder-kit@0.4.0

## 0.3.1

### Patch Changes

- Updated dependencies [5cabf0a]
- Updated dependencies [c27ccc7]
  - @team-antioch/sc2-asset-catalog@0.3.1
  - @team-antioch/sc2-finder-kit@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [5813512]
  - @team-antioch/sc2-asset-catalog@0.3.0
  - @team-antioch/sc2-finder-kit@0.3.0

## 0.2.0

### Minor Changes

- 2ec6100: Add the Music Finder: a local page, started with `npx @team-antioch/sc2-music-finder --open`, where you ask for music in plain words ("a tense build under an alien approach, about a minute") and see cards of the game's tracks at once, each with its listening notes, ratings, length, moods, sections and the dependency your map needs. It narrows each ask with the music search and a local embeddings model, then ranks with Jev if you have a key. Filters for energy, tension, valence, length, kind, faction and your map's dependencies are pinned tags; the silent, unplayable and map-local ids are hidden until you show them. With `--audio <folder>`, a folder of the game's music `.ogg` files you extracted yourself, cards play from any section and you can set an in-point; the tray copies ids with their in-point and dependencies. No audio ships.

### Patch Changes

- 9a5af5a: Fix what review found in the music tooling. `audio_measure.py` records an error for a file ffmpeg can't decode (not a length of 0) and retries failed files; `add-music-notes.mjs` rejects a length of 0, keeps a replaced note's `energy_measured`, reports Gemini's and the measurement's failures apart, and exits 1 when nothing was added; the test command counts an expected track no card plays against the hit rate and fails on it; `cascx` checks every write, refuses names that leave the output folder and fails on a truncated file; `gemini_describe.py` retries by status code and tolerates missing token counts; `essentia_tag.py` says once if the models' classes aren't the expected ones; the README pins the CascLib it was tried with; the pack check refuses the extractor and its source.
- 9a5af5a: Add the Music Finder's full README: the first-start downloads, how to read a card, and step-by-step directions for extracting the game's music files into an Audio folder on macOS (tried) and Windows (not yet tried). The repo gains `cascx`, a small extractor, the scripts that make listening notes for new tracks, a test command for the music asks, and a CONTRIBUTING section for corrections to a note.
- 1c4f39e: Embed each music card without its id's own words. A card's `embedText` (a new optional field on the kit's `FinderCard`, with `embeddedText(card)` to read what the model embeds) is what the embeddings model reads; the keyword search and the Jev ranker still read the full text. On the test asks it lifts the reviewed asks from 2/3 to 3/3, and the first embed is about 40% faster, as fewer texts are distinct. The vector cache re-embeds once.
- 2ec6100: Fix what review found in the Music Finder. An aborted range request no longer leaks a file descriptor (the audio route pipes with `pipeline`); a `Range` header that is invalid, several ranges or another unit is ignored and the whole file sent, with a 416 only for a well-formed range the file can't meet; a section time of `h:mm:ss` or none no longer seeks to NaN; `--port ''` and `--budget ''` are refused; a file still loading no longer starts at the position of the one chosen before it; a half-typed filter isn't overwritten by a state event, and a range typed 4-2 is sent as 2-4. The catalog's `dependencyName` now lives in `catalog/doodad-dependencies.js` (still re-exported from `doodad-card-html.js`); the four packages release together, so the Music Finder's pin of the catalog has it.
- Updated dependencies [2ec6100]
- Updated dependencies [8ed4b3a]
- Updated dependencies [a98e4d6]
- Updated dependencies [1c4f357]
- Updated dependencies [262860d]
- Updated dependencies [1c4f357]
- Updated dependencies [1c4f357]
- Updated dependencies [262860d]
- Updated dependencies [b10c2b3]
- Updated dependencies [1c4f39e]
- Updated dependencies [2ec6100]
- Updated dependencies [b10c2b3]
- Updated dependencies [b10c2b3]
  - @team-antioch/sc2-asset-catalog@0.2.0
  - @team-antioch/sc2-finder-kit@0.2.0
