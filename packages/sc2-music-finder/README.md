# @team-antioch/sc2-music-finder

Ask for StarCraft II music in plain words ("a low, uneasy bed under dialogue", "a sharp string slide into a hit") and see cards of the game's tracks at once. Each card says what the track sounds like, how long it is, which dependency your map needs to play it and where Blizzard used it. Give the page a folder of the game's music files, extracted from your own install, and every card plays, from any point.

It's a local page that narrows each ask with a keyword search and a local embeddings model over the tracks' **listening notes**, then (optionally) ranks the candidates with Jev, TypeSafe AI's System One model.

This project is not affiliated with or endorsed by Blizzard Entertainment. StarCraft II and its music are Blizzard's. No game data and no audio ship here: the page extracts the game's music ids into your cache folder from [a mirror of the game's data](https://github.com/sc2-arcade-watcher/sc2-game-data) when it first starts, and plays only the files you extracted yourself.

## Install and start

You need [Node.js](https://nodejs.org/) 22.18 or later, on Windows, macOS or Linux. No StarCraft II install is needed to search.

```sh
npx @team-antioch/sc2-music-finder --open
```

On Windows, type `npx.cmd` in place of `npx`, and install the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist) first if the machine doesn't have it: the embeddings model needs it. The page is at `http://127.0.0.1:4635/`. It listens on your own machine only. Ctrl-C stops it.

**The first start downloads and extracts**, which takes about a minute on a good connection:

- The game's music ids: about 170 MB of data and scripts read from the mirror and thrown away, leaving 1,354 ids (923 Soundtracks and 431 Sounds) in your cache folder.
- The embeddings model (gte-small, about 34 MB), which also goes in the cache folder and embeds every card.

Later starts take a few seconds and need no connection, except to Jev. `npx @team-antioch/sc2-music-finder extract` extracts the ids again, for instance after a game patch.

Options:

- `--audio <folder>`: your Audio folder, to play the tracks (see below).
- `--port <n>`: another port (`0` for any free one).
- `--budget <dollars>`: the session's spend cap on Jev, $1.00 by default.
- `--tick-log <folder>`: logs every tick to `<folder>/ticks.jsonl`, for the test asks.
- `--open`: opens the page in your browser.

`login` asks for your TypeSafe key and saves it in your config folder (the same key file the Doodad Finder uses), and `logout` deletes it. Or set `TYPESAFE_API_KEY`. With no key every ask is narrowed only. What a ranked ask costs and how the cap works are in the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#ranking-with-jev). The Music Finder sends Jev the ask, your tags and each candidate's card text (its id, listening notes and ratings), never audio.

## Using the page

1. **Ask** for what the scene needs. Cards come from the narrowing as you type.
2. **Filter** with the tags above the results: energy, tension and valence (1 to 5), length, kind and faction, and the dependencies your map has. Pin a tag to keep only cards that have it.
3. **Listen**, if you gave `--audio`. Click a section's time on a card to play from there, or set an in-point.
4. **Tick** a card to put it in the tray. **Copy** gives its id, the in-point and what your map must depend on, such as `Space_1_FULL (from 0:38, needs Void (Campaign))`. **Copy all** gives every id, then each dependency once.

**Reading a card.** A card is an id a map can play, a Soundtrack or a Sound, not a file: an id can play one file or several, and the card lists each with its own notes. The ratings (energy, tension, valence) are Gemini's, from listening to the file, and the length is measured. "Blizzard used it in" says where the game's own scripts name the id. A badge says which map dependency brings the id in (`needs Void (Campaign)`). Silent ids, sound effects and ids that only exist inside one of Blizzard's maps are hidden until you tick "Show silent, unplayable and map-local ids".

**The notes are a model's hearing.** Gemini listened to each file with no file name, game or context and wrote what it heard. That is a good first draft, not a source, and it is sometimes wrong, or takes a sound effect for music. Trust your own ears, and send a correction ([CONTRIBUTING](https://github.com/TeamAntioch/sc2-asset-catalog/blob/main/CONTRIBUTING.md)).

## Getting the music files (the Audio folder)

The page plays only files you extracted from your own StarCraft II install. It wants the music `.ogg` files, about 770 of them, 1.05 GB. Put them in one folder, in any layout: the page finds each file by its base name, such as `p07cinepart02`. A symbolic link to a file counts as that file, whatever it points at, so give `--audio` only a folder you trust. A card whose file isn't in the folder says "not in your Audio folder". The few `.wav` files the game uses as short sound effects don't play.

### macOS (tried by hand)

You need Xcode's Command Line Tools (`xcode-select --install`) and [cmake](https://cmake.org/) (`brew install cmake`). Make a folder to work in, then build [CascLib](https://github.com/ladislav-zezula/CascLib) and our 60-line extractor, `cascx`:

> The `curl` below fetches the extractor from `main`, so it works only once the Music Finder is merged there. Until then, copy `scripts/extract-music/cascx.cpp` from the pull request's branch. (Delete this note once it is on `main`.)

```sh
mkdir sc2music && cd sc2music
git clone --depth 1 https://github.com/ladislav-zezula/CascLib.git casclib
cmake -S casclib -B casclib/build -DCMAKE_POLICY_VERSION_MINIMUM=3.5 -DCASC_BUILD_STATIC_LIB=ON -DCASC_BUILD_SHARED_LIB=OFF
cmake --build casclib/build
curl -LO https://raw.githubusercontent.com/TeamAntioch/sc2-asset-catalog/main/scripts/extract-music/cascx.cpp
c++ -O2 -std=c++17 -I casclib/src cascx.cpp casclib/build/libcasc.a -lz -o cascx
```

Then list what's there, and extract it:

```sh
./cascx "/Applications/StarCraft II" list "*Music*.ogg"
./cascx "/Applications/StarCraft II" extract "*Music*.ogg" audio
```

The list ends with a count, `772 files`, and the extraction writes them under `audio/`: about 1.05 GB, a few seconds on an SSD. If StarCraft II is somewhere else, give the folder that holds `StarCraft II.app` and `SC2Data`. Start the page with it:

```sh
npx @team-antioch/sc2-music-finder --audio audio --open
```

It says how many files it found ("Playing from your Audio folder: 767 files": five names are in the install twice, and the first of each is used). Tried with CascLib at commit `6b889ec` (2026-10-25) and the Battle.net app's StarCraft II, on an Apple silicon Mac. The CascLib build takes a few seconds, and the whole process less than a minute.

### Windows (not yet tried on Windows)

These directions come from the tools' own documentation, not from a run on Windows. Ticket [#706](https://github.com/TeamAntioch/sc2-adjutant/issues/706) has someone check them on a Windows machine, and this section will say so once it's done. If you try them first, tell us what happens.

The easy way, if it works: [stormex](https://github.com/Talv/stormex/releases/latest), a command-line CASC extractor with a prebuilt Windows download (v2.2.0, from 2019: it reads an install through an older CascLib than the one above, so it may not open a current one). Unzip it, then in a terminal:

```powershell
.\stormex.exe -S "C:\Program Files (x86)\StarCraft II" -I "music.*\.ogg$" -l
.\stormex.exe -S "C:\Program Files (x86)\StarCraft II" -I "music.*\.ogg$" -x -o C:\sc2music
```

The first command should list about 772 files. `-I` is stormex's case-insensitive include pattern, and `-o` is the output folder. Then start the page with `npx.cmd @team-antioch/sc2-music-finder --audio C:\sc2music --open`.

If stormex can't open the install, build `cascx` instead: install the Visual Studio Build Tools with the C++ workload and [cmake](https://cmake.org/download/), build CascLib with the same `cmake` commands as above, compile [`cascx.cpp`](https://github.com/TeamAntioch/sc2-asset-catalog/blob/main/scripts/extract-music/cascx.cpp) (it has a Windows branch) against `casc_static` and zlib, and run the same `list` and `extract` commands.

### Linux

`cascx` builds as it does on macOS, with your compiler and zlib's development files. Not tried.

## Notes for new tracks

After a game patch adds music, the new files have ids but no listening notes, so they search by their names only. [`scripts/music-notes/`](https://github.com/TeamAntioch/sc2-asset-catalog/tree/main/scripts/music-notes) in the repo measures and describes new files from your Audio folder and adds their notes, ready for a pull request.

Not affiliated with or endorsed by Blizzard Entertainment. MIT License; the listening notes it reads are CC BY 4.0.
