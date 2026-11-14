---
"@team-antioch/sc2-music-finder": patch
---

Fix what review found in the music tooling. `audio_measure.py` records an error for a file ffmpeg can't decode (not a length of 0) and retries failed files; `add-music-notes.mjs` rejects a length of 0, keeps a replaced note's `energy_measured`, reports Gemini's and the measurement's failures apart, and exits 1 when nothing was added; the test command counts an expected track no card plays against the hit rate and fails on it; `cascx` checks every write, refuses names that leave the output folder and fails on a truncated file; `gemini_describe.py` retries by status code and tolerates missing token counts; `essentia_tag.py` says once if the models' classes aren't the expected ones; the README pins the CascLib it was tried with; the pack check refuses the extractor and its source.
