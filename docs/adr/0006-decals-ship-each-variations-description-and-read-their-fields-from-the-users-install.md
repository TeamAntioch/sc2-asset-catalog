# Decals Ship Each Variation's Description, and Read Their Fields From the User's Own Install

A decal doodad has many variations, and they differ in what matters most: a plain stripe can go anywhere, but a painted number, letter or word promises it labels something, such as a bay or a lane. Scattered at random, it reads as noise. A doodad description (ADR-0001) is one per doodad, so it can't say which of a doodad's variations is which. The decal catalog says what every variation of every decal doodad shows.

**Ships, under CC BY 4.0, in `data/decal-descriptions.json`:** each decal doodad's variations, in variation order, each described by eye from its picture: its look, what it shows (from a fixed list), its glyphs (none, number, letter, words or alien script) and the text it reads, its shape, whether copies tile end to end, and its use (marking or ornament, which can go anywhere; label, sign or emblem, which go only where they mean something). `isScatterable` says which can go anywhere.

**Never ships:** what a variation's model file says: the texture its projector paints, its box in cells, and whether it is drawn as geometry instead of projected.

**Those fields come from the user's own install, not SC2GameData.** Most decals are projectors: a model with no geometry, only a box that paints one texture on the ground. The texture and the box are in the `.m3`, which SC2GameData doesn't mirror. So `sc2-asset-catalog extract-decals <folder>` reads a folder that the user extracted from their own install with cascx. It writes the fields to `decal-extracted.json` in the cache. With ImageMagick, it also builds a picture of each variation (its texture squeezed to its box, on mid-grey) and one numbered sheet per decal doodad. The step is optional. Without it every variation is still described and searched, only without its texture and size. `extract` still comes first, since it says which doodads are decals, how many variations each has and where its model is.

The package reads the few things it needs from an `.m3` itself (`m3.ts`: the tag index, the MODL bounds, the texture paths and the projector record).

## Considered Options

- **Describe decals in the doodad descriptions.** One `look` per doodad can't tell bay 3 from a plain stripe, and that is the whole point.
- **Ship the texture names and sizes.** They make a better card. But they are read from Blizzard's files, as the doodads' extracted fields are, and anyone with the game can read them.
- **Read the models straight from the install, without cascx.** That needs a CASC reader in the package, which is a much bigger piece than the decals need.
- **Let the caller pass its own model reader.** Then a mapper with only this package couldn't extract the fields.
