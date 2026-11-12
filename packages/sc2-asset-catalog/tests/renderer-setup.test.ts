// setup-renderer (src/catalog/renderer-setup.ts) over a fake system: what it checks for on macOS and
// how it says what's missing, the build it runs and the record it keeps, and its refusal elsewhere.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BUILD_SCRIPT, type SetupSystem, setupRenderer, XCODE_APP } from "../src/catalog/renderer-setup.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "renderer-setup-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** A Mac with everything setup needs, less what `missing` names; its build writes the viewer. */
function fakeMac({ missing = [], arch = "arm64" }: { readonly missing?: readonly string[]; readonly arch?: string } = {}) {
  const builds: Array<{ script: string; dir: string }> = [];
  const commands: string[] = [];
  const system: SetupSystem = {
    platform: "darwin",
    arch,
    exists: (file) => (file === XCODE_APP ? !missing.includes("xcode") : existsSync(file)),
    succeeds: async (command, args) => {
      commands.push([command, ...args].join(" "));
      if (command === "xcrun") return !missing.includes("xcode") && !missing.includes("metal");
      if (command === "brew") return !missing.includes("brew");
      if (command === "montage") return !missing.includes("imagemagick");
      return true;
    },
    build: async (script, buildDir) => {
      builds.push({ script, dir: buildDir });
      const app = path.join(buildDir, "stage", "WhiteoutFlakes.app", "Contents", "MacOS");
      await mkdir(app, { recursive: true });
      await writeFile(path.join(app, "WhiteoutFlakes"), "");
    },
  };
  return { system, builds, commands };
}

const options = (system: SetupSystem, lines: string[] = []) => ({ cacheDir: path.join(dir, "cache"), configDir: path.join(dir, "config"), system, log: (line: string) => lines.push(line) });

describe("setupRenderer", () => {
  it("builds the viewer into the cache folder with the build script, and records its path in the config folder", async () => {
    const mac = fakeMac();
    const { viewer } = await setupRenderer(options(mac.system));
    expect(mac.builds).toEqual([{ script: BUILD_SCRIPT, dir: path.join(dir, "cache", "whiteoutflakes") }]);
    expect(viewer).toBe(path.join(dir, "cache", "whiteoutflakes", "stage", "WhiteoutFlakes.app", "Contents", "MacOS", "WhiteoutFlakes"));
    expect(JSON.parse(await readFile(path.join(dir, "config", "renderer.json"), "utf8"))).toEqual({ viewer });
  });

  it("builds into an absolute folder, and records an absolute viewer path, when the cache folder is relative", async () => {
    const mac = fakeMac();
    const { viewer } = await setupRenderer({ ...options(mac.system), cacheDir: path.relative(process.cwd(), path.join(dir, "cache")) });
    expect(mac.builds[0]!.dir).toBe(path.join(dir, "cache", "whiteoutflakes"));
    expect(path.isAbsolute(viewer)).toBe(true);
  });

  it("says each thing that's missing and how to get it, and builds nothing", async () => {
    const mac = fakeMac({ missing: ["metal", "brew", "imagemagick"] });
    const error = await setupRenderer(options(mac.system)).catch((caught: unknown) => String(caught));
    expect(error).toMatch(/xcodebuild -downloadComponent MetalToolchain/);
    expect(error).toMatch(/Homebrew.*https:\/\/brew\.sh/);
    expect(error).toMatch(/brew install imagemagick/);
    expect(error).not.toMatch(/App Store/);
    expect(mac.builds).toEqual([]);
  });

  it("asks for Xcode itself when it isn't installed, before its Metal toolchain", async () => {
    const error = await setupRenderer(options(fakeMac({ missing: ["xcode"] }).system)).catch((caught: unknown) => String(caught));
    expect(error).toMatch(/Xcode.*App Store/);
    expect(error).not.toMatch(/MetalToolchain/);
  });

  it("refuses an Intel Mac, and Windows and Linux, saying rendering isn't supported there yet", async () => {
    await expect(setupRenderer(options(fakeMac({ arch: "x64" }).system))).rejects.toThrow(/Apple silicon/);
    for (const platform of ["win32", "linux"] as const) {
      const mac = fakeMac();
      await expect(setupRenderer(options({ ...mac.system, platform }))).rejects.toThrow(/isn't supported on (Windows|Linux) yet/);
      expect(mac.commands).toEqual([]);
    }
  });

  it("fails when the build finishes without a viewer, recording nothing", async () => {
    const mac = fakeMac();
    await expect(setupRenderer(options({ ...mac.system, build: async () => {} }))).rejects.toThrow(/no viewer/);
    await expect(readFile(path.join(dir, "config", "renderer.json"))).rejects.toThrow();
  });
});
