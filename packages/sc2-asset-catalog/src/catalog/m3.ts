// What the decal extractor reads from a model file (.m3, MD34): its tag index, the box its MODL
// record gives, the texture paths it names, and whether it holds a projector. Offsets are the MD34
// layout the m3 Blender addon documents (structures.xml): they hold for every MODL version the game
// ships (23-29), whose later fields come after these.

/** One entry of an MD34's tag index: an array of `count` records of `tag` at `offset`. */
export type M3IndexEntry = { readonly tag: string; readonly offset: number; readonly count: number; readonly version: number };

type Vec3 = readonly [number, number, number];

/** An MD34's tag index, which every reference in it points into by position. Throws when the file isn't an MD34. */
export function m3Index(data: Uint8Array): { readonly view: DataView; readonly entries: readonly M3IndexEntry[] } {
  if (data.length < 20 || String.fromCharCode(...data.subarray(0, 4)) !== "43DM") throw new Error("not an MD34 .m3");
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const indexOffset = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  if (indexOffset + 16 * indexCount > data.length) throw new Error("the .m3's tag index runs past its end");
  const entries = Array.from({ length: indexCount }, (_, i) => {
    const at = indexOffset + 16 * i;
    return { tag: String.fromCharCode(...data.subarray(at, at + 4)), offset: view.getUint32(at + 4, true), count: view.getUint32(at + 8, true), version: view.getUint32(at + 12, true) };
  });
  return { view, entries };
}

/** Where a MODL record keeps its bounds (min, then max). */
const MODL_BOUNDS = 136;

/** The box an MD34's MODL record gives (the one the game culls it by, in the model's own frame), rounded to thousandths. */
export function readM3Bounds(data: Uint8Array): { readonly min: Vec3; readonly max: Vec3 } {
  const { view, entries } = m3Index(data);
  const modl = entries[view.getUint32(16, true)];
  if (view.getUint32(12, true) !== 1 || modl?.tag !== "LDOM" || modl.offset + MODL_BOUNDS + 24 > data.length) throw new Error("no MODL record in the .m3");
  const float = (at: number): number => Math.round(view.getFloat32(at, true) * 1000) / 1000;
  const vec = (at: number): Vec3 => [float(at), float(at + 4), float(at + 8)];
  return { min: vec(modl.offset + MODL_BOUNDS), max: vec(modl.offset + MODL_BOUNDS + 12) };
}

/** The file types a material layer draws from: images, and the videos some layers play. */
const TEXTURE_FILE = /\.(dds|tga|png|jpe?g|ogv)$/i;

/** Each texture path an MD34 names (a layer keeps its path in a CHAR block), once each, in the file's order. */
export function readM3TexturePaths(data: Uint8Array): string[] {
  const paths = new Set<string>();
  for (const entry of m3Index(data).entries) {
    if (entry.tag !== "RAHC" || entry.count === 0 || entry.offset + entry.count > data.length) continue;
    const text = new TextDecoder().decode(data.subarray(entry.offset, entry.offset + entry.count)).replace(/\0+$/, "");
    if (TEXTURE_FILE.test(text)) paths.add(text);
  }
  return [...paths];
}

/** Whether an MD34 holds a projector (PROJ): a box that paints a texture onto the ground under it, as most decals are. */
export const hasM3Projector = (data: Uint8Array): boolean => m3Index(data).entries.some((entry) => entry.tag === "JORP");
