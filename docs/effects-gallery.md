# An effects gallery: options and a plan

Status: proposal, nothing built. Written 2026-11-23.

## The problem

Mappers pick StarCraft II effect models (charge-ups, impacts, auras, beams) from file names, because nothing shows what one looks like. A campaign team found out what that costs:

- **The Yamato charge-up looked right in a still, and was wrong in play.** It trailed behind a charging unit, and after a plain `Destroy` it left a glowing spot.

  The team put this down to world-space particles. The file says otherwise. Read from the install on 2026-11-23, `YamatoMissileCharge.m3` has 6 particle systems and 5 ribbons, all old versions (`PAR_` v12, `RIB_` v6), and none has the world-space flag set. Its one animation is a 3.5 s Stand that plays once.

  World-space emitters are in the Yamato missile (1 of 5) and its impact (6 of 9), and they're the norm, not the exception: 1,536 of the 2,043 effect files have at least one. So the trail came from another model or from how the actor was set up. The in-game test film agrees: the charge-up moved with its host and left nothing behind after a plain Destroy. Either way, a card has to show it, not leave it to be guessed.
- **Another effect never drew,** because its CModel named a parent template with a typo in it.

Neither failure shows in a picture of the model. The first is a flag inside the `.m3`. The second is in the game's data, not the model.

The doodad side has pictures, contact sheets and a search by description. Effects have nothing. There are **1,398 `.m3` files under `Assets/Effects/`** in sc2-adjutant's `packages/core/data/game-models.json`: Protoss 483, Terran 391, Zerg 357, Other 52, Neutral 47, LensFlares 42 and Glaze 26.

A worked example used throughout: `Assets/Effects/Terran/YamatoMissileCharge/YamatoMissileCharge.m3`.

- It is the CModel `BattlecruiserYamatoAttackChargeModel` (`parent="OneShotSpellFX"`, liberty.sc2mod `ModelData.xml`), and `OneShotSpellFX`'s parent is `FX` (core.sc2mod).
- Its actor has the same id: `CActorModel BattlecruiserYamatoAttackChargeModel parent="ModelAddition"`, attached at `SOpAttachCustomA`.
- The actor is created on `Abil.Yamato.SourcePrepStart` and destroyed on `SourcePrepStop` with a plain `Destroy`.

## What a mapper needs from a card

1. **What it looks like while it plays:** its start, its loop and its end, in the game's own renderer.
2. **What it does that no picture shows:** whether its particles or ribbons stay in the world when the host moves or the effect is destroyed, whether it has Birth, Stand and Death animations and how long each is, whether it loops, how big it really is, and whether it lights its surroundings.
3. **Where Blizzard uses it**, so it can be found from a known moment ("the Battlecruiser's Yamato charge"), and its CModel id and template to copy.
4. **A search by description** ("blue electric charge-up", "green acid splash on the ground").

No single source gives all four. The options below each cover part of it.

## Option 1: film the effects in the game

A generated test map spawns each effect in turn, under a fixed camera and lighting, and the existing capture tour photographs it.

### What sc2-adjutant already has

- **`capture_shots`** (sc2-adjutant `packages/core/src/capture/shots.ts`, `stop-tour.ts`, `capture-copy.ts`):
  - It copies the map and replaces its triggers with a generated Galaxy tour.
  - At each stop the tour moves the camera, waits 2 s to settle, announces the stop by writing the bank `ExTour`, and holds 2.5 s.
  - The host polls the bank and screenshots the game window: `screencapture -l` on macOS, Windows.Graphics.Capture on Windows.
  - Frames are 1600×900 JPEGs, written to `Library/Caches/sc2-adjutant/shots/<name>/` with a `shots.json`.
  - A call takes at most 99 shots. The tour script holds up to 1024 stops.
  - The game starts through the Editor's Test Document (the only way on macOS), which takes about 1 to 2 minutes. Each stop after that takes about 4.5 s.
- **The cinematic-set contact sheet** (`src/cutscene/contact-sheet.ts`, `src/capture/set-capture.ts`) is the closest precedent. It generates a map that plays something, announces each shot in its own bank (`CsSheet`), is screenshotted by the same host code, writes an `index.html` sheet and flags frames under 50 KB as dark.
- **The facing strip** (`src/dressing/facing-strip.ts`) generates a grid map from a Blueprint, about 300 doodads to a map. It is read back from the Editor's save, not filmed, so only its layout carries over.
- **`capture_composite`** is not a capture tool. It records a Doodad Composite from an Editor region, and has nothing to offer here.

Neither tool records clips. The host takes a still at each bank write. The only video in the docs is recording by hand with OBS or ⌘⇧5.

### What would be new

An **effect tour**: a generated map whose script does what the contact sheet does, but with models.

- **The map:** flat, mid-dark ground with a few small spawn pads spread apart, fog and black mask off, a fixed Light, and one scale marker (a Marine, or a 1-cell grid decal) beside each pad. Additive effects vanish on bright ground and dark ones on black, so the ground is a mid-dark grey. A second pass on light ground is possible later.
- **Spawning:**
  - Galaxy's `ActorCreate` (it is in core's `trigger-libraries.json`) creates the effect's own stock actor where one exists, else a plain model actor with the CModel id as its content.
  - The capture copy deletes the map's triggers, so this has to be the generated script itself, as the contact sheet does it, not map triggers.
  - Effects are spawned at the pads round-robin, so one effect's lingering particles don't spoil the next one's frames.
- **Several frames per effect, timed from the model's own animations** (Option 2 reads them):

  | Frame | When | What it shows |
  | --- | --- | --- |
  | `birth` | about half way through Birth, if it has one | the build-up |
  | `stand` | about 1.5 s into Stand | the loop |
  | `moving` | after the effect, attached to an invisible mover, has travelled a few cells sideways | whether it trails |
  | `after-destroy` | 0.5 s after a plain `Destroy` | whether it lingers |
  | `death` | about half way through Death, if it has one | the end |

  A one-shot (no Stand, `not_looping`) gets frames at a quarter, a half and three quarters of its length instead. The `moving` and `after-destroy` frames are the campaign team's two failures, photographed. They are what make this option worth its cost.
- **Scale:**
  - The model isn't scaled. Each stop's camera is fitted to the model's MODL bounds, read from the `.m3`, with a margin of about 2.
  - Bounds don't include particles: at a margin of 1.5, most of the 174 doodad thumbnails that still touched the frame edge were effects. So the fit also grows with the particles' reach (emit speed × lifespan, plus the emitter's size), from Option 2.
  - The scale marker keeps the true size readable, and the card states the bounds in cells.
- **Team colour:** every effect is created for one player with a fixed colour that no stock effect uses as its own, such as player 1 in light pink. The card says which parts take team colour; Option 2 reads that from the lights' and materials' team-colour flags. One pass in one colour is enough; a second colour would double the run for little.
- **Timing and batches:**
  - Shots per effect: about 1,240 effects have a stock CModel and would be filmed, at about 4 frames each, which is about 5,000 shots.
  - Time per stop: with the settle shortened to what an effect needs (it doesn't scroll the camera far), about 3 to 4 s.
  - Batches: 99 shots per `capture_shots` call means about 25 effects per batch, so about 50 batches of 2 minutes of start-up plus 6 minutes of stops. That is about **7 hours of game time**, unattended but holding the Mac's screen.
  - One frame per effect (`stand` only) would take about 2 hours.
  - Raising the tour's shot limit for this tool (the script already takes 1024 stops) would cut the start-ups to about 6.
- **Clips (later, optional):** macOS `screencapture -V <seconds>` and Windows.Graphics.Capture can both record video, so the host could record a 3 to 4 s clip per effect instead of stills. That is new host code on both platforms, and about 5,000 short clips are far heavier to host than stills. The stills as a filmstrip (birth → stand → moving → after-destroy → death) give most of what a clip would.

**Effort:** about 1 to 2 weeks in sc2-adjutant: the map generator, the effect tour script, a stop schedule built from the model data, timing tuning, then the long runs and a pass over dark, blank or cropped frames. It needs a StarCraft II install and Screen Recording permission, and the runs take most of a day.

**Built and tested since (2026-11-23):** sc2-adjutant branch `adrianbw-effect-tour`, `npm run effect-tour` (`base`, `make` and `capture`).

- **The run:** 1,313 effects (Glazes left out), 4,961 frames in 11 batches of 120. About 4 h 20 min in game, plus 1–2 minutes to start each batch.
- **Map and host:** a flat 256×256 map with the pad at its centre, the effect attached to a Marine, and the camera fitted to the effect's bounds at a margin of 1.3, between 6 and 70 cells away.
- **Frames:** each frame is held 1.5 s. Death is played with `AnimPlay`, because stopping the generic actor's animation bracket removes it at once.
- **No freeze:** holding the game still for each frame (`GameSetGlobalTimeScale(0)`) loses frames, because the game doesn't write the bank while it is held. 15 of 38 frames were missed with it on, none with it off.
- **Where the files came from:** stormex (built locally) extracted the 2,043 effect files from the install in 5 seconds.

**What it shows:** what the effect really looks like, including particles, ribbons, lights, glow and animated materials, and its trailing and lingering in plain sight.

**What it doesn't show:** where Blizzard uses the effect, or why it lingers. And a frame can miss a one-shot's peak.

### Renderers that can't do this yet

- **Workbench renders in Blender** (hots-kitbash's `render.py`, sc2-adjutant's `render-set.py`, with m3studio) show meshes only. m3studio imports particles, ribbons and lights as properties on the armature, not as Blender particles or lamps (`io_m3_import.py:1273`, `:1310`, `:1391`), so nothing draws them. Converting M3 particles to Blender's own would only approximate the game.
- **WhiteoutFlakes,** the viewer behind the doodad thumbnails (about 0.3 s a model), lists SC2 effects as missing in its README. Its source has an SC2 particle and ribbon simulation in progress (`src/renderer/particle/sc2/`, and it reads the world-space flag in `sc2_compose.cpp`). If it lands, it could make offline turntables of effects in minutes instead of hours. That is worth checking again before the long game runs, but not worth waiting for.

## Option 2: read what's in each `.m3`

The `.m3` says most of what a picture can't. This package already reads `.m3` files: `packages/sc2-asset-catalog/src/catalog/m3.ts`, written for the decal catalog, reads the tag index, the MODL bounds, the texture paths and whether there is a projector. sc2-adjutant core has the same style of reader for sequences (`m3-sequences.ts`) and materials (`m3-footprint.ts`). Field layouts come from m3studio's `structures.xml` (in `sc2-research/tools/m3studio`).

What the card would get, and where each field is:

| Card fact | `.m3` source |
| --- | --- |
| **Particles stay in the world** (trail and linger) | each `PAR_` record's `additional_flags` bit `0x8` `world_space` (version 17 and up); a `world_space` uint32 in versions up to 14 |
| **Ribbons stay in the world** | each `RIB_` record's `additional_flags` bit `0x8` (version 8 and up); a `world_space` uint32 in version 6 and earlier |
| Particle count, emitter shape and type, particle type (billboard, ground, tail…) | `PAR_` `emit_max`, `emit_shape`, `emit_type`, `particle_type` |
| How far particles reach, and how long they live | `emit_speed`, `lifespan` (and their random ranges), `gravity`, `drag` |
| Particle colours | `color_init`, `color_mid`, `color_end` (BGRA defaults) |
| Ribbons | `RIB_` count, `ribbon_type`, `lifespan`, `length`, `cull_method`, `color_base`, `color_mid`, `color_tip` |
| **Lights its surroundings** | `LITE`: point or spot, colour, intensity, `attenuation_far`, the team-colour flag |
| **Birth, Stand, Death, and how long** | `SEQS`: name, `anim_ms_start` to `anim_ms_end`, `not_looping` flag, each animation's bounding sphere |
| Size | MODL `boundings`, plus particle reach |
| Textures and blend modes | `MAT_` layers → `LAYR` `color_bitmap`, `blend_mode` (additive, alpha…); flipbooks and `.ogv` video layers |
| Mesh or not | whether MODL has any geometry, which tells a pure-particle effect from a meshed one |

**One trap.** An emitter is often switched on for an animation by keys on `emit_rate` in that animation, with a default of 0. A reader that takes only defaults would call such an emitter dead. Reading which animations key each emitter's rate means walking `STC_` to its keyframe blocks, as m3studio's `io_m3_import.py` does in `key_fcurves` and `stc_id_data`. It is a few hundred lines, and it is what makes "particles only in Birth" readable.

`PAR_` exists in versions 10 to 24, and field offsets move between them. So the reader should take an offset table per version generated from `structures.xml`, not offsets written by hand.

**Where the files come from.** SC2GameData doesn't mirror `.m3` files. As for decals (ADR-0006), `sc2-asset-catalog extract-effects <folder>` would read a folder the mapper extracted from their own install with cascx (`Assets/Effects/**`, about 1,400 files). It would write the fields into the cache, never into the package. WhiteoutFlakes's `--save-m3` is another way to get the files out of the install, and sc2-adjutant's Host Adapters already run it.

**Derived warnings, which are the point:**

- "Particles stay where they're emitted: they trail behind a moving unit, and keep glowing for up to *N* s after a plain Destroy. Hold its position, or let it play its Death." *N* is the longest world-space lifespan.
- "No Death animation: Destroy cuts it off at once."
- "One-shot, 1.2 s: it doesn't loop."
- "Lights the ground around it (radius *R*)."
- "Larger than its bounds: particles reach *R* cells."

**Effort:** about 3 to 5 days for the reader (indexed records, `PAR_`, `RIB_`, `LITE`, `SEQS` and materials with per-version layouts) and `extract-effects`, and 2 to 3 more for animated emitter rates. It takes seconds to run over all 1,398 files and needs no game.

**What it shows:** everything in the table, exactly.

**What it doesn't show:** what the effect looks like.

## Option 3: where the game uses each effect

The pinned SC2GameData mirror, which the catalog already reads on first start, has every CModel and actor.

- **CModel:** `ModelData.xml` in core, liberty, swarm, void, the three campaigns, the three story campaigns and novastoryassets. Read the `Model` path, the `parent` and `EditorCategories`, and resolve parents to their templates (`FX` → `LaunchFX`, `MissileFX`, `ImpactFX`, `OneShotSpellFX`, `PersistentSpellFX`, `BuffFX`, and the `Race…` forms).
- **Actors:** `ActorData.xml` in the same folders. A CModel is used:
  - by an actor that names it (`<Model value=…>`, `ImpactModel`, `LaunchModel`, `ImpactMap … Model=`, `Host Subject=`);
  - or, **implicitly, by an actor with the same id**, as the Yamato charge shows: its actor has no `Model` field.
- **Unit, ability and event:** the actor's `On Terms` (`Abil.Yamato.SourcePrepStart`) and the unit it hosts on give the card's sentence: "Battlecruiser, Yamato Cannon, while preparing".

A first count, using a quick scan whose regex may undercount:

- about 2,840 CModels in those mods point at an `Assets/Effects` file, covering about 1,240 of the 1,398 files;
- about 1,000 of those files are reached by an actor in the same mods.

The rest have a CModel that only co-op, other mods or triggers use, or no CModel at all. Those can still be filmed by path.

**The template-typo check falls out of this.** A CModel whose `parent` resolves to no CModel in its dependency chain gets a warning on its card, and the same check belongs in sc2-adjutant's `check` for a map's own effect CModels. That check is where the campaign team's second failure would have been caught. The gallery only shows that stock models are fine.

**Effort:** about 2 to 4 days, beside the extractor that already reads doodads' ModelData and ActorData (sc2-adjutant's `build-doodad-models.mjs` already resolves parents and `##id##` tokens). The extra download is about 12 MB of XML. It needs no game.

**What it shows:** names, usage and the id to copy.

**What it doesn't show:** looks, and effects only triggers use.

## Option 4: where the gallery lives, the pictures and the search

### Placement

The finders and their catalog are here; the pictures are in sc2-mapping-reference. The effects gallery follows the same split.

- **The library (`@team-antioch/sc2-asset-catalog`):**
  - `data/effect-descriptions.json`, our own words, CC BY 4.0;
  - `extract-effects` for the `.m3` fields;
  - the CModel and actor fields read in `extract`;
  - a search over the cards.
- **The page:** an **Effect Finder**, a fourth finder on `sc2-finder-kit` beside the doodad, music and set finders. Cards show the filmstrip, the warnings, the usage line, the CModel id and parent, and the dependency it needs, with Copy as the Doodad Finder has.
- **The pictures:** sc2-mapping-reference `public/effects/<CModel id>/<frame>.jpg`, with `_tn` thumbnails, linked by URL. A site page can be added later beside its doodads page.

### Licensing

This repo is public, and so is sc2-mapping-reference. The rules this repo already keeps:

- **No game data ships** (ADR-0001). Names, packages and model files are extracted into each user's cache.
- **No pictures ship** (ADR-0005). Set pictures, including frames filmed in game, live in sc2-mapping-reference and are linked by URL. ADR-0005 turned down about 30 MB of renders in the npm package.
- **Fields read from Blizzard's `.m3` files don't ship** (ADR-0006). The decal catalog reads them from the user's own install.

For effects that means:

- The descriptions and warnings in our own words ship, under CC BY 4.0.
- The `.m3` fields (flags, colours, durations, textures) and the CModel and actor fields are extracted into the cache.
- The filmed frames are hosted beside the doodad and set pictures in sc2-mapping-reference, not in a package.

Screenshots of Blizzard's effects are the same kind of thing as the doodad pictures and the in-game set frames already published there, and they need the same "not affiliated with or endorsed by Blizzard Entertainment" notice. Whether that exposure is acceptable was settled for those pictures. Doing the same again is the author's call, not something this write-up can decide.

A warning such as "particles stay where they're emitted" is our sentence about a fact read from the file. It can ship as part of the description, as a decal's "tiles end to end" does.

**Size:** about 5,000 frames at 960×540 and about 60 KB each, plus thumbnails, is about 350 MB. That is less than the 880 MB of doodad pictures already there. Full 1600 px frames would be about 750 MB.

### Search by description

As the HotS skin gallery does it (`sc2-research/hots-gallery`):

1. Each effect's filmstrip and data card is shown to an agent.
2. The agent writes a description in fixed fields: a look (colour, shape, motion), a kind (charge-up, launch, missile, impact, aura or buff, beam, area, death, ambient), a size, its colours, and where it sits (ground, air, attached to a unit). That brief needs its own `PROMPT.md`.
3. The descriptions are embedded with gte-small, as every finder here already does, and Jev ranks them optionally.

The kind comes cheaply from the parent template (`ImpactFX` → impact, `MissileFX` → missile), so only the look needs eyes. At about 20 effects to a batch, 1,240 effects is about 60 agent batches, and it can only start once the frames exist.

## Comparison

| | Option 1: film in game | Option 2: read the `.m3` | Option 3: game data | Option 4: gallery and search |
| --- | --- | --- | --- | --- |
| Shows the look | **yes**, as the game draws it | no | no | presents 1 |
| Shows trailing and lingering | **yes**, as a picture | **yes**, as a flag and a time | no | presents 1 and 2 |
| Birth, Stand, Death, length | as frames | **exactly** | no | presents 2 |
| Where it's used, the id to copy | no | no | **yes** | presents 3 |
| Template typo | no | no | **yes** | presents 3 |
| Search by description | its frames feed it | its facts feed it | its kind feeds it | **yes** |
| Needs the game | yes, for hours | an extracted folder | no | no |
| Effort | 1 to 2 weeks, plus about 7 h of runs | 1 to 1½ weeks | 2 to 4 days | 1 to 2 weeks, plus descriptions |

## Recommendation

Build it in this order, so each step is useful alone and feeds the next:

1. **Options 3 and 2 first.** Together they make a card with no picture that already answers the campaign team's two questions:
   - "particles stay in the world for 3 s";
   - "parent template not found";
   - "used by the Battlecruiser's Yamato charge, `BattlecruiserYamatoAttackChargeModel`, `OneShotSpellFX`".

   They need no game, take seconds to run, and give Option 1 the timings, bounds and particle reach it needs to schedule and frame its stops.
2. **Then Option 1, with stills only:** the effect tour, with the five frames above (the `moving` and `after-destroy` frames are what this option adds). Run a 25-effect batch first to tune timing and framing, before the full run.
3. **Then Option 4:** the descriptions from frames and facts, the Effect Finder, and the pictures in sc2-mapping-reference.

Clips, a light-ground pass and WhiteoutFlakes turntables are possible follow-ups, not part of the first build.

## Rough plan

| Step | Where | What | Needs the game | Size |
| --- | --- | --- | --- | --- |
| 1 | this repo | ADR: effects ship our descriptions and warnings; `.m3` and game-data fields are extracted; pictures are linked | no | small |
| 2 | this repo | `m3.ts` grows a per-version record reader for `PAR_`, `RIB_`, `LITE`, `SEQS` and materials (layouts generated from `structures.xml`), with tests on a few real effect files the tests don't ship (read from `SC2_EXTRACTED`, skipped without it) | no | 3–5 days |
| 3 | this repo | `extract-effects <folder>` writes `effect-extracted.json` to the cache: each file's facts and derived warnings | no | 1–2 days |
| 4 | this repo | `extract` adds the CModels, parents and actor usage for `Assets/Effects` files, with the template-typo check | no | 2–4 days |
| 5 | this repo | the animated emitter rates (which animations switch each emitter on) | no | 2–3 days |
| 6 | sc2-adjutant | the effect tour: map generator, Galaxy script (spawn, move, destroy, bank-announced frames), a schedule from step 3's facts, capture through the existing host code | yes, a 25-effect test batch | 1–2 weeks |
| 7 | sc2-adjutant | **ask first:** the full run, about 50 batches and about 7 h, with a check of dark, blank or cropped frames | yes | a day |
| 8 | sc2-mapping-reference | **ask first:** the frames at 960 px and their thumbnails, about 350 MB | no | small |
| 9 | this repo | `PROMPT.md` and the description batches, then `data/effect-descriptions.json` | no | about 60 agent batches |
| 10 | this repo | `@team-antioch/sc2-effect-finder` on the kit, test asks and a README | no | 1 week |
| 11 | sc2-adjutant | `check` warns when a map's own effect CModel has a parent no dependency defines, or when an actor destroys a world-space effect without holding its position | no | 2 days |

Steps 1 to 5 stand alone, as a card with facts and no picture. Step 6 is the only new piece in sc2-adjutant, and steps 7 and 8 are the only large outputs: both wait for the author's go-ahead.

## Open questions

- Should the gallery cover only `Assets/Effects/**`, or also the meshed effects outside it (unit deaths under `Assets/Units`, and the doodads whose model is an effect)?
- Should Option 1 film co-op effects? They make up a lot of `Assets/Effects` but need the co-op mods loaded.
- Is one team colour enough, or does a card need to show which parts take it, in two colours?
- Should the Effect Finder be its own package, or a tab of the Doodad Finder? Effects are placed as doodads as well as through actors.
