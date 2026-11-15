---
"@team-antioch/sc2-asset-catalog": minor
---

Add the music's listening notes and a search over them. `data/music-notes.json` holds what we wrote and measured of 702 of the game's music files, keyed by file base name (Gemini's description, mood, tension, valence, sections and uses; our length, loudness and tempo), under CC BY 4.0. `sc2-asset-catalog extract-music` builds every callable music id (923 Soundtracks and 431 Sounds), its files, its dependency and where Blizzard's scripts use it into your cache from a mirror of the game's data, and `readMusicCatalog` joins them to the notes. `searchMusic` searches by words and filters by rating, length, kind, faction, role and dependency. No audio ships.
