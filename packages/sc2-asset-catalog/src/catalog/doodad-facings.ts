// Doodad Facings: which way each doodad's front faces and where it stands against a wall, measured
// in the Editor and kept in a facings file of the caller's (none ships with this package). A
// doodad's front is the direction its face points into the room at rotation 0, so a doodad at
// rotation r faces r + front. Models disagree (most wall pieces face south at rotation 0, a few
// face west or north), so the dressing turns a measured doodad by its own front and leaves an
// unmeasured one as it always has: turned as if its front were its rotation.
//
// Fronts read from the catalog's turntable renders (a sheet readings file) come second: a
// measurement always wins. A sure reading's front turns a piece, and the compile names
// every doodad it turned that way; a reading's placement and stand-off are only suggested.

import { readFileSync } from "node:fs";

import { z } from "zod";

export const DOODAD_PLACEMENTS = ["wall-foot", "wall-face", "wall-top", "free"] as const;
export type DoodadPlacement = (typeof DOODAD_PLACEMENTS)[number];

/** Degrees in [0, 360). */
const DegreesSchema = z.number().finite().min(0).lt(360);

const PlacementDefaultsSchema = z
  .object({
    /** Cells from the wall zone's polygon edge to the doodad's origin, on the floor side (negative: on the wall). */
    standOff: z.number().finite().optional(),
    /** Cells above the ground under it, as the Editor's HeightOffset. */
    height: z.number().finite().optional(),
    about: z.string().min(1),
  })
  .strict();

export const DoodadFacingSchema = z
  .object({
    front: DegreesSchema,
    placement: z.enum(DOODAD_PLACEMENTS),
    /** Its own distance from the wall zone's edge, where it differs from its placement's. */
    standOff: z.number().finite().optional(),
    /** Its own height above the ground under it, where it differs from its placement's. */
    height: z.number().finite().optional(),
    /** Its length runs along the wall (across its front), as a pipe run or a rail does. */
    runsAlong: z.literal(true).optional(),
    note: z.string().min(1).optional(),
    /** Who measured it, when and how, such as "mapper, 2026-11-09, facing strip". */
    measured: z.string().min(1),
  })
  .strict();
export type DoodadFacing = z.infer<typeof DoodadFacingSchema>;

export const DoodadFacingsSchema = z
  .object({
    about: z.string().min(1),
    placements: z.object(Object.fromEntries(DOODAD_PLACEMENTS.map((kind) => [kind, PlacementDefaultsSchema])) as Record<DoodadPlacement, typeof PlacementDefaultsSchema>).strict(),
    doodads: z.record(z.string().min(1), DoodadFacingSchema),
  })
  .strict();
export type DoodadFacings = z.infer<typeof DoodadFacingsSchema>;

/** No measured facings. */
export const NO_DOODAD_FACINGS: DoodadFacings = {
  about: "No facings measured.",
  placements: Object.fromEntries(DOODAD_PLACEMENTS.map((kind) => [kind, { about: kind }])) as DoodadFacings["placements"],
  doodads: {},
};

/** A facings file, checked. */
export const readDoodadFacings = (file: string): DoodadFacings => DoodadFacingsSchema.parse(JSON.parse(readFileSync(file, "utf8")));

/**
 * What a look at a doodad's catalog renders (variation 0, four turntable pictures) says: which
 * pictures show its front, if any, and where it most likely belongs. `faces` holds one picture (a
 * diagonal front) or two adjacent ones; empty when the model has no front.
 */
export const SheetReadingSchema = z
  .object({
    faces: z
      .array(z.number().int().min(0).max(3))
      .max(2)
      .refine((faces) => faces.length < 2 || [1, 3].includes((((faces[1]! - faces[0]!) % 4) + 4) % 4), "two pictures showing a front must be side by side"),
    /** The front is plain and the pictures agree; for `faces: []`, it really has no front. */
    sure: z.boolean(),
    /** A suggestion only: where it most likely belongs. */
    placement: z.enum(DOODAD_PLACEMENTS).optional(),
    /** A suggestion only: a floor piece's stand-off from its bounds, when deeper than the wall-foot default allows. */
    standOff: z.number().finite().optional(),
    note: z.string().min(1).optional(),
    /** Who read it, when and from what: "agent, 2026-11-11, catalog sheet". */
    read: z.string().min(1),
  })
  .strict();
export type SheetReading = z.infer<typeof SheetReadingSchema>;

export const DoodadSheetReadingsSchema = z
  .object({
    about: z.string().min(1),
    /** How a render's picture number turns into a direction (`sheetPictureAzimuth`). */
    pictures: z.string().min(1),
    doodads: z.record(z.string().min(1), SheetReadingSchema),
  })
  .strict();
export type DoodadSheetReadings = z.infer<typeof DoodadSheetReadingsSchema>;

/** No sheet readings. */
export const NO_SHEET_READINGS: DoodadSheetReadings = { about: "No sheets read.", pictures: "none", doodads: {} };

/** A sheet readings file, checked. */
export const readSheetReadings = (file: string): DoodadSheetReadings => DoodadSheetReadingsSchema.parse(JSON.parse(readFileSync(file, "utf8")));

/**
 * The direction (degrees counterclockwise from east, at rotation 0) a catalog render's picture
 * `n` looks at the model from: 315 − 90n, so a0 is from the south-east, a1 the south-west, a2 the
 * north-west and a3 the north-east, each pitched down 35°. Calibrated against 53 measured
 * doodads: a front measured south shows in a0 and a1.
 */
export const sheetPictureAzimuth = (n: number): number => (((315 - 90 * n) % 360) + 360) % 360;

/** The front (degrees) the pictures showing it give: the one picture's direction, or the two's mean. */
export function frontFromPictures(faces: readonly number[]): number | undefined {
  if (faces.length === 0) return undefined;
  const [a, b] = faces.map(sheetPictureAzimuth);
  if (b === undefined) return a;
  const mean = (Math.atan2(Math.sin(toRadians(a!)) + Math.sin(toRadians(b)), Math.cos(toRadians(a!)) + Math.cos(toRadians(b))) * 180) / Math.PI;
  return ((Math.round(mean) % 360) + 360) % 360;
}

/** Where a doodad's front comes from: a measurement, or a sure reading of its sheet. */
export type FrontSource = "measured" | "sheet";

/**
 * A doodad's front (degrees) and where it comes from: its measured facing, else a sure reading
 * of its sheet that two pictures agree on. A single-picture (diagonal) front, or one the reader
 * wasn't sure of, is only a suggestion: undefined here.
 */
export function getDoodadFront(type: string, facings: DoodadFacings = NO_DOODAD_FACINGS, readings: DoodadSheetReadings = NO_SHEET_READINGS): { readonly front: number; readonly source: FrontSource } | undefined {
  const measured = facings.doodads[type];
  if (measured) return { front: measured.front, source: "measured" };
  const reading = readings.doodads[type];
  if (!reading?.sure || reading.faces.length !== 2) return undefined;
  return { front: frontFromPictures(reading.faces)!, source: "sheet" };
}

/** A doodad's measured facing with its placement's stand-off and height filled in; undefined when it hasn't been measured. */
export function getDoodadFacing(type: string, facings: DoodadFacings = NO_DOODAD_FACINGS): DoodadFacing | undefined {
  const found = facings.doodads[type];
  if (!found) return undefined;
  const { standOff: ownStandOff, height: ownHeight, ...own } = found;
  const defaults = facings.placements[own.placement];
  const standOff = ownStandOff ?? defaults.standOff;
  const height = ownHeight ?? defaults.height;
  return { ...own, ...(standOff !== undefined ? { standOff } : {}), ...(height !== undefined ? { height } : {}) };
}

const TAU = 2 * Math.PI;
const wrap = (radians: number): number => ((radians % TAU) + TAU) % TAU;
const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * The rotation (radians) that turns a doodad's front to `facing` (radians): `facing` less its
 * front, when it's measured or read for sure from its sheet (`getDoodadFront`; `source` says
 * which). A doodad with neither is turned to `facing` itself, as if its front were at rotation 0,
 * with no `source`.
 */
export function rotationToFace(type: string, facing: number, facings?: DoodadFacings, readings?: DoodadSheetReadings): { readonly rotation: number; readonly source?: FrontSource } {
  const known = getDoodadFront(type, facings, readings);
  return known ? { rotation: wrap(facing - toRadians(known.front)), source: known.source } : { rotation: wrap(facing) };
}

/** A group of doodads placed as one (a Doodad Composite) as its front is worked out from: its own front in degrees, and its members' types and yaws. */
export type CompositeFronts = { readonly front?: number | undefined; readonly members: readonly { readonly type: string; readonly yaw: number }[] };

/** How far measured fronts may spread and still count as one front for a composite. */
const AGREE = toRadians(30);

/**
 * Which way a Doodad Composite's shape faces at yaw 0 (radians): its own `front` (degrees) when it
 * gives one, else the shared front of its members whose front is known (`getDoodadFront`: each
 * member's yaw plus its front), when there are any and they agree within 30° of their mean.
 * Undefined otherwise: the recipe's yaw then turns it as before.
 */
export function compositeFront(recipe: CompositeFronts, facings?: DoodadFacings, readings?: DoodadSheetReadings): number | undefined {
  return compositeFrontFrom(recipe, facings, readings).front;
}

/**
 * `compositeFront`, with the member types whose front came from a sheet reading (`sheet`), when
 * the shared front counted them. A recipe's own `front` counts none.
 */
export function compositeFrontFrom(recipe: CompositeFronts, facings?: DoodadFacings, readings?: DoodadSheetReadings): { readonly front?: number; readonly sheet: readonly string[] } {
  if (recipe.front !== undefined) return { front: wrap(toRadians(recipe.front)), sheet: [] };
  const known = recipe.members.flatMap((member) => {
    const front = getDoodadFront(member.type, facings, readings);
    return front ? [{ type: member.type, source: front.source, angle: wrap(member.yaw + toRadians(front.front)) }] : [];
  });
  const fronts = known.map(({ angle }) => angle);
  if (fronts.length === 0) return { sheet: [] };
  const mean = Math.atan2(
    fronts.reduce((sum, a) => sum + Math.sin(a), 0),
    fronts.reduce((sum, a) => sum + Math.cos(a), 0),
  );
  const off = (a: number): number => Math.abs(Math.atan2(Math.sin(a - mean), Math.cos(a - mean)));
  if (!fronts.every((a) => off(a) <= AGREE)) return { sheet: [] };
  return { front: wrap(mean), sheet: [...new Set(known.filter(({ source }) => source === "sheet").map(({ type }) => type))] };
}
