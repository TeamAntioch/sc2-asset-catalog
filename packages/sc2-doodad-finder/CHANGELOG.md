# @team-antioch/sc2-doodad-finder

## 0.2.0

### Patch Changes

- 1c4f357: Add `gatewayTranslator`, a kit translator that asks `amazon/nova-micro` through Vercel's AI Gateway (one fetch, no SDK, a prompt with the game's localized names), and `cachingTranslator`, which asks once per ask. The Doodad Finder's `openFinder` passes a `translator` through, and its test command takes `--translate` (with `VERCEL_API_GATEWAY_KEY`) and reports the hit rate of the asks in other scripts apart. `timings.total` in the kit's narrowing no longer includes translating, which is reported as `timings.translate`. The test asks gain Russian and Korean versions of the typical mappers' asks: searched as typed they find 3% of their expected doodads, translated 93%.
- 262860d: Move what the Doodad Finder shares with other finders into a new package, `@team-antioch/sc2-finder-kit`: the local server and page shell, the embeddings model and its vector cache, the Jev ranker with its key file, login and spend cap, the ask timing, the tray and the test-ask cases. The Doodad Finder is a layer on the kit and behaves as before (its asks go through the kit's rank budget, which never cuts them at the default 200 candidates); every module it had still imports from `@team-antioch/sc2-doodad-finder/<module>.js`.
- 1c4f357: Translate asks in Latin-script languages too (Spanish, German, French, Portuguese, Polish...). A new language detector slot says whether an ask is English; `jevLanguageDetector` asks Jev one Choice question (about 110 ms and under two thousandths of a cent a call), and `cachingDetector` remembers each answer. `openFinder` takes a `languageDetector`: an ask made only of the catalog's own English words is English with no call, and any other ask in Latin script is put to the detector and translated unless it says English; a detector that fails or can't tell counts as not English. `Translation` gains `translated` and `detection`, and `translateAsk` takes the detector and vocabulary as options. The Doodad Finder's test command takes `--detect jev|vocabulary|none` and reports the hit rate by language. The test asks gain Spanish, German, French, Portuguese and Polish versions: as typed the asks in other languages find 32% of their expected doodads, with Jev checking Latin-script asks and translating 99%.
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

## 0.1.2

### Patch Changes

- 0007af9: What the first hand test on Windows found:

  - When the embeddings model can't load because the Microsoft Visual C++ Redistributable is missing, the Finder now says what to install, and where to get it, for this machine's architecture.
  - On Windows, hints say `npx.cmd`, which PowerShell's default policy runs.
  - A failed ranking is printed in the terminal, as well as shown on the page.
  - The start line counts the cards embedded, so cards that share a text both count.

- Updated dependencies [0007af9]
  - @team-antioch/sc2-asset-catalog@0.1.2

## 0.1.1

### Patch Changes

- 3c4d485: The first release published from GitHub Actions through npm trusted publishing, with provenance. The README now says the blocked-install-scripts warning from newer npm versions is harmless.
- Updated dependencies [3c4d485]
  - @team-antioch/sc2-asset-catalog@0.1.1
