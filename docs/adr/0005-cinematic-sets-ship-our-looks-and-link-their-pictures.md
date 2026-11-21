# Cinematic Sets Ship Our Looks and Measurements, and Link Their Pictures

The cinematic sets are the pre-built locations Blizzard's campaign cutscenes are filmed in: clusters of scenery in a Cutscene Editor file, such as a ship's bridge, a throne room or an asteroid field (sc2-adjutant#796). A mapper staging a cutscene wants to find one by asking for a place in plain words, as with doodads and music.

**Ships, under CC BY 4.0, in `data/set-looks.json`:** for each set, what we wrote and what we measured.
- **What we wrote.** An agent looked at pictures of the set (Blender renders of its pieces where the file puts them, and frames filmed in game) and wrote its look: kind, look, facets, what it could stand in for, the places in it, which pictures the look rests on, how confident it is, and what is wrong with the pictures.
- **What we measured.** Its size in cells and its camera count, from the file.
- **Keys.** Its name and the Cutscene Editor files it is in, as paths in the game's data. These are what find it in the game, the way a doodad id or a music file's base name does.

sc2-adjutant's `export-sets` writes the file. It only writes sets every one of whose files is Blizzard's, so a set made from a campaign's own files never ships here.

**Never ships:** the marks and model names read from the files, the cameras' names, lights, and anything else extracted from the game.

**Pictures are linked, not shipped.** Each set's card pictures, their frames filmed in game, its plan and its overview are in sc2-mapping-reference under `public/sets/<set id>/`, with `_tn` thumbnails. `setPictureUrl` gives their address, as `DOODAD_GALLERY_URL` does for the doodads. A picture of the same view filmed in game is `-game` before `.jpg`, and a look's picture says `inGame` where one is there.

## Considered Options

- **Extract the sets from the game's data on first start, as for doodads and music.** It would need the Cutscene Editor file reader, the set clustering and the Blender renders. Those live in sc2-adjutant, and the renders are what the looks were written from. The few measurements a card shows are cheaper to ship than that pipeline.
- **Ship the marks and models too.** They help a search ("staged with Artanis"), but they are the game's names read from its files. The looks already say who and what a set is built for, in our words.
- **Ship the pictures in the package.** No network for pictures, but about 30 MB of renders of Blizzard's models in an npm package. The site already serves the doodad pictures.
