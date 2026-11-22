# Glossary

**Doodad.** A placeable prop or piece of scenery in the StarCraft II Editor: a CActorDoodad with a model, known by its id (such as `DOM_Crate`).

**Description.** Our words for what a doodad looks like and suits: its look, kind, size, role, story, biome and, where it has one, its state. Written from a picture of it. Descriptions ship in `data/doodad-descriptions.json`, under CC BY 4.0.

**Doodad Use.** What a doodad has worked as, in a mapper's words, with the variation and scale that made it work, when they mattered: "square, heavy press head over a conveyor belt". Often something its name doesn't suggest. Doodad Uses ship in `data/doodad-uses/`, under CC BY 4.0. They never name a map, campaign or story.

**Extracted fields.** A doodad's facts from the game: its Editor name, package, categories, tilesets, variations, model file, whether it blocks ground, and its gallery picture's file name. They're built into the user's cache folder from SC2GameData and the gallery's file list on the Finder's first start (or by `extract`), and never ship.

**Cliff set.** A tileset's cliff walls, known by its id (such as `AgriaCliff0`). A tileset lists its cliff sets in order, the first its natural cliff. Its description (look, kind, tone and the ground it pairs with) ships in `data/cliff-descriptions.json`, and its tilesets and gallery picture are extracted by `extract-cliffs`.

**Terrain texture.** One of the ground textures a tileset blends, known by its id (such as `AgriaDirt`). A tileset lists its blend textures in layer order. Its description (look, kind, tone and the roles it suits) ships in `data/texture-descriptions.json`, and its tilesets, file, name and gallery picture are extracted by `extract-textures`.

**Decal description.** Our words for one variation of a decal doodad: its look, what it shows, its glyphs and the text it reads, its shape, whether it tiles end to end, and its use. A variation whose use is a marking or ornament, with no number, letter or words, can go anywhere. A label, sign or emblem goes only where it means something. Decal descriptions ship in `data/decal-descriptions.json`, under CC BY 4.0. Each variation's texture and box in cells are its extracted fields, read by `extract-decals` from a folder the user extracted from their own install.

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

**Cinematic set.** One of the pre-built locations Blizzard's campaign cutscenes are filmed in: a cluster of scenery in a Cutscene Editor file, with its own cameras, such as a ship's bridge or an asteroid field. Known by its set id.

**Set look.** Our words and measurements for a cinematic set: its kind, what the place looks like, its facets, what it could stand in for, the pictures that show it best and its size and camera count. An agent wrote the words from pictures of the set. Set looks ship in `data/set-looks.json`, under CC BY 4.0; the pictures are linked from the gallery.

**Layer.** For a host such as sc2-adjutant: sets of its own, with their looks and where their pictures are, laid over the published sets in the Set Finder. A set with an id already there replaces it.
