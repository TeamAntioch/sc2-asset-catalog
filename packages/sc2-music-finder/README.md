# @team-antioch/sc2-music-finder

Ask for StarCraft II music in plain words and see cards of the game's tracks at once: a local page that narrows each ask with a keyword search and a local embeddings model over the track's listening notes, then ranks the candidates with Jev (optional: save a TypeSafe key with `npx @team-antioch/sc2-music-finder login`, or set `TYPESAFE_API_KEY`).

```sh
npx @team-antioch/sc2-music-finder --open
```

On Windows, type `npx.cmd` in place of `npx`, and install the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist) first if the machine doesn't have it: the embeddings model needs it. Ctrl-C stops the Finder.

The first start extracts the game's music ids (1,354 of them) from a mirror of its data into your cache folder and downloads the embeddings model. `npx @team-antioch/sc2-music-finder extract` extracts again. `login` asks for your TypeSafe key and saves it in your config folder (the same key file the Doodad Finder uses), and `logout` deletes it. Options: `--audio <folder>`, `--port <n>` (4635 by default), `--budget <dollars>` (Jev's spend cap per session, $1.00 by default), `--tick-log <folder>`, `--open`.

**Hearing the tracks.** Cards say what each track sounds like, from its listening notes, and play only if you give `--audio` a folder of the game's music `.ogg` files that you extracted from your own StarCraft II install. The page finds each file by its base name, wherever it sits in the folder. A symbolic link to a file counts as that file, whatever it points at, so give `--audio` only a folder you trust. No audio ships with this package.

**What a card is.** An id a map can play, a Soundtrack or a Sound, with the notes of the files it plays, the dependency it needs (`needs Void (Campaign)`), where Blizzard's scripts use it and its sections: click a section's time to play from there, set an in-point on the card, and the tray copies `Space_1_FULL (from 0:38, needs Void (Campaign))`. The filters (energy, tension, valence, length, kind, faction, the dependencies your map has) are tags pinned above the results. Silent ids, sound effects and ids that only exist inside one of Blizzard's maps are hidden until you tick "Show silent, unplayable and map-local ids".

The full README, with step-by-step directions for extracting the music files on macOS and Windows, comes with the next release. See the [repo's README](https://github.com/TeamAntioch/sc2-asset-catalog#readme) for the TypeSafe key, what each ask sends, the cost and the cap, and the cache folders.

Not affiliated with or endorsed by Blizzard Entertainment. MIT License; the listening notes it reads are CC BY 4.0.
