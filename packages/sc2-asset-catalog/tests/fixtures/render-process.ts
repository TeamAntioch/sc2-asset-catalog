// One `render` process for tests/whiteoutflakes.test.ts: renders one model with the built-in renderer
// over a fake viewer, so the test can run several at once on one work folder, or kill one mid-render.
// Its fake viewer writes the HOME it was given to <markers>/<name>.home, then:
// - "overlap": waits until another process has written its marker too, then draws four white frames;
// - "hold": never returns, so the process holds its HOME until it is killed.
// Usage: node --experimental-transform-types --import ./resolve-ts.mjs render-process.ts <viewer> <sc2> <work> <markers> <name> <mode>
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { whiteoutFlakesRenderer } from "../../src/catalog/whiteoutflakes.js";
import { writeRgbaPng } from "../../src/util/png.js";

const [viewer, sc2Path, workDir, markers, name, mode] = process.argv.slice(2) as [string, string, string, string, string, string];
const white = writeRgbaPng({ width: 4, height: 4, rgba: new Uint8Array(64).fill(255) });

const renderer = whiteoutFlakesRenderer({
  viewer,
  sc2Path,
  workDir,
  run: async (_bin, args, { env }) => {
    await writeFile(path.join(markers, `${name}.home`), env.HOME!);
    // A timer keeps the process alive; an unsettled promise alone wouldn't.
    if (mode === "hold") await new Promise(() => setInterval(() => {}, 1000));
    for (let waited = 0; (await readdir(markers)).filter((file) => file.endsWith(".home")).length < 2; waited += 20) {
      if (waited > 20_000) throw new Error("the other render never started");
      await sleep(20);
    }
    const captureDir = args[args.indexOf("--export-anim") + 3]!;
    for (const angle of [0, 1, 2, 3]) await writeFile(path.join(captureDir, `${angle}_001.png`), white);
    return { stdout: "", stderr: "" };
  },
});
await renderer.render({ model: `Assets/Doodads/${name}/${name}.m3`, outputPaths: [0, 1, 2, 3].map((angle) => path.join(markers, `${name}_${angle}.png`)), size: 4 });
