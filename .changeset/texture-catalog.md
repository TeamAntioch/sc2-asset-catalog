---
"@team-antioch/sc2-asset-catalog": minor
---

Terrain textures join the catalog. `data/texture-descriptions.json` describes 643 terrain textures (look, kind, tone and the palette roles each suits), and the new `extract-textures` command builds each tileset's blend textures and each texture's file, name and gallery picture from SC2GameData into the cache. `readTextureCatalog`, `getTexture`, `lookUpTextures`, `searchTextures` and `tilesetTextures` read, look up and search them. `texturePicture`, `texturePictureUrl`, `textureSheetTiles` and `textureSheetSvg` fetch their gallery pictures into the cache and draw a labelled sheet of them as SVG. Two textures that had been matched to another texture's picture, `KorhalWastes_1` and `UmojaEx3_1`, now have their own pictures, and their descriptions were rewritten from them.
