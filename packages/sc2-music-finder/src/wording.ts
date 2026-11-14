// Every word the Music Finder's ranker sends about how to judge (docs/adr/0001), in one place to audit
// and edit: the four levels Jev grades on, word for word, and its state note and Score question.
// Decisions on the answers (the order, the provided raise) stay in code, in the kit's ranker.

/** The four levels, from 0 to 3. Each reads as a situation on its own; Jev is sent these words. */
export const LEVELS = [
  "Doesn't fit: this track would work against the scene. Its mood, energy or setting is wrong for what was asked.",
  "Related but wrong: it shares a mood or palette with the scene, but it does a different job, such as a victory sting where a tense bed was asked for.",
  "Could work with an edit: its mood is right, but only from the right point, trimmed, looped or layered under something else would it suit the scene.",
  "Reads as exactly this: played as it is, from its start, it suits the scene.",
] as const;

/** What the state says the ask is about: a fact a model may lack. */
export const ABOUT =
  "The author is scoring a StarCraft II map or cutscene and is looking for music: tracks from the game's own soundtrack, each described from listening to it. " +
  "`ask` is what the scene needs, in their words. `object` is the scene it belongs to, when they have named one. " +
  "`tags` are facets of tracks they have already picked, which they like but don't require, or limits they have set.";

/** Jev's Score question, asked once per candidate with the candidate's card beside it. */
export const JEV_QUESTION = "How well does `track` suit what `ask` needs?";

/** Everything Jev is told about music, for the kit's ranker. */
export const JEV_WORDING = { about: ABOUT, question: JEV_QUESTION, field: "track", levels: LEVELS } as const;

/** A level's short name: the level's words before the colon. */
export const levelName = (level: number): string => {
  const words = LEVELS[Math.min(LEVELS.length - 1, Math.max(0, Math.round(level)))]!;
  return words.slice(0, words.indexOf(":")).toLowerCase();
};
