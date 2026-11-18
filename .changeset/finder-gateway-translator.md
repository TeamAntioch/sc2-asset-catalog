---
"@team-antioch/sc2-finder-kit": minor
"@team-antioch/sc2-doodad-finder": patch
---

Add `gatewayTranslator`, a kit translator that asks `amazon/nova-micro` through Vercel's AI Gateway (one fetch, no SDK, a prompt with the game's localized names), and `cachingTranslator`, which asks once per ask. The Doodad Finder's `openFinder` passes a `translator` through, and its test command takes `--translate` (with `VERCEL_API_GATEWAY_KEY`) and reports the hit rate of the asks in other scripts apart. `timings.total` in the kit's narrowing no longer includes translating, which is reported as `timings.translate`. The test asks gain Russian and Korean versions of the typical mappers' asks: searched as typed they find 3% of their expected doodads, translated 93%.
