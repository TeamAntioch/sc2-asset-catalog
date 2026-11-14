# Making listening notes for new music files

The Music Finder's notes (`packages/sc2-asset-catalog/data/music-notes.json`) cover the music files in the game as of the pinned game-data mirror. After a patch adds music, its files have ids but no notes, so they search by their names only. These scripts make a note for such a file from **your own copy of its audio**: one measures it, one has Gemini listen to it, and one adds the result to the notes for a pull request. They are repo tooling and aren't in any npm package.

## Before you start

- **The audio.** A folder (your *Audio folder*) of the game's music `.ogg` files, extracted from your own install: see "Getting the music files" in [the Music Finder's README](../../packages/sc2-music-finder/README.md#getting-the-music-files-the-audio-folder). It must hold the new files. It can hold only the new files.
- **Python 3.11 or later**, with `numpy` and `google-genai`, in a virtual environment, and `ffmpeg` and `ffprobe` on your PATH (`brew install ffmpeg` on macOS):

  ```sh
  python3 -m venv ~/.cache/sc2-music/venv
  ~/.cache/sc2-music/venv/bin/pip install numpy google-genai
  ```

  On Windows the interpreter is `venv\Scripts\python.exe`. Run every script with `-I`, as below: it stops Python importing code that sits beside the script or in the current folder.
- **A Gemini API key from a project with billing turned on.** Get one at <https://aistudio.google.com/apikey>.

## Send the audio to Google only knowingly

`gemini_describe.py` uploads your extracted copies of Blizzard's audio to Google. **Use a key from a billed project.** On Google's free tier, Google may use what you send to improve its products; a billed project does not (check Google's current terms for the Gemini API before you rely on that). The scripts never read a key from a file: give it in `GEMINI_API_KEY` for the one command, and never commit it. Nothing in this repo may hold a key or any audio.

## The three steps

Run these from the repo's top folder, with your Audio folder as `AUDIO` and a working folder for the two result files, kept outside the repo, as `OUT`:

```sh
PY=~/.cache/sc2-music/venv/bin/python

# 1. Measure: length, loudness, tempo estimate, where it peaks, fades. About a second a file.
$PY -I scripts/music-notes/audio_measure.py "$AUDIO" "$OUT/audio.json"

# 2. Listen: Gemini describes each file from the audio alone. Try a few first with --limit.
GEMINI_API_KEY=... $PY -I scripts/music-notes/gemini_describe.py "$AUDIO" "$OUT/gemini.json" --limit 3
GEMINI_API_KEY=... $PY -I scripts/music-notes/gemini_describe.py "$AUDIO" "$OUT/gemini.json" --workers 4

# 3. Add the notes for the files that don't have one yet.
node scripts/music-notes/add-music-notes.mjs "$OUT/gemini.json" "$OUT/audio.json"
```

Both Python scripts resume where they stopped, and `gemini_describe.py` retries the files that errored. A full run over the whole game (about 850 files) took under an hour and about 1.5 M input and 0.4 M output tokens with `gemini-flash-latest`. The prompt and the answer's schema are at the top of `gemini_describe.py`. The model gets only the audio, so a file's name can't lead it.

`add-music-notes.mjs` adds a note when Gemini listened to the file and step 1 measured it, and the notes have none for its base name. `--replace` puts the new note in place of an existing one, for a file you've listened to again (a correction you made by ear is better made by hand: see [CONTRIBUTING.md](../../CONTRIBUTING.md)). It writes the file in its layout (one note a line, in key order) and checks it against the schema when the packages are built (`npm run build`). Then `npm test`.

Read what Gemini wrote before you open the pull request. It is a model's hearing and is sometimes wrong, and a note never names a map, a campaign, a character or a story.

## A note's `energy_measured`

The notes shipped with the package have an `energy_measured`, a 1-5 score of loudness, onset density and brightness made over all the game's files at once. It can't be made for a few files, so new notes have none (the field is optional), and everything else about them is the same.

## The optional cross-check

`essentia_tag.py` tags files with Essentia's pretrained models. Its output isn't added to the notes, and the models are CC BY-NC-SA 4.0, so nothing from them ships. It is for checking Gemini's answers against a second opinion: set up `essentia-tensorflow`, download the models from <https://essentia.upf.edu/models> into a folder, and run it with `AUDIO`, that folder and an output file. Its header says which models.
