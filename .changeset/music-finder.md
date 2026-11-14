---
"@team-antioch/sc2-music-finder": minor
---

Add the Music Finder: a local page, started with `npx @team-antioch/sc2-music-finder --open`, where you ask for music in plain words ("a tense build under an alien approach, about a minute") and see cards of the game's tracks at once, each with its listening notes, ratings, length, moods, sections and the dependency your map needs. It narrows each ask with the music search and a local embeddings model, then ranks with Jev if you have a key. Filters for energy, tension, valence, length, kind, faction and your map's dependencies are pinned tags; the silent, unplayable and map-local ids are hidden until you show them. With `--audio <folder>`, a folder of the game's music `.ogg` files you extracted yourself, cards play from any section and you can set an in-point; the tray copies ids with their in-point and dependencies. No audio ships.
