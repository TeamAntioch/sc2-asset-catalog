# @team-antioch/sc2-asset-catalog

## 0.3.1

### Patch Changes

- 5cabf0a: The set `interior-cutscene-rohanaintro` is now `interior` (named "Interior"). Its pictures are in the gallery under both ids for now; use `interior`.
- c27ccc7: File locks no longer fail on Windows when one caller opens a lock file while another is removing it.

## 0.3.0

### Minor Changes

- 5813512: Add the cinematic sets' looks: `data/set-looks.json` holds what we wrote and measured of 77 sets from Blizzard's campaign cutscenes, read with `readSetLooks()` from `catalog/set-looks.js`, and `setPictureUrl()` gives each picture's address in the sc2-mapping-reference gallery.

## 0.2.0

### Minor Changes

- 2ec6100: Export `DEFAULT_DEPENDENCY_NAME` (`Void (Mod)`), the dependency every map has, so a finder can name it when an id needs nothing more.
- b10c2b3: Export the music search's shared rules (`FACTION_FEEL`, `factionsOfFeel`, `withinRange`, `secondsOverlap`) so the Music Finder matches the way the search does.
- b10c2b3: Add the music's listening notes and a search over them. `data/music-notes.json` holds what we wrote and measured of 702 of the game's music files, keyed by file base name (Gemini's description, mood, tension, valence, sections and uses; our length, loudness and tempo), under CC BY 4.0. `sc2-asset-catalog extract-music` builds every callable music id (923 Soundtracks and 431 Sounds), its files, its dependency and where Blizzard's scripts use it into your cache from a mirror of the game's data, and `readMusicCatalog` joins them to the notes. `searchMusic` searches by words and filters by rating, length, kind, faction, role and dependency. No audio ships.

### Patch Changes

- 8ed4b3a: Add Doodad Uses for 21 doodads: CharBones, DeadPrimalisk, DeadQueen, DeadTendrils, DOM_LabCrates, FireMedium, JarbanMinor_Crate, Korhal_Platform_BurntEdgePieces, Korhal_Platform_Debris, Korhal_SpacePort_Container_Destroyed, ShipPlating, Smoke_Pillar_Tall_DT, SmokeMedium, SpacePlatformWallDebris, SpacePlatformWallDebrisLarge, SpaceScrap, WreckedBattlecruiser, ZergBonePileMedium, ZergCarcasses, ZergCarcassesMedium, ZerusChrysalisSpike.
- a98e4d6: Add Doodad Uses for 10 doodads: BattleStation_CliffStructures, BattleStation_MechBridgeDestroyed, Decal_Baked, DOM_LabConsoles, DominionLandingPad, Korhal_Platform_BurntEdgePieces, KorhalGeneratorCoreDoodadWorkUnnamed, SpaceDockEquipment, SpacePlatformGroundDecals, SpacePlatformWallDebris.
- 262860d: Move what the Doodad Finder shares with other finders into a new package, `@team-antioch/sc2-finder-kit`: the local server and page shell, the embeddings model and its vector cache, the Jev ranker with its key file, login and spend cap, the ask timing, the tray and the test-ask cases. The Doodad Finder is a layer on the kit and behaves as before (its asks go through the kit's rank budget, which never cuts them at the default 200 candidates); every module it had still imports from `@team-antioch/sc2-doodad-finder/<module>.js`.
- b10c2b3: Fix what review found in the music extraction. An id is map-local only when every definition of it is in one map (9 ids were hidden that any map can play, such as `VictoryMusic`), and then takes its campaign's or mod's dependency; a package outside the load order's list no longer loads after the maps; an id that is both a Soundtrack and a Sound gets only the uses that call it as that kind; roles match at the start of a word (`Halloween` is no longer `low`); a function's name is found after any galaxy return type; a file fetch backs off between retries and a concurrency below 1 is refused; a notes file that can't be parsed no longer fails `extract-music` after it wrote the cache; the denylist check reads notes' keys; one rule (`musicFileName`) makes a file's key for the notes' builder and the join.
- 2ec6100: Fix what review found in the Music Finder. An aborted range request no longer leaks a file descriptor (the audio route pipes with `pipeline`); a `Range` header that is invalid, several ranges or another unit is ignored and the whole file sent, with a 416 only for a well-formed range the file can't meet; a section time of `h:mm:ss` or none no longer seeks to NaN; `--port ''` and `--budget ''` are refused; a file still loading no longer starts at the position of the one chosen before it; a half-typed filter isn't overwritten by a state event, and a range typed 4-2 is sent as 2-4. The catalog's `dependencyName` now lives in `catalog/doodad-dependencies.js` (still re-exported from `doodad-card-html.js`); the four packages release together, so the Music Finder's pin of the catalog has it.

## 0.1.2

### Patch Changes

- 0007af9: What the first hand test on Windows found:

  - When the embeddings model can't load because the Microsoft Visual C++ Redistributable is missing, the Finder now says what to install, and where to get it, for this machine's architecture.
  - On Windows, hints say `npx.cmd`, which PowerShell's default policy runs.
  - A failed ranking is printed in the terminal, as well as shown on the page.
  - The start line counts the cards embedded, so cards that share a text both count.

## 0.1.1

### Patch Changes

- 3c4d485: The first release published from GitHub Actions through npm trusted publishing, with provenance. The README now says the blocked-install-scripts warning from newer npm versions is harmless.
