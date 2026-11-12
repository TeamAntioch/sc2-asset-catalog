// The WhiteoutFlakes frame checks behind the built-in renderer: which frames to try, and how a frame's
// background is told apart and keyed out.
import { describe, expect, it } from "vitest";

import { angleFrames, frameBackground, keyBackground, magentaShare } from "../src/catalog/whiteoutflakes-frames.js";

/** A width×height RGBA image from rows of pixels. */
const image = (rows: number[][][]) => ({
  width: rows[0]!.length,
  height: rows.length,
  rgba: Uint8Array.from(rows.flat(2)),
});

describe("WhiteoutFlakes frames", () => {
  it("lists each angle's frames last first, so the untransparent first frame is a last resort", () => {
    const frames = angleFrames(["1_000.png", "0_000.png", "0_002.png", "1_002.png", "0_001.png", "log.txt"]);
    expect([...frames]).toEqual([
      [0, ["0_002.png", "0_001.png", "0_000.png"]],
      [1, ["1_002.png", "1_000.png"]],
    ]);
  });

  it("measures magenta among visible pixels only", () => {
    // Magenta, magenta, grey, and a transparent magenta that doesn't count.
    const pixels = image([
      [
        [255, 0, 255, 255],
        [255, 0, 255, 255],
        [90, 90, 90, 255],
        [255, 0, 255, 0],
      ],
    ]);
    expect(magentaShare(pixels)).toBeCloseTo(2 / 3);
  });

  const W = [255, 255, 255, 255];
  const K = [0, 0, 0, 255];
  const M = [120, 80, 40, 255];

  const G = [53, 59, 69, 255];

  it("tells white, black, garbled (tiled) and unkeyed (clear colour) backgrounds apart by the border", () => {
    expect(frameBackground(image([[W, W, W], [W, M, W], [W, W, W]]))).toBe("white");
    expect(frameBackground(image([[K, K, K], [K, M, K], [K, K, K]]))).toBe("black");
    expect(frameBackground(image([[W, K, W], [K, M, K], [W, K, W]]))).toBe("mixed");
    expect(frameBackground(image([[G, G, G], [G, M, G], [G, G, G]]))).toBe("unkeyed");
  });

  describe("on representative 64×64 frames, pinning the border thresholds", () => {
    const SIZE = 64;
    /** A SIZE×SIZE frame: `background(x, y)` everywhere, with a model (`model(x, y)`) where `inModel` says. */
    const scene = (background: (x: number, y: number) => number[], inModel: (x: number, y: number) => boolean, model: (x: number, y: number) => number[] = () => M) =>
      image(Array.from({ length: SIZE }, (_, y) => Array.from({ length: SIZE }, (_, x) => (inModel(x, y) ? model(x, y) : background(x, y)))));
    const centred = (x: number, y: number) => x >= 16 && x < 48 && y >= 16 && y < 48;
    // The border is counted as 4 × 64 = 256 pixels (each corner twice).
    /** `count` pixels of the top row, clear of the corners. */
    const borderEdge = (count: number) => (x: number, y: number) => y === 0 && x >= 1 && x <= count;

    it("calls a clean white frame white, a clean black one black, and a fully transparent one white", () => {
      expect(frameBackground(scene(() => W, centred))).toBe("white");
      expect(frameBackground(scene(() => K, centred))).toBe("black");
      expect(frameBackground(scene(() => [0, 0, 0, 0], centred))).toBe("white");
    });

    it("calls a white frame white when a light-grey model reaches its edge, however much of the border it covers", () => {
      const grey = () => [200, 200, 205, 255];
      expect(frameBackground(scene(() => W, (x, y) => centred(x, y) || x < 20, grey))).toBe("white");
      // Even a model filling the whole border: nothing on it is black, so keying white clears nothing wrongly.
      expect(frameBackground(scene(() => W, () => true, grey))).toBe("white");
    });

    it("calls a magenta-garbled frame (tiles of black, white and magenta) mixed", () => {
      const tiles = [W, K, [255, 0, 255, 255]];
      const garbled = scene((x, y) => tiles[(Math.floor(x / 8) + Math.floor(y / 8)) % 3]!, centred);
      expect(frameBackground(garbled)).toBe("mixed");
    });

    it("calls a frame half white and half black mixed", () => {
      expect(frameBackground(scene((x) => (x < SIZE / 2 ? W : K), centred))).toBe("mixed");
    });

    it("allows stray black (or white) on up to 2% of the border before calling it mixed", () => {
      // 5 of 256 is under 2%; 6 is over.
      expect(frameBackground(scene(() => W, borderEdge(5), () => K))).toBe("white");
      expect(frameBackground(scene(() => W, borderEdge(6), () => K))).toBe("mixed");
      expect(frameBackground(scene(() => K, borderEdge(5), () => W))).toBe("black");
      expect(frameBackground(scene(() => K, borderEdge(6), () => W))).toBe("mixed");
    });

    it("counts only near-pure white (252+) and black (3-) as background", () => {
      expect(frameBackground(scene(() => [252, 252, 252, 255], centred))).toBe("white");
      expect(frameBackground(scene(() => [3, 3, 3, 255], centred))).toBe("black");
      // A light model colour on the whole border isn't white; with no black either, it reads as white (nothing to key).
      expect(frameBackground(scene(() => [251, 251, 251, 255], centred))).toBe("white");
      // Near-black that isn't pure black is model, not background: half of it beside white is still white.
      expect(frameBackground(scene((x) => (x < SIZE / 2 ? W : [4, 4, 4, 255]), centred))).toBe("white");
    });

    it("calls a frame unkeyed when at least half its border is the viewer's clear colour, within 2 of it", () => {
      expect(frameBackground(scene(() => G, centred))).toBe("unkeyed");
      expect(frameBackground(scene(() => [55, 61, 71, 255], centred))).toBe("unkeyed");
      expect(frameBackground(scene(() => [56, 59, 69, 255], centred))).not.toBe("unkeyed");
      // The left half of the frame is exactly half the border (32 + 32 + 64 = 128 of 256), which is enough; a column less isn't.
      expect(frameBackground(scene((x) => (x < 32 ? G : W), centred))).toBe("unkeyed");
      expect(frameBackground(scene((x) => (x < 31 ? G : W), centred))).not.toBe("unkeyed");
    });
  });

  it("keys out background reaching the border, but not black inside the model on a black frame", () => {
    const keyed = keyBackground(
      image([
        [K, K, K, K],
        [K, M, M, K],
        [K, M, K, M],
        [K, M, M, M],
      ]),
      "black",
    );
    const alpha = Array.from({ length: 16 }, (_, p) => keyed.rgba[p * 4 + 3]);
    expect(alpha).toEqual([0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 255, 255, 255]);
  });

  it("keys out white background showing through a gap in the model, if the gap is big enough", () => {
    // A 9×9 model with a 5×5 white hole (25 pixels) and a single white speck.
    const rows = Array.from({ length: 9 }, (_, y) =>
      Array.from({ length: 9 }, (_, x) => (x >= 2 && x <= 6 && y >= 2 && y <= 6) || (x === 7 && y === 7) ? W : M),
    );
    const keyed = keyBackground(image(rows), "white");
    expect(keyed.rgba[(4 * 9 + 4) * 4 + 3]).toBe(0);
    expect(keyed.rgba[(7 * 9 + 7) * 4 + 3]).toBe(255);
    expect(keyed.rgba[(1 * 9 + 1) * 4 + 3]).toBe(255);
  });
});
