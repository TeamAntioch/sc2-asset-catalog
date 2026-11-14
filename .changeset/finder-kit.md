---
"@team-antioch/sc2-asset-catalog": patch
"@team-antioch/sc2-finder-kit": patch
"@team-antioch/sc2-doodad-finder": patch
---

Move what the Doodad Finder shares with other finders into a new package, `@team-antioch/sc2-finder-kit`: the local server and page shell, the embeddings model and its vector cache, the Jev ranker with its key file, login and spend cap, the ask timing, the tray and the test-ask cases. The Doodad Finder is a layer on the kit and behaves as before (its asks go through the kit's rank budget, which never cuts them at the default 200 candidates); every module it had still imports from `@team-antioch/sc2-doodad-finder/<module>.js`.
