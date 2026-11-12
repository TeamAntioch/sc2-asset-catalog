// The WhiteoutFlakes viewer's thumbnail export, judged: the recipe the built-in renderer renders
// with, and which captured frames to keep. Pure functions; whiteoutflakes.ts runs the viewer.

import type { RgbaImage } from "../util/png.js";

/**
 * The viewer's export recipe (`--export-recipe`; keys in its tools/basic_viewer/capture/export_ini.cpp)
 * for `angles` turntable angles, `size` pixels square.
 * The grid and the background can only be turned off here, not by command-line flags. Pre-roll
 * gives streamed textures time to arrive; without it a first frame can render magenta.
 */
export function thumbnailRecipe(angles: number, size: number): string {
  return `[Export]
HideOverlays=true
Transparent=true
PreRollMs=500
CameraMode=orbit
Angles=${angles}
OrbitFit=true
OrbitFitMargin=1.5
OrbitPitch=35
AutoCrop=true
Width=${size}
Height=${size}
NameTemplate={angle}_{clipframe:3}
`;
}

/**
 * The frames a capture wrote for each angle (named by NameTemplate as `<angle>_<clipframe>.png`),
 * last first. Each angle is its own recording, and the very first frame of a run isn't keyed
 * transparent, so the last frame is preferred; earlier ones stand in when it is garbled.
 */
export function angleFrames(fileNames: readonly string[]): Map<number, string[]> {
  const frames = new Map<number, Array<{ frame: number; name: string }>>();
  for (const name of fileNames) {
    const match = /^(\d+)_(\d+)\.png$/.exec(name);
    if (!match) continue;
    const angle = Number(match[1]);
    frames.set(angle, [...(frames.get(angle) ?? []), { frame: Number(match[2]), name }]);
  }
  return new Map(
    [...frames]
      .sort(([a], [b]) => a - b)
      .map(([angle, list]) => [angle, list.sort((a, b) => b.frame - a.frame).map(({ name }) => name)]),
  );
}

const isMagenta = (rgba: Uint8Array, i: number): boolean => rgba[i]! > 200 && rgba[i + 1]! < 80 && rgba[i + 2]! > 200;

/**
 * Share of a frame's visible pixels that are magenta. The viewer's readback sometimes garbles a
 * frame into tiles of black, white and magenta, and a material whose pipeline failed draws
 * magenta; either way the viewer exits normally. Real doodads have next to no pure magenta.
 */
export function magentaShare({ rgba }: RgbaImage): number {
  let visible = 0;
  let magenta = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    visible++;
    if (isMagenta(rgba, i)) magenta++;
  }
  return visible === 0 ? 0 : magenta / visible;
}

/** The colour the viewer wrote a frame's background in. */
export type FrameBackground = "white" | "black" | "mixed" | "unkeyed";

// The thresholds below were tuned on full renders of the stock doodads, and are pinned by
// tests/whiteoutflakes-frames.test.ts on representative frames: change them there first.

/** Alpha below this is transparent: background, wherever it is. */
const MIN_OPAQUE_ALPHA = 128;
/**
 * Each channel at least this is white background. The viewer's white is 255; the slack takes
 * compression noise at the edge without taking a model's light greys and highlights for background.
 */
const MIN_WHITE = 252;
/** Each channel at most this is black background; above it, a dark model's shading is kept as model. */
const MAX_BLACK = 3;
/** The viewer's own clear colour, which the first frame of a run is drawn on (RGB). */
const CLEAR_COLOUR = [53, 59, 69] as const;
/** How far each channel may stray from CLEAR_COLOUR and still be it. */
const CLEAR_COLOUR_TOLERANCE = 2;
/**
 * A frame whose border is at least this share clear colour is unkeyed. Half, so a model reaching
 * the border can't hide an unkeyed frame, and stray clear-ish model pixels can't fake one.
 */
const MIN_UNKEYED_SHARE = 0.5;
/**
 * A border with at most this share black is white, and at most this share white is black. Above it
 * on both, the frame is mixed: a garbled readback (tiles of black and white), or a dark model
 * reaching the border of a white frame. Small enough that a garbled tile or two makes it mixed.
 */
const MAX_STRAY_SHARE = 0.02;

const isTransparent = (rgba: Uint8Array, i: number): boolean => rgba[i + 3]! < MIN_OPAQUE_ALPHA;
const isWhite = (rgba: Uint8Array, i: number): boolean => rgba[i]! >= MIN_WHITE && rgba[i + 1]! >= MIN_WHITE && rgba[i + 2]! >= MIN_WHITE;
const isBlack = (rgba: Uint8Array, i: number): boolean => rgba[i]! <= MAX_BLACK && rgba[i + 1]! <= MAX_BLACK && rgba[i + 2]! <= MAX_BLACK;
const isClearColour = (rgba: Uint8Array, i: number): boolean => CLEAR_COLOUR.every((channel, c) => Math.abs(rgba[i + c]! - channel) <= CLEAR_COLOUR_TOLERANCE);

/**
 * The viewer is asked for a transparent background but mostly writes it as solid white (or
 * transparent), sometimes solid black, and when the readback garbles, as tiles of both. Judged
 * from the border, where the background is; a dark model reaching the border also makes a white
 * frame read as "mixed". The first frame of a run is drawn on the viewer's grey clear colour
 * instead ("unkeyed"), which can't be keyed.
 */
export function frameBackground({ width, height, rgba }: RgbaImage): FrameBackground {
  let white = 0;
  let black = 0;
  let clear = 0;
  let border = 0;
  const count = (x: number, y: number): void => {
    const i = (y * width + x) * 4;
    border++;
    if (isTransparent(rgba, i) || isWhite(rgba, i)) white++;
    else if (isBlack(rgba, i)) black++;
    else if (isClearColour(rgba, i)) clear++;
  };
  for (let x = 0; x < width; x++) {
    count(x, 0);
    count(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    count(0, y);
    count(width - 1, y);
  }
  if (clear >= border * MIN_UNKEYED_SHARE) return "unkeyed";
  if (black <= border * MAX_STRAY_SHARE) return "white";
  if (white <= border * MAX_STRAY_SHARE) return "black";
  return "mixed";
}

/** Enclosed white areas at least this big are background showing through gaps in the model. */
const MIN_ENCLOSED_BACKGROUND = 24;

/**
 * Makes a frame's background (see frameBackground) transparent: every background-coloured area
 * touching the border, and on white frames also enclosed white areas of at least
 * MIN_ENCLOSED_BACKGROUND pixels, where the background shows through the model. Enclosed black is
 * never cleared, because dark models shade to pure black; that's why white frames are preferred.
 */
export function keyBackground(image: RgbaImage, background: "white" | "black"): RgbaImage {
  const { width, height } = image;
  const rgba = Uint8Array.from(image.rgba);
  const matches = background === "white" ? isWhite : isBlack;
  const isBackground = (p: number): boolean => isTransparent(rgba, p * 4) || matches(rgba, p * 4);
  const seen = new Uint8Array(width * height);
  /** The background area containing `start`, marking it seen. */
  const area = (start: number): number[] => {
    const pixels: number[] = [];
    const stack = [start];
    while (stack.length > 0) {
      const p = stack.pop()!;
      if (seen[p] || !isBackground(p)) continue;
      seen[p] = 1;
      pixels.push(p);
      const [x, y] = [p % width, Math.floor(p / width)];
      if (x > 0) stack.push(p - 1);
      if (x < width - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - width);
      if (y < height - 1) stack.push(p + width);
    }
    return pixels;
  };
  const border = new Set<number>();
  for (let x = 0; x < width; x++) border.add(x).add((height - 1) * width + x);
  for (let y = 0; y < height; y++) border.add(y * width).add(y * width + width - 1);
  for (let p = 0; p < width * height; p++) {
    if (seen[p]) continue;
    const pixels = area(p);
    const enclosedHole = background === "white" && pixels.length >= MIN_ENCLOSED_BACKGROUND;
    if (enclosedHole || pixels.some((q) => border.has(q))) for (const q of pixels) rgba[q * 4 + 3] = 0;
  }
  return { width, height, rgba };
}
