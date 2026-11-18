---
"@team-antioch/sc2-finder-kit": minor
---

Add a translator slot to the finder kit, so an ask in another script (Russian, Korean, Chinese, Arabic...) can be searched in English. `openFinder` takes an optional `translator`; `narrow` translates an ask with any letter outside the Latin script, searches the English, and returns `translation` (the original, the English, how long it took, and why it was left as typed if the translator failed) and `timings.translate`. A translator that throws, times out (3 s) or answers nothing leaves the ask as typed. Without a translator nothing changes.
