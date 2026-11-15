// Every word the Doodad Finder's ranker sends about how to judge (docs/adr/0001), in one place to audit
// and edit: the four levels Jev grades on, word for word, and its state note and Score question. Decisions on the answers (the order, the provided raise)
// stay in code, in ranker.ts.

/** The four levels, from 0 to 3. Each reads as a situation on its own; Jev is sent these words. */
export const LEVELS = [
  "Doesn't fit: this doodad is not the thing asked for and could not stand in for it.",
  "Related but wrong: it shares a theme, material or setting with the ask, but it is a different kind of object.",
  "Could work with dressing or scale: it could play the part once scaled, tinted, turned or combined with other doodads.",
  "Reads as exactly this: placed as it is, it reads as the thing asked for.",
] as const;

export const TOP_LEVEL = LEVELS.length - 1;

/** What the state says the ask is about: a fact a model may lack. */
export const ABOUT =
  "The author is building a StarCraft II map and is looking for doodads (placeable props and scenery models) for one part of an object. " +
  "`ask` is what they typed. `object` is the object the part belongs to, when they have named one. " +
  "`tags` are facets of doodads they have already picked, which they like but don't require.";

/** Jev's Score question, asked once per candidate with the candidate's card beside it. */
export const JEV_QUESTION = "How well does `doodad` fit what `ask` asks for?";

/** Everything Jev is told about doodads, for the kit's ranker. */
export const JEV_WORDING = { about: ABOUT, question: JEV_QUESTION, field: "doodad", levels: LEVELS } as const;
