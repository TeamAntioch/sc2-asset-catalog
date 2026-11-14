---
"@team-antioch/sc2-asset-catalog": patch
---

Fix what review found in the music extraction. An id is map-local only when every definition of it is in one map (9 ids were hidden that any map can play, such as `VictoryMusic`), and then takes its campaign's or mod's dependency; a package outside the load order's list no longer loads after the maps; an id that is both a Soundtrack and a Sound gets only the uses that call it as that kind; roles match at the start of a word (`Halloween` is no longer `low`); a function's name is found after any galaxy return type; a file fetch backs off between retries and a concurrency below 1 is refused; a notes file that can't be parsed no longer fails `extract-music` after it wrote the cache; the denylist check reads notes' keys; one rule (`musicFileName`) makes a file's key for the notes' builder and the join.
