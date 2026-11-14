# Extracting the music files

`cascx.cpp` is a small C++ program that lists and extracts files from a StarCraft II install's CASC storage with [CascLib](https://github.com/ladislav-zezula/CascLib). It is how the Music Finder's Audio folder is made. The step-by-step directions, for macOS and Windows, are in [the Music Finder's README](../../packages/sc2-music-finder/README.md#getting-the-music-files-the-audio-folder).

```sh
cascx <install folder> list <mask>
cascx <install folder> extract <mask> <outdir>
```

The mask is CascLib's, with `*` for any run of characters: `"*Music*.ogg"` matches the 772 music files. The program reads your own install and writes your own copies. Don't commit them: the extracted audio is Blizzard's.
