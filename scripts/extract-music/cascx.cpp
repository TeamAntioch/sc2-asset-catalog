// cascx: list or extract files from a local StarCraft II install's CASC storage, with CascLib.
// A small helper for getting the music files the Music Finder plays (see scripts/extract-music/README.md).
// It reads your own install and writes your own copies; none of that ships from this repo.
//
//   cascx <install folder> list <mask>             prints each matching file's name and size
//   cascx <install folder> extract <mask> <outdir>  writes <outdir>/<name>, with / for \ in the name
//
// <mask> is CascLib's: * matches any run of characters ("*Music*.ogg").
#include "CascLib.h"
#include <cstdio>
#include <cstring>
#include <string>
#ifdef _WIN32
#include <direct.h>
#define MKDIR(path) _mkdir(path)
#else
#include <sys/stat.h>
#define MKDIR(path) mkdir(path, 0755)
#endif

static void mkdirs(const std::string &path) {
    for (size_t i = 1; i < path.size(); i++)
        if (path[i] == '/') MKDIR(path.substr(0, i).c_str());
}

int main(int argc, char **argv) {
    bool extract = argc > 2 && strcmp(argv[2], "extract") == 0;
    if (argc < 4 || (!extract && strcmp(argv[2], "list") != 0) || (extract && argc < 5)) {
        fprintf(stderr, "usage: cascx <install folder> list <mask>\n       cascx <install folder> extract <mask> <outdir>\n");
        return 2;
    }
    HANDLE storage;
    if (!CascOpenStorage(argv[1], 0, &storage)) { fprintf(stderr, "open failed %d\n", GetCascError()); return 1; }
    CASC_FIND_DATA fd;
    HANDLE find = CascFindFirstFile(storage, argv[3], &fd, NULL);
    if (!find) { fprintf(stderr, "no match\n"); return 1; }
    int n = 0;
    do {
        if (!extract) { printf("%s\t%llu\n", fd.szFileName, (unsigned long long)fd.FileSize); n++; continue; }
        std::string name = fd.szFileName;
        for (auto &c : name) if (c == '\\') c = '/';
        std::string out = std::string(argv[4]) + "/" + name;
        mkdirs(out);
        HANDLE f;
        if (!CascOpenFile(storage, fd.szFileName, 0, CASC_OPEN_BY_NAME, &f)) { fprintf(stderr, "openfile fail %s\n", fd.szFileName); continue; }
        FILE *o = fopen(out.c_str(), "wb");
        char buf[65536]; DWORD got;
        while (CascReadFile(f, buf, sizeof buf, &got) && got) fwrite(buf, 1, got, o);
        fclose(o); CascCloseFile(f); n++;
    } while (CascFindNextFile(find, &fd));
    CascFindClose(find);
    fprintf(stderr, "%d files\n", n);
    CascCloseStorage(storage);
    return 0;
}
