// The built-in renderer over the WhiteoutFlakes viewer, with a fake viewer in its place: the command
// it runs, the HOME and settings each run gets, and its quirk handling (retries for garbled frames,
// white or black backgrounds keyed out, a missing model told by the viewer's log).
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type RunViewer, whiteoutFlakesRenderer } from "../src/catalog/whiteoutflakes.js";
import { readPng, type RgbaImage, writeRgbaPng } from "../src/util/png.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "whiteoutflakes-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type Pixel = readonly [number, number, number, number];
const W: Pixel = [255, 255, 255, 255];
const K: Pixel = [0, 0, 0, 255];
const M: Pixel = [120, 80, 40, 255];
const P: Pixel = [255, 0, 255, 255];

/** A 4×4 frame: a 2×2 model (`inside`) on a `background` border. */
const frame = (background: Pixel, inside: Pixel = M): RgbaImage => ({
  width: 4,
  height: 4,
  rgba: Uint8Array.from(Array.from({ length: 16 }, (_, p) => (p % 4 > 0 && p % 4 < 3 && p > 3 && p < 12 ? inside : background)).flat()),
});

type Call = { readonly bin: string; readonly args: readonly string[]; readonly home: string; readonly recipe: string; readonly settings: string };

/**
 * A fake viewer: each run takes the next of `attempts`, writing that attempt's frames (by angle) into
 * the capture folder its command names, and printing its log. Records what it was run with.
 */
function fakeViewer(attempts: ReadonlyArray<{ readonly frames?: readonly RgbaImage[]; readonly log?: string }>): { run: RunViewer; calls: Call[] } {
  const calls: Call[] = [];
  const run: RunViewer = async (bin, args, { env }) => {
    const home = env.HOME!;
    const recipe = await readFile(args[args.indexOf("--export-recipe") + 1]!, "utf8");
    const settings = await readFile(path.join(home, "Library", "Application Support", "WhiteoutFlakes", "settings.ini"), "utf8").catch(() => "");
    calls.push({ bin, args, home, recipe, settings });
    const attempt = attempts[Math.min(calls.length - 1, attempts.length - 1)]!;
    const captureDir = args[args.indexOf("--export-anim") + 3]!;
    for (const [angle, image] of (attempt.frames ?? []).entries()) await writeFile(path.join(captureDir, `${angle}_001.png`), writeRgbaPng(image));
    return { stdout: attempt.log ?? "", stderr: "" };
  };
  return { run, calls };
}

/** `run`, with its first two calls waiting in the viewer for each other, so those two run at once. */
function inPair(run: RunViewer): RunViewer {
  let arrived = 0;
  let both: () => void = () => {};
  const bothStarted = new Promise<void>((resolve) => (both = resolve));
  return async (...args) => {
    if (++arrived <= 2) {
      if (arrived === 2) both();
      await bothStarted;
    }
    return run(...args);
  };
}

/** A renderer over `run`, with its viewer file, StarCraft II folder and outputs in their own folder. */
async function setUp(run: RunViewer, name = "a") {
  const root = path.join(dir, name);
  await mkdir(root);
  const viewer = path.join(root, "WhiteoutFlakes");
  await writeFile(viewer, "");
  const sc2Path = path.join(root, "StarCraft II");
  await mkdir(sc2Path);
  const renderer = whiteoutFlakesRenderer({ viewer, sc2Path, workDir: path.join(root, "work"), run });
  const outputPaths = [0, 1, 2, 3].map((angle) => path.join(root, `out_${angle}.png`));
  return { viewer, sc2Path, renderer, outputPaths };
}

/** A written frame's alpha channel. */
const alpha = async (file: string): Promise<number[]> => Array.from(readPng(await readFile(file)).rgba.filter((_, i) => i % 4 === 3));

describe("whiteoutFlakesRenderer", () => {
  it("runs the viewer on the model with the thumbnail recipe, in its own HOME naming the StarCraft II folder, and keys the background out", async () => {
    const viewer = fakeViewer([{ frames: [frame(W), frame(W), frame(W), frame(W)] }]);
    const { viewer: bin, sc2Path, renderer, outputPaths } = await setUp(viewer.run);
    await renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths, size: 512 });

    expect(viewer.calls).toHaveLength(1);
    const [call] = viewer.calls;
    expect(call!.bin).toBe(bin);
    expect(call!.args.slice(0, 4)).toEqual(["--backend", "vulkan", "Assets/Doodads/Rock/Rock_00.m3", "--export-recipe"]);
    expect(call!.args.slice(5, 8)).toEqual(["--export-anim", "0", "30"]);
    expect(call!.args.slice(9)).toEqual(["--export-duration", "100"]);
    expect(call!.recipe).toMatch(/Angles=4\n/);
    expect(call!.recipe).toMatch(/Width=512\nHeight=512\n/);
    expect(call!.home.startsWith(path.join(dir, "a", "work", "worker-homes"))).toBe(true);
    expect(call!.settings).toBe(`[IO.Sc2]\nInstallPath=${sc2Path}\n`);
    for (const file of outputPaths) expect(await alpha(file)).toEqual([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);
  });
  it("renders again while an angle has only a garbled frame, and gives up after three attempts", async () => {
    const garbled = frame(W, P);
    const retried = fakeViewer([{ frames: [frame(W), garbled, frame(W), frame(W)] }, { frames: [frame(W), frame(W), frame(W), frame(W)] }]);
    const first = await setUp(retried.run);
    await first.renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths: first.outputPaths, size: 512 });
    expect(retried.calls).toHaveLength(2);
    expect(await alpha(first.outputPaths[1]!)).toEqual([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);

    const hopeless = fakeViewer([{ frames: [frame(W), garbled, frame(W), frame(W)] }]);
    const second = await setUp(hopeless.run, "b");
    await expect(second.renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths: second.outputPaths, size: 512 })).rejects.toThrow(
      "garbled frames of Assets/Doodads/Rock/Rock_00.m3 after 3 attempts",
    );
    expect(hopeless.calls).toHaveLength(3);
  });
  it("keys a black background as black, and takes a white frame over it when a retry gives one", async () => {
    const black = frame(K);
    const blackOnly = fakeViewer([{ frames: [black, frame(W), frame(W), frame(W)] }]);
    const first = await setUp(blackOnly.run);
    await first.renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths: first.outputPaths, size: 512 });
    expect(blackOnly.calls).toHaveLength(3);
    expect(await alpha(first.outputPaths[0]!)).toEqual([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);

    const thenWhite = fakeViewer([{ frames: [black, frame(W), frame(W), frame(W)] }, { frames: [frame(W, P), frame(W), frame(W), frame(W)] }, { frames: [frame(W), frame(W), frame(W), frame(W)] }]);
    const second = await setUp(thenWhite.run, "b");
    await second.renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths: second.outputPaths, size: 512 });
    expect(thenWhite.calls).toHaveLength(3);
    // The white frame's model colour, not the black frame's.
    expect(Array.from(readPng(await readFile(second.outputPaths[0]!)).rgba.subarray(5 * 4, 5 * 4 + 3))).toEqual([...M.slice(0, 3)]);
  });
  it("tells a missing model by the viewer's log, so the next model file is tried, from a render that drew nothing for another reason", async () => {
    const missing = await setUp(fakeViewer([{ log: "[sc2] SpawnUnit FAILED for Assets/Doodads/Rock/Rock.m3\n" }]).run);
    const error = await missing.renderer.render({ model: "Assets/Doodads/Rock/Rock.m3", outputPaths: missing.outputPaths, size: 512 }).catch((caught: unknown) => caught);
    expect(missing.renderer.isNotFound!(error)).toBe(true);

    const blank = await setUp(fakeViewer([{ log: "all fine\n" }]).run, "b");
    const other = await blank.renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths: blank.outputPaths, size: 512 }).catch((caught: unknown) => caught);
    expect(String(other)).toMatch(/the viewer wrote no frames for Assets\/Doodads\/Rock\/Rock_00\.m3/);
    expect(blank.renderer.isNotFound!(other)).toBe(false);
  });
  it("gives renders running at once their own HOMEs, and reuses them after", async () => {
    const viewer = fakeViewer([{ frames: [frame(W), frame(W), frame(W), frame(W)] }]);
    const { renderer, outputPaths } = await setUp(inPair(viewer.run));
    const outputsOf = (name: string) => outputPaths.map((file) => file.replace("out_", `${name}_`));
    await Promise.all(["x", "y"].map((name) => renderer.render({ model: `Assets/Doodads/${name}/${name}_00.m3`, outputPaths: outputsOf(name), size: 512 })));
    await renderer.render({ model: "Assets/Doodads/z/z_00.m3", outputPaths: outputsOf("z"), size: 512 });
    const [x, y, z] = viewer.calls.map((call) => call.home);
    expect(x).not.toBe(y);
    expect([x, y]).toContain(z);

    // Two renderers on one folder take from the same homes.
    const shared = inPair(viewer.run);
    const [first, second] = [0, 1].map(() => whiteoutFlakesRenderer({ viewer: path.join(dir, "a", "WhiteoutFlakes"), sc2Path: path.join(dir, "a", "StarCraft II"), workDir: path.join(dir, "shared"), run: shared }));
    await Promise.all([first!, second!].map((each, i) => each.render({ model: `Assets/Doodads/w${i}/w${i}_00.m3`, outputPaths: outputsOf(`w${i}`), size: 512 })));
    expect(new Set(viewer.calls.slice(3).map((call) => call.home)).size).toBe(2);
  });

  describe("across processes", () => {
    const fixtures = fileURLToPath(new URL("./fixtures/", import.meta.url));
    /** A `render` process on one work folder (tests/fixtures/render-process.ts). */
    const renderProcess = (root: string, markers: string, name: string, mode: "overlap" | "hold"): ChildProcess =>
      spawn(
        process.execPath,
        ["--experimental-transform-types", "--no-warnings", "--import", "./resolve-ts.mjs", "render-process.ts", path.join(root, "WhiteoutFlakes"), path.join(root, "StarCraft II"), path.join(root, "work"), markers, name, mode],
        { cwd: fixtures, stdio: ["ignore", "ignore", "pipe"] },
      );
    const exited = (child: ChildProcess): Promise<number | null> =>
      new Promise((resolve) => {
        let stderr = "";
        child.stderr!.on("data", (chunk) => (stderr += chunk));
        child.on("exit", (code) => {
          if (code) console.error(stderr);
          resolve(code);
        });
      });
    const homeOf = (markers: string, name: string) => readFile(path.join(markers, `${name}.home`), "utf8");

    it("gives two render processes on one folder their own HOMEs, rendering at the same time", async () => {
      const { outputPaths } = await setUp(fakeViewer([{}]).run);
      const markers = path.join(dir, "markers");
      await mkdir(markers);
      const codes = await Promise.all(["x", "y"].map((name) => exited(renderProcess(path.join(dir, "a"), markers, name, "overlap"))));
      expect(codes).toEqual([0, 0]);
      const [x, y] = await Promise.all(["x", "y"].map((name) => homeOf(markers, name)));
      expect(x).not.toBe(y);
      // The two lowest, so warm homes are used first.
      expect([x, y].sort()).toEqual([0, 1].map((slot) => path.join(dir, "a", "work", "worker-homes", String(slot))));
      // Both let their HOMEs go, so the next render takes the first again, its caches still warm.
      const viewer = fakeViewer([{ frames: [frame(W), frame(W), frame(W), frame(W)] }]);
      const again = whiteoutFlakesRenderer({ viewer: path.join(dir, "a", "WhiteoutFlakes"), sc2Path: path.join(dir, "a", "StarCraft II"), workDir: path.join(dir, "a", "work"), run: viewer.run });
      await again.render({ model: "Assets/Doodads/z/z.m3", outputPaths: outputPaths.map((file) => file.replace("out_", "z_")), size: 512 });
      expect(viewer.calls[0]!.home).toBe(path.join(dir, "a", "work", "worker-homes", "0"));
    }, 60_000);

    it("skips a HOME another live process holds, and takes back one a killed process left", async () => {
      const { outputPaths } = await setUp(fakeViewer([{}]).run);
      const markers = path.join(dir, "markers");
      await mkdir(markers);
      const holder = renderProcess(path.join(dir, "a"), markers, "held", "hold");
      const holderExit = exited(holder);
      for (let waited = 0; !existsSync(path.join(markers, "held.home")); waited += 20) {
        if (waited > 30_000) throw new Error("the holding render never started");
        await sleep(20);
      }
      expect(await homeOf(markers, "held")).toBe(path.join(dir, "a", "work", "worker-homes", "0"));
      const render = async (name: string) => {
        const viewer = fakeViewer([{ frames: [frame(W), frame(W), frame(W), frame(W)] }]);
        const renderer = whiteoutFlakesRenderer({ viewer: path.join(dir, "a", "WhiteoutFlakes"), sc2Path: path.join(dir, "a", "StarCraft II"), workDir: path.join(dir, "a", "work"), run: viewer.run });
        await renderer.render({ model: `Assets/Doodads/${name}/${name}.m3`, outputPaths: outputPaths.map((file) => file.replace("out_", `${name}_`)), size: 512 });
        return viewer.calls[0]!.home;
      };
      expect(await render("beside")).toBe(path.join(dir, "a", "work", "worker-homes", "1"));

      // Killed, it can't let its HOME go; its lock is stale, and the next render takes the HOME back.
      holder.kill("SIGKILL");
      await holderExit;
      expect(await render("after")).toBe(path.join(dir, "a", "work", "worker-homes", "0"));
      expect((await readdir(path.join(dir, "a", "work", "worker-homes"))).filter((file) => !/^\d+$/.test(file))).toEqual([]);
    }, 60_000);
  });

  it("keys its output by the viewer build, and says to run setup-renderer when there is no viewer", async () => {
    const { viewer, renderer, outputPaths } = await setUp(fakeViewer([{}]).run);
    const before = await renderer.key!();
    await utimes(viewer, new Date(2030, 0, 1), new Date(2030, 0, 1));
    expect(await renderer.key!()).not.toBe(before);
    await rm(viewer);
    await expect(renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths, size: 512 })).rejects.toThrow(/setup-renderer/);
  });
  it("renders again while an angle has no frame at all, and skips a frame it can't decode", async () => {
    const viewer = fakeViewer([{ frames: [frame(W), frame(W), frame(W)] }, { frames: [frame(W), frame(W), frame(W), frame(W)] }]);
    const { renderer, outputPaths } = await setUp(viewer.run);
    await renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths, size: 512 });
    expect(viewer.calls).toHaveLength(2);

    const broken: RunViewer = async (bin, args, options) => {
      const result = await fakeViewer([{ frames: [frame(W), frame(W), frame(W), frame(W)] }]).run(bin, args, options);
      // A truncated last frame for angle 0, tried before the good one.
      await writeFile(path.join(args[args.indexOf("--export-anim") + 3]!, "0_002.png"), writeRgbaPng(frame(W)).subarray(0, 40));
      return result;
    };
    const second = await setUp(broken, "b");
    await second.renderer.render({ model: "Assets/Doodads/Rock/Rock_00.m3", outputPaths: second.outputPaths, size: 512 });
    expect(await alpha(second.outputPaths[0]!)).toEqual([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 0, 0, 0]);
  });
});
