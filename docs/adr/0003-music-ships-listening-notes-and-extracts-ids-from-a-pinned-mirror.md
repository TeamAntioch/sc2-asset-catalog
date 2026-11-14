# Music Ships Our Listening Notes and Measurements, and Extracts Its Ids From a Pinned Mirror

The music search tool (sc2-adjutant#701) joins two things by file base name, as the doodad catalog does (ADR 0001). The notes are ours and ship; the ids and files are the game's and are extracted into each user's cache.

**Ships, under CC BY 4.0, in `data/music-notes.json`:** Gemini's listening notes (its description, mood, tension, valence, energy, instrumentation, sections with start times, what the track suits and what to avoid) and our measurements of each file (length, loudness, tempo estimate, onset rate, fades, where it peaks, whether it is silent). Gemini heard each file with no name, game or context. The measurements have to ship: the finder searches with no install and no audio, and a length filter and an energy score can only come from the audio. A note is one line, keyed by the file's base name, matched without regard to case. Where one file sits in two folders, one note stands. `scripts/build-music-notes.mjs` makes the file from sc2-adjutant's research catalogue; nothing in it names a campaign, mission or story, and a test fails on any field that isn't ours.

**Never ships:** audio, albums, composers, the wiki's and Blizzard's pages' descriptions, and anything extracted from the game.

**Extracted by `extract-music`:** one record for every id a map can play music with, 1,354 of them: 923 Soundtracks and 431 Music-category Sounds no Soundtrack plays (19 ids are both). Each has where it is defined, the package that defines it last, the dependency a map needs, its files, a role worked out from its id, whether it is empty, and where Blizzard's scripts and cutscenes name it. A map-local id, one that exists only inside one Blizzard map, says which. The data comes from sc2-arcade-watcher/sc2-game-data at one pinned commit, not from SC2GameData: the usage scan reads the campaigns' map scripts and cutscenes, which SC2GameData doesn't hold. The files are about 900 small ones, fetched in a quarter of a minute after a listing of the commit's files by GitHub's API or, when that refuses, by git.

**Joined by base name.** An id is an entry with the notes of the files it plays. An id whose files have no notes is still an entry, found by the words of its id. A note whose file no id plays is left out and reported.

## Considered Options

- **Compute the measurements in the finder from the user's audio.** Rejected. Without an extracted audio folder there'd be no length or energy filter, and extracting the audio is the one step a mapper has to do by hand.
- **Read SC2GameData for the music too.** Rejected. It holds mods and campaigns but not the maps, whose scripts hold most of the places music is used.
- **Key a record by id alone.** Rejected. Nineteen ids are both a Soundtrack and a Sound, and the two play different things.
