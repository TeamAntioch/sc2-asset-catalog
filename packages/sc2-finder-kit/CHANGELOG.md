# @team-antioch/sc2-finder-kit

## 0.3.1

### Patch Changes

- Updated dependencies [5cabf0a]
- Updated dependencies [c27ccc7]
  - @team-antioch/sc2-asset-catalog@0.3.1

## 0.3.0

### Patch Changes

- Updated dependencies [5813512]
  - @team-antioch/sc2-asset-catalog@0.3.0

## 0.2.0

### Minor Changes

- 1c4f357: Add `gatewayTranslator`, a kit translator that asks `amazon/nova-micro` through Vercel's AI Gateway (one fetch, no SDK, a prompt with the game's localized names), and `cachingTranslator`, which asks once per ask. The Doodad Finder's `openFinder` passes a `translator` through, and its test command takes `--translate` (with `VERCEL_API_GATEWAY_KEY`) and reports the hit rate of the asks in other scripts apart. `timings.total` in the kit's narrowing no longer includes translating, which is reported as `timings.translate`. The test asks gain Russian and Korean versions of the typical mappers' asks: searched as typed they find 3% of their expected doodads, translated 93%.
- 1c4f357: Translate asks in Latin-script languages too (Spanish, German, French, Portuguese, Polish...). A new language detector slot says whether an ask is English; `jevLanguageDetector` asks Jev one Choice question (about 110 ms and under two thousandths of a cent a call), and `cachingDetector` remembers each answer. `openFinder` takes a `languageDetector`: an ask made only of the catalog's own English words is English with no call, and any other ask in Latin script is put to the detector and translated unless it says English; a detector that fails or can't tell counts as not English. `Translation` gains `translated` and `detection`, and `translateAsk` takes the detector and vocabulary as options. The Doodad Finder's test command takes `--detect jev|vocabulary|none` and reports the hit rate by language. The test asks gain Spanish, German, French, Portuguese and Polish versions: as typed the asks in other languages find 32% of their expected doodads, with Jev checking Latin-script asks and translating 99%.
- 1c4f357: Add a translator slot to the finder kit, so an ask in another script (Russian, Korean, Chinese, Arabic...) can be searched in English. `openFinder` takes an optional `translator`; `narrow` translates an ask with any letter outside the Latin script, searches the English, and returns `translation` (the original, the English, how long it took, and why it was left as typed if the translator failed) and `timings.translate`. A translator that throws, times out (3 s) or answers nothing leaves the ask as typed. Without a translator nothing changes.
- 1c4f39e: Embed each music card without its id's own words. A card's `embedText` (a new optional field on the kit's `FinderCard`, with `embeddedText(card)` to read what the model embeds) is what the embeddings model reads; the keyword search and the Jev ranker still read the full text. On the test asks it lifts the reviewed asks from 2/3 to 3/3, and the first embed is about 40% faster, as fewer texts are distinct. The vector cache re-embeds once.

### Patch Changes

- 262860d: Move what the Doodad Finder shares with other finders into a new package, `@team-antioch/sc2-finder-kit`: the local server and page shell, the embeddings model and its vector cache, the Jev ranker with its key file, login and spend cap, the ask timing, the tray and the test-ask cases. The Doodad Finder is a layer on the kit and behaves as before (its asks go through the kit's rank budget, which never cuts them at the default 200 candidates); every module it had still imports from `@team-antioch/sc2-doodad-finder/<module>.js`.
- 262860d: The rank budget counts bytes, not UTF-16 units; each ask's `narrowed` event says how many candidates the budget cut (`cut`) and the log notes it; the test command's warm start has a timeout and names the signal that killed it.
- Updated dependencies [2ec6100]
- Updated dependencies [8ed4b3a]
- Updated dependencies [a98e4d6]
- Updated dependencies [262860d]
- Updated dependencies [b10c2b3]
- Updated dependencies [2ec6100]
- Updated dependencies [b10c2b3]
- Updated dependencies [b10c2b3]
  - @team-antioch/sc2-asset-catalog@0.2.0
