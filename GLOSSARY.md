# Glossary

**Doodad.** A placeable prop or piece of scenery in the StarCraft II Editor: a CActorDoodad with a model, known by its id (such as `DOM_Crate`).

**Description.** Our words for what a doodad looks like and suits: its look, kind, size, role, story, biome and, where it has one, its state. Written from a picture of it. Descriptions ship in `data/doodad-descriptions.json`, under CC BY 4.0.

**Doodad Use.** What a doodad has worked as, in a mapper's words, with the variation and scale that made it work, when they mattered: "square, heavy press head over a conveyor belt". Often something its name doesn't suggest. Doodad Uses ship in `data/doodad-uses/`, under CC BY 4.0. They never name a map, campaign or story.

**Extracted fields.** A doodad's facts from the game: its Editor name, package, categories, tilesets, variations, model file, whether it blocks ground, and its gallery picture's file name. They're built into the user's cache folder from SC2GameData and the gallery's file list on the Finder's first start (or by `extract`), and never ship.

**Stock catalog.** The descriptions and Doodad Uses joined to the extracted fields by doodad id: what the Finder searches by default.

**Gallery.** The doodad pictures in [sc2-mapping-reference](https://github.com/TeamAntioch/sc2-mapping-reference), one angle each, with a Marine for scale. Cards link them by URL.

**Sheet.** A doodad's 2×2 reference picture: its first variation from four sides, rendered on the user's machine. Optional, and never shared.

**Ask.** What the mapper types into the Finder: a doodad or a part of an object, in plain words.

**Narrowing.** The Finder's first step for an ask, on the user's machine: the keyword search and the embeddings search, about 100 candidates each, merged into about 200.

**Ranker.** What orders the narrowed candidates by how well each fits the ask, on four levels from "doesn't fit" to "reads as exactly this". Jev, TypeSafe AI's System One model, is the only one.

**Card.** A candidate as the Finder shows it, and the few lines of its text that the embeddings model embeds and the ranker reads.

**Tray.** The cards ticked this session, whose ids and dependencies the mapper copies into the Editor.

**Tick log.** An opt-in file (`--tick-log`) of every ask cards were ticked from and the ids ticked: test cases for the test command.

**Test asks.** `test-asks.json`: typical asks, each with the doodads it should find, which the test command runs. An ask is `reviewed` once its expected doodads have been checked by hand.

**Dependency.** The map dependency a doodad's package needs, such as `Void (Campaign)`: the Editor shows a doodad only when the map depends on the package that defines it.

**Listening notes.** Our words and measurements for a music file: what it sounds like (description, mood, tension, valence, timestamped sections, what it suits) and what we measured of it (duration, energy, loudness, tempo). Gemini wrote the words from the audio, and a person's correction replaces them. Listening notes ship keyed by file base name, under CC BY 4.0. The audio never does.

**Audio folder.** A folder of the game's music `.ogg` files that the user extracted from their own install and gave the Music Finder with `--audio`. Files are matched by base name, wherever they sit in the folder. Without one, cards still search and say how to hear them.
