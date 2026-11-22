// A minimal MD34 model file, as the decal extractor reads one (src/catalog/m3.ts): CHAR blocks for
// its strings, a MODL record (version 29) holding its bounds, and a PROJ record when it is a projector.

type Vec3 = readonly [number, number, number];

export type M3FixtureOptions = {
  readonly bounds?: { readonly min: Vec3; readonly max: Vec3 };
  /** CHAR blocks, as a material layer keeps its image path. */
  readonly strings?: readonly string[];
  readonly projector?: boolean;
};

const MODL_SIZE = 856;
const MODL_BOUNDS = 136;
const padded = (size: number): number => Math.ceil(size / 16) * 16;

export function m3({ bounds, strings = [], projector = false }: M3FixtureOptions = {}): Uint8Array {
  const texts = strings.map((text) => new TextEncoder().encode(`${text}\0`));
  const entries: { tag: string; offset: number; count: number; version: number }[] = [];
  let at = 32;
  for (const text of texts) {
    entries.push({ tag: "RAHC", offset: at, count: text.length, version: 0 });
    at += padded(text.length);
  }
  const modl = bounds ? { offset: at, entry: entries.length } : undefined;
  if (modl) {
    entries.push({ tag: "LDOM", offset: at, count: 1, version: 29 });
    at += padded(MODL_SIZE);
  }
  if (projector) {
    entries.push({ tag: "JORP", offset: at, count: 1, version: 5 });
    at += 16;
  }
  const indexOffset = at;
  const data = new Uint8Array(indexOffset + 16 * entries.length);
  const view = new DataView(data.buffer);
  data.set(new TextEncoder().encode("43DM"), 0);
  view.setUint32(4, indexOffset, true);
  view.setUint32(8, entries.length, true);
  view.setUint32(12, modl ? 1 : 0, true);
  view.setUint32(16, modl?.entry ?? 0, true);
  entries.forEach((entry, i) => {
    if (entry.tag === "RAHC") data.set(texts[i]!, entry.offset);
    const index = indexOffset + 16 * i;
    data.set(new TextEncoder().encode(entry.tag), index);
    view.setUint32(index + 4, entry.offset, true);
    view.setUint32(index + 8, entry.count, true);
    view.setUint32(index + 12, entry.version, true);
  });
  if (modl && bounds) [...bounds.min, ...bounds.max].forEach((n, i) => view.setFloat32(modl.offset + MODL_BOUNDS + 4 * i, n, true));
  return data;
}
