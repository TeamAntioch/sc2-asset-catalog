// What the decal extractor reads from a model file: its bounds, its texture paths and whether it is a projector.
import { describe, expect, it } from "vitest";

import { hasM3Projector, readM3Bounds, readM3TexturePaths } from "../src/catalog/m3.js";
import { m3 } from "./fixtures/m3.js";

describe("reading an .m3", () => {
  it("reads the MODL record's bounds", () => {
    expect(readM3Bounds(m3({ bounds: { min: [-3.235, -1.6, 0], max: [3.235, 1.6, 0.5] } }))).toEqual({ min: [-3.235, -1.6, 0], max: [3.235, 1.6, 0.5] });
  });

  it("reads each image path the model names, once, and nothing else", () => {
    const data = m3({ strings: ["Assets\\Textures\\Stripe_Diffuse.dds", "Ref_Center", "Assets/Textures/Stripe_Normal.DDS", "Assets\\Textures\\Stripe_Diffuse.dds"] });
    expect(readM3TexturePaths(data)).toEqual(["Assets\\Textures\\Stripe_Diffuse.dds", "Assets/Textures/Stripe_Normal.DDS"]);
  });

  it("tells a projector from a model drawn as geometry", () => {
    expect(hasM3Projector(m3({ projector: true }))).toBe(true);
    expect(hasM3Projector(m3({ bounds: { min: [0, 0, 0], max: [1, 1, 1] } }))).toBe(false);
  });

  it("refuses a file that isn't an MD34, and one with no MODL record", () => {
    expect(() => readM3TexturePaths(new Uint8Array(32))).toThrow(/MD34/);
    expect(() => readM3Bounds(m3({ strings: ["Assets/Textures/x.dds"] }))).toThrow(/MODL/);
  });
});
