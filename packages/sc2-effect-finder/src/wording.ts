// Every word the Effect Finder's ranker sends about how to judge (docs/adr/0001), in one place to
// audit and edit: the four levels Jev grades on, word for word, and its state note and Score
// question. Decisions on the answers (the order) stay in code, in the kit's ranker.

/** The four levels, from 0 to 3. Each reads as a situation on its own; Jev is sent these words. */
export const LEVELS = [
  "Doesn't fit: this effect looks nothing like what was asked for.",
  "Related but wrong: it shares a colour, an element or a purpose with the ask, but it would look wrong in its place.",
  "Could work: with a different colour, scale or timing in the Editor, or as one part of a combination, it could play what was asked.",
  "Looks exactly like this: used as it is, it reads as the effect asked for.",
] as const;

/** What the state says the ask is about: a fact a model may lack. */
export const ABOUT =
  "The author is making a StarCraft II map and is looking for an effect model to put on an actor: an impact, a beam, a missile, an aura, a flash, a glow, a ground marker or the like, made of particles, ribbons, lights and meshes. " +
  "`ask` is what they typed. Each `effect` is one effect's description, written from frames of it filmed in the game on a Marine, which is its scale. " +
  "`tags` are facets of effects they have already picked, which they like but don't require, or limits they have set.";

/** Jev's Score question, asked once per candidate with the candidate's card beside it. */
export const JEV_QUESTION = "How well does `effect` look like what `ask` asks for?";

/** Everything Jev is told about effects, for the kit's ranker. */
export const JEV_WORDING = { about: ABOUT, question: JEV_QUESTION, field: "effect", levels: LEVELS } as const;

/** A level's short name: the level's words before the colon. */
export const levelName = (level: number): string => {
  const words = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))]!;
  return words.slice(0, words.indexOf(":")).toLowerCase();
};
