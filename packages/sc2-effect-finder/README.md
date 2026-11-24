# @team-antioch/sc2-effect-finder

Ask for a StarCraft II effect model in plain words ("a purple psionic blast", "a blue shield shimmer around a unit", "burning ground") and get the game's effect models that fit, best first.

It searches the catalog's effect looks (`@team-antioch/sc2-asset-catalog`, `data/effect-looks.json`): what each of the game's 1,300 or so effect models under `Assets/Effects` looks like, written from frames of it filmed in the game. As the other finders do, it narrows an ask with a keyword search and the gte-small embeddings model, then has Jev grade the candidates from 0 (doesn't fit) to 3 (looks exactly like this).

It has no page or command of its own yet. The [sc2-mapping-reference](https://github.com/TeamAntioch/sc2-mapping-reference) site's effect search is built on it.

```js
import { localEmbedder } from "@team-antioch/sc2-finder-kit/embedder.js";
import { effectAnswer, effectCards, effectVectorCacheFile, openEffectFinder } from "@team-antioch/sc2-effect-finder";

const embedder = await localEmbedder();
const finder = await openEffectFinder({ cards: effectCards(), embedder, cacheFile: effectVectorCacheFile(embedder.model) });
const { effects } = await finder.find("green acid splash", { rank: false });
console.log(effects.slice(0, 5).map(({ card }) => effectAnswer(card)));
```

- **Cards.** `effectCards(looks?, { base })` makes one card per effect, with its picture's address in the gallery (`base`, sc2-mapping-reference on GitHub by default). A card's id is the model's path, the one an actor or a CModel names.
- **Tags.** `kind` (one or more of the look kinds, comma apart), `color`, `folder` (Protoss, Terran, Zerg, Neutral, Other, LensFlares) and `facet`. A pinned tag filters; the rest raise matches and go to Jev as context.
- **Ranking.** `find` ranks with the `ranker` it was opened with, within the `cap`; a caller that ranks itself (the site, within its daily budget) uses `narrow` and the kit's `jevRanker` with `JEV_WORDING`.

`npm run test-effect-asks` in the repo runs the narrowing on `test-effect-asks.json` (effects a mapper could want, each with the effects it should find) with the real model, and reports the hit rate, how many expected effects are in the first three and how fast. With a key it has Jev rank each ask too; `--no-rank` makes no calls.

Not affiliated with or endorsed by Blizzard Entertainment. MIT License.
