// Every word the Set Finder's ranker sends about how to judge (docs/adr/0001), in one place to
// audit and edit: the four levels Jev grades on, word for word, and its state note and Score
// question. Decisions on the answers (the order) stay in code, in the kit's ranker.

/** The four levels, from 0 to 3. Each reads as a situation on its own; Jev is sent these words. */
export const LEVELS = [
  "Doesn't fit: this set is not the kind of place asked for and could not pass for it.",
  "Related but wrong: it shares a faction, mood or setting with the ask, but it is a different kind of place.",
  "Could work with staging: it could play the place with the right camera angles, one part of it, or some redressing.",
  "Reads as exactly this: filmed as it is, it reads as the place asked for.",
] as const;

/** What the state says the ask is about: a fact a model may lack. */
export const ABOUT =
  "The author is staging a StarCraft II cutscene and is looking for a set to film it in: a location already built from 3D models, with its own cameras. " +
  "`ask` is the place they typed. Each `set` is one set's description, written from pictures of it. " +
  "`tags` are facets of sets they have already picked, which they like but don't require, or limits they have set.";

/** Jev's Score question, asked once per candidate with the candidate's card beside it. */
export const JEV_QUESTION = "How well does `set` fit the place `ask` asks for?";

/** Everything Jev is told about sets, for the kit's ranker. */
export const JEV_WORDING = { about: ABOUT, question: JEV_QUESTION, field: "set", levels: LEVELS } as const;

/** A level's short name: the level's words before the colon. */
export const levelName = (level: number): string => {
  const words = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))]!;
  return words.slice(0, words.indexOf(":")).toLowerCase();
};
