// Jev's key file (src/key-file.ts): the per-user config folder on each platform, and the key saved
// there whole, readable by its owner alone on POSIX. Every test uses its own temporary folder.
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { configDir, keyFile, readKeyFile, removeKeyFile, saveKeyFile } from "../src/key-file.ts";

describe("configDir", () => {
  it("is under %APPDATA% on Windows, else AppData\\Roaming in the home folder", () => {
    expect(configDir({ platform: "win32", env: { APPDATA: "C:\\Users\\mapper\\AppData\\Roaming" }, home: "C:\\Users\\mapper" })).toBe("C:\\Users\\mapper\\AppData\\Roaming\\sc2-asset-catalog");
    expect(configDir({ platform: "win32", env: {}, home: "C:\\Users\\mapper" })).toBe("C:\\Users\\mapper\\AppData\\Roaming\\sc2-asset-catalog");
  });

  it("is under $XDG_CONFIG_HOME on macOS and Linux, else ~/.config", () => {
    for (const platform of ["darwin", "linux"] as const) {
      expect(configDir({ platform, env: { XDG_CONFIG_HOME: "/etc/mapper" }, home: "/home/mapper" })).toBe("/etc/mapper/sc2-asset-catalog");
      expect(configDir({ platform, env: { XDG_CONFIG_HOME: "" }, home: "/home/mapper" })).toBe("/home/mapper/.config/sc2-asset-catalog");
    }
  });

  it("is SC2_ASSET_CATALOG_CONFIG on any platform when that is set", () => {
    expect(configDir({ platform: "win32", env: { SC2_ASSET_CATALOG_CONFIG: "D:\\config", APPDATA: "C:\\x" }, home: "C:\\Users\\mapper" })).toBe("D:\\config");
    expect(configDir({ platform: "linux", env: { SC2_ASSET_CATALOG_CONFIG: "/tmp/c", XDG_CONFIG_HOME: "/x" }, home: "/home/mapper" })).toBe("/tmp/c");
  });
});

const posix = process.platform !== "win32";
let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "finder-kit-key-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const on = () => ({ env: { SC2_ASSET_CATALOG_CONFIG: path.join(dir, "config") } });

describe("the key file", () => {
  it("is in the config folder", () => {
    expect(keyFile(on())).toBe(path.join(dir, "config", "typesafe-key"));
  });

  it("has no key until one is saved, then the saved one, trimmed", async () => {
    expect(readKeyFile(on())).toBeUndefined();
    await saveKeyFile("ts-saved", on());
    expect(readKeyFile(on())).toBe("ts-saved");
    await saveKeyFile("ts-again", on());
    expect(readKeyFile(on())).toBe("ts-again");
    expect(await readdir(path.join(dir, "config"))).toEqual(["typesafe-key"]);
  });

  it("reads a blank file as no key", async () => {
    await saveKeyFile("  ", on());
    expect(readKeyFile(on())).toBeUndefined();
  });

  it.runIf(posix)("is 0600 on POSIX, in a 0700 folder when the save creates it, even over a file that was open to others", async () => {
    await saveKeyFile("ts-saved", on());
    expect((await stat(path.join(dir, "config"))).mode & 0o777).toBe(0o700);
    expect((await stat(keyFile(on()))).mode & 0o777).toBe(0o600);
    await chmod(keyFile(on()), 0o644);
    await saveKeyFile("ts-again", on());
    expect((await stat(keyFile(on()))).mode & 0o777).toBe(0o600);
  });

  it.runIf(posix)("tightens the default config folder to 0700, but leaves a folder SC2_ASSET_CATALOG_CONFIG names as it was", async () => {
    const named = path.join(dir, "named");
    await mkdir(named, { mode: 0o755 });
    await chmod(named, 0o755);
    await saveKeyFile("ts-saved", { env: { SC2_ASSET_CATALOG_CONFIG: named } });
    expect((await stat(named)).mode & 0o777).toBe(0o755);
    expect((await stat(path.join(named, "typesafe-key"))).mode & 0o777).toBe(0o600);

    const xdg = { platform: process.platform, env: { XDG_CONFIG_HOME: path.join(dir, "xdg") } };
    await mkdir(configDir(xdg), { recursive: true, mode: 0o755 });
    await chmod(configDir(xdg), 0o755);
    await saveKeyFile("ts-saved", xdg);
    expect((await stat(configDir(xdg))).mode & 0o777).toBe(0o700);
  });

  it("is removed by removeKeyFile, which says whether there was one", async () => {
    expect(await removeKeyFile(on())).toBe(false);
    await saveKeyFile("ts-saved", on());
    expect(await removeKeyFile(on())).toBe(true);
    expect(readKeyFile(on())).toBeUndefined();
    expect(await removeKeyFile(on())).toBe(false);
  });
});
