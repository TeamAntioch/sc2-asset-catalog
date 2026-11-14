// cascx: list or extract files from a local StarCraft II install's CASC storage, with CascLib.
// A small helper for getting the music files the Music Finder plays (see scripts/extract-music/README.md).
// It reads your own install and writes your own copies; none of that ships from this repo.
//
//   cascx <install folder> list <mask>             prints each matching file's name and size
//   cascx <install folder> extract <mask> <outdir>  writes <outdir>/<name>, with / for \ in the name
//
// <mask> is CascLib's: * matches any run of characters ("*Music*.ogg").
#include "CascLib.h"
#include <cerrno>
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

// Makes each folder of `path` (everything before a '/'); false, saying why, when one can't be made.
static bool mkdirs(const std::string &path) {
    for (size_t i = 1; i < path.size(); i++) {
        if (path[i] != '/') continue;
        std::string dir = path.substr(0, i);
        if (MKDIR(dir.c_str()) != 0 && errno != EEXIST) {
            fprintf(stderr, "can't make folder %s: %s\n", dir.c_str(), strerror(errno));
            return false;
        }
    }
    return true;
}

// An archive name as a path under the output folder, with / for \; empty when it isn't one that
// stays inside it: a name that is absolute, has a drive (':'), or has a ".." segment is refused.
static std::string relativeName(const char *archiveName) {
    std::string name = archiveName, out, segment;
    for (auto &c : name) if (c == '\\') c = '/';
    if (name.empty() || name[0] == '/' || name.find(':') != std::string::npos) return "";
    for (size_t i = 0; i <= name.size(); i++) {
        if (i < name.size() && name[i] != '/') { segment += name[i]; continue; }
        if (segment == "..") return "";
        if (!segment.empty() && segment != ".") out += (out.empty() ? "" : "/") + segment;
        segment.clear();
    }
    return out;
}

// Writes one archive file to `out`; false, saying why, when it can't be written whole. A short read is
// an error unless the file's full size was written: CascReadFile saying false at the end is no failure.
static bool extractOne(HANDLE storage, const char *archiveName, unsigned long long size, const std::string &out) {
    HANDLE f;
    if (!CascOpenFile(storage, archiveName, 0, CASC_OPEN_BY_NAME, &f)) { fprintf(stderr, "can't open %s in the archive (error %d)\n", archiveName, (int)GetCascError()); return false; }
    FILE *o = fopen(out.c_str(), "wb");
    if (!o) { fprintf(stderr, "can't write %s: %s\n", out.c_str(), strerror(errno)); CascCloseFile(f); return false; }
    static char buf[65536];
    unsigned long long total = 0;
    bool ok = true;
    for (;;) {
        DWORD got = 0;
        bool read = CascReadFile(f, buf, sizeof buf, &got);
        if (got && fwrite(buf, 1, got, o) != got) { fprintf(stderr, "write to %s failed: %s\n", out.c_str(), strerror(errno)); ok = false; break; }
        total += got;
        if (!read || got == 0) {
            if (total < size) { fprintf(stderr, "%s: read %llu of %llu bytes (error %d)\n", archiveName, total, size, (int)GetCascError()); ok = false; }
            break;
        }
    }
    if (fclose(o) != 0 && ok) { fprintf(stderr, "closing %s failed: %s\n", out.c_str(), strerror(errno)); ok = false; }
    CascCloseFile(f);
    if (!ok) remove(out.c_str());
    return ok;
}

int main(int argc, char **argv) {
    bool extract = argc > 2 && strcmp(argv[2], "extract") == 0;
    if (argc < 4 || (!extract && strcmp(argv[2], "list") != 0) || (extract && argc < 5)) {
        fprintf(stderr, "usage: cascx <install folder> list <mask>\n       cascx <install folder> extract <mask> <outdir>\n");
        return 2;
    }
    HANDLE storage;
    if (!CascOpenStorage(argv[1], 0, &storage)) { fprintf(stderr, "open failed %d\n", (int)GetCascError()); return 1; }
    CASC_FIND_DATA fd;
    HANDLE find = CascFindFirstFile(storage, argv[3], &fd, NULL);
    if (!find) { fprintf(stderr, "no match\n"); return 1; }
    int n = 0, failed = 0;
    do {
        if (!extract) { printf("%s\t%llu\n", fd.szFileName, (unsigned long long)fd.FileSize); n++; continue; }
        std::string name = relativeName(fd.szFileName);
        if (name.empty()) { fprintf(stderr, "skipped %s: its name isn't a path inside the output folder\n", fd.szFileName); failed++; continue; }
        std::string out = std::string(argv[4]) + "/" + name;
        if (!mkdirs(out) || !extractOne(storage, fd.szFileName, (unsigned long long)fd.FileSize, out)) { failed++; continue; }
        n++;
    } while (CascFindNextFile(find, &fd));
    CascFindClose(find);
    fprintf(stderr, "%d files\n", n);
    if (failed) fprintf(stderr, "%d files FAILED: the output folder is incomplete\n", failed);
    CascCloseStorage(storage);
    return failed ? 1 : 0;
}
