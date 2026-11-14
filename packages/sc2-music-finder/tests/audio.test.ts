// The Audio folder (src/audio.ts): the index by base name, and the byte ranges the player seeks with.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { byteRange, indexAudioFolder } from "../src/audio.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "music-audio-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("indexAudioFolder", () => {
  it("indexes the .ogg files at any depth by base name, lower case", async () => {
    await mkdir(path.join(dir, "Assets", "Music"), { recursive: true });
    await writeFile(path.join(dir, "Assets", "Music", "TenseApproach.ogg"), "OggS");
    await writeFile(path.join(dir, "CalmAmbient.OGG"), "OggS");
    await writeFile(path.join(dir, "notes.txt"), "not music");
    await writeFile(path.join(dir, "Music.oggx"), "not music");
    const index = await indexAudioFolder(dir);
    expect([...index.files.keys()].sort()).toEqual(["calmambient", "tenseapproach"]);
    expect(index.files.get("tenseapproach")).toBe(path.join(dir, "Assets", "Music", "TenseApproach.ogg"));
    expect(index.duplicates).toEqual([]);
  });

  it("uses the first of a name that is there twice, and says so", async () => {
    await mkdir(path.join(dir, "a"));
    await mkdir(path.join(dir, "b"));
    await writeFile(path.join(dir, "a", "Same.ogg"), "one");
    await writeFile(path.join(dir, "b", "same.ogg"), "two");
    const index = await indexAudioFolder(dir);
    expect(index.files.get("same")).toBe(path.join(dir, "a", "Same.ogg"));
    expect(index.duplicates).toEqual(["same"]);
  });

  it("follows a link to a file, not a link to a folder", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "music-outside-"));
    try {
      await writeFile(path.join(outside, "Linked.ogg"), "OggS");
      await mkdir(path.join(outside, "folder"));
      await writeFile(path.join(outside, "folder", "Hidden.ogg"), "OggS");
      await writeFile(path.join(dir, "Own.ogg"), "OggS");
      await symlink(path.join(outside, "Linked.ogg"), path.join(dir, "Linked.ogg"));
      await symlink(path.join(outside, "folder"), path.join(dir, "folder"));
      const index = await indexAudioFolder(dir);
      expect([...index.files.keys()].sort()).toEqual(["linked", "own"]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("says why a folder won't do", async () => {
    await expect(indexAudioFolder(path.join(dir, "nowhere"))).rejects.toThrow(/not a folder/);
    await writeFile(path.join(dir, "file.txt"), "x");
    await expect(indexAudioFolder(path.join(dir, "file.txt"))).rejects.toThrow(/not a folder/);
    await expect(indexAudioFolder(dir)).rejects.toThrow(/no \.ogg files in it/);
  });
});

describe("byteRange", () => {
  it("is the whole file with no header", () => {
    expect(byteRange(undefined, 100)).toEqual({ start: 0, end: 99, partial: false });
  });

  it("reads a start, a start and an end, and a last n", () => {
    expect(byteRange("bytes=10-", 100)).toEqual({ start: 10, end: 99, partial: true });
    expect(byteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19, partial: true });
    expect(byteRange("bytes=90-500", 100)).toEqual({ start: 90, end: 99, partial: true });
    expect(byteRange("bytes=-20", 100)).toEqual({ start: 80, end: 99, partial: true });
    expect(byteRange("bytes=-500", 100)).toEqual({ start: 0, end: 99, partial: true });
  });

  it("refuses what can't be met", () => {
    for (const bad of ["bytes=100-", "bytes=20-10", "bytes=-0", "bytes=-", "bytes=a-b", "items=0-5", "bytes=0-5,10-20"]) expect(byteRange(bad, 100)).toBeUndefined();
  });
});
