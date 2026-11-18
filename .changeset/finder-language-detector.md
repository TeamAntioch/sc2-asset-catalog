---
"@team-antioch/sc2-finder-kit": minor
"@team-antioch/sc2-doodad-finder": patch
---

Translate asks in Latin-script languages too (Spanish, German, French, Portuguese, Polish...). A new language detector slot says whether an ask is English; `jevLanguageDetector` asks Jev one Choice question (about 110 ms and under two thousandths of a cent a call), and `cachingDetector` remembers each answer. `openFinder` takes a `languageDetector`: an ask made only of the catalog's own English words is English with no call, and any other ask in Latin script is put to the detector and translated unless it says English; a detector that fails or can't tell counts as not English. `Translation` gains `translated` and `detection`, and `translateAsk` takes the detector and vocabulary as options. The Doodad Finder's test command takes `--detect jev|vocabulary|none` and reports the hit rate by language. The test asks gain Spanish, German, French, Portuguese and Polish versions: as typed the asks in other languages find 32% of their expected doodads, with Jev checking Latin-script asks and translating 99%.
