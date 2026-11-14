---
"@team-antioch/sc2-finder-kit": patch
"@team-antioch/sc2-music-finder": patch
---

Embed each music card without its id's own words. A card's `embedText` (optional on the kit's `FinderCard`) is what the embeddings model reads; the keyword search and the Jev ranker still read the full text. On the test asks it lifts the reviewed asks from 2/3 to 3/3, and the first embed is about 40% faster, as fewer texts are distinct. The vector cache re-embeds once.
