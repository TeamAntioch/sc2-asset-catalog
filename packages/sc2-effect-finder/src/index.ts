// @team-antioch/sc2-effect-finder: ask for a StarCraft II effect model in plain words and get the
// effects that fit, from the catalog's effect looks (docs/adr/0007), narrowed by the kit's keyword
// search and embeddings model and ranked by Jev. No page or command yet: the sc2-mapping-reference
// site's search is built on it, as the doodad and set searches are on their finders.

export { type EffectAnswer, effectAnswer } from "./answer.ts";
export { cardTexts, effectCard, type EffectCard, effectCards, type EffectCardsOptions, effectFolder, effectName } from "./cards.ts";
export { EFFECT_LIMIT, EFFECT_RANK_BUDGET, type EffectFinder, type EffectFinderOptions, effectVectorCacheFile, type FindOptions, type FoundEffect, type FoundEffects, NOT_RANKED, openEffectFinder } from "./finder.ts";
export { askWords, FACETS, keywordSearch, nameWords, tagMatches } from "./narrow.ts";
export { JEV_WORDING, LEVELS, levelName } from "./wording.ts";
