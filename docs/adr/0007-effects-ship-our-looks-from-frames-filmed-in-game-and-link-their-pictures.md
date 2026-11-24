# Effects Ship Our Looks, Written From Frames Filmed in Game, and Link Their Pictures

An effect model is one of the `.m3` files under `Assets/Effects`: the impacts, beams, charge-ups, auras and flares an actor plays. A mapper picks one by how it looks, but the game names them by what they were made for (`ZealotWeaponImpact`, `PsionicShadowCast`), and the Editor's preview draws a model's meshes but not most of its particles, which are most of what an effect is. `docs/effects-gallery.md` weighs the options. The effect library says what each one looks like.

**Ships, under CC BY 4.0, in `data/effect-looks.json`:** for each effect model, what we wrote, keyed by the model's path in the game's data (`Assets/Effects/Protoss/Blink/Blink.m3`), the path an actor or a CModel names it by.
- **What we filmed.** sc2-adjutant's effect tour attaches each effect to a Marine on plain ground in the game, records the game window, and takes stills part way through its Birth, Stand and Death, after its host has slid sideways, and half a second after it is destroyed outright.
- **What we wrote.** An agent looked at a contact sheet of those frames (the recording's frames where most changed, and the stills) and wrote its look: kind, look, colours, size next to the Marine, whether it follows a moving host and whether anything lingers after it is destroyed, search facets, what it suits, how confident it is and what is wrong with its frames.

**Never ships:** anything read from the model: its animations and their lengths, its emitters, ribbons and lights, its textures, its bounds. Its path is the only key.

**Pictures are linked, not shipped.** Each effect's picture, the frame with most on screen, is in sc2-mapping-reference under `public/effects/`, at the model's path with `.jpg` for `.m3`, with a `_tn` thumbnail of its middle half. `effectPictureUrl` gives the address, as `setPictureUrl` does for the sets.

## Considered Options

- **Read the facts from each model, on the user's machine, as the decals do (ADR-0006).** Particle counts, world space and lifetimes answer some questions ("does it stay where it was cast?"), and the write-up's plan has them as a later step. They don't say what an effect looks like, which is what a mapper searches for, and they need a model reader for the particle records that the package doesn't have yet.
- **Describe effects from their names.** Cheap, and often close, but a name says what an effect was for, not its colour, shape or size, and about one model in thirteen shows nothing on its own (104 of 1,313 in the first run).
- **Ship the frames or the recording in the package.** No network for pictures, but hundreds of megabytes of footage of Blizzard's models in an npm package. The site already serves the doodad and set pictures.
