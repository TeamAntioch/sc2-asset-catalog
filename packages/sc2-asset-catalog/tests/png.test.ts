// The PNG reading and writing the built-in renderer keys frames with: what writeRgbaPng writes,
// readPng reads back, pixel for pixel; and readPng refuses what isn't a PNG it knows.
import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { readPng, writeRgbaPng } from "../src/util/png.js";

describe("PNG", () => {
  it("reads back what it writes, alpha and all", () => {
    const image = { width: 3, height: 2, rgba: Uint8Array.from([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]) };
    expect(readPng(writeRgbaPng(image))).toEqual(image);
  });

  it("reads an RGB PNG with filtered rows as opaque RGBA", () => {
    // 2×2 RGB: row 0 with filter 1 (sub), row 1 with filter 2 (up).
    const raw = Uint8Array.from([1, 10, 20, 30, 5, 5, 5, 2, 1, 1, 1, 2, 2, 2]);
    const chunk = (type: string, body: Buffer) => {
      const length = Buffer.alloc(4);
      length.writeUInt32BE(body.length);
      return Buffer.concat([length, Buffer.from(type, "ascii"), body, Buffer.alloc(4)]);
    };
    const header = Buffer.from([0, 0, 0, 2, 0, 0, 0, 2, 8, 2, 0, 0, 0]);
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
    expect(Array.from(readPng(png).rgba)).toEqual([10, 20, 30, 255, 15, 25, 35, 255, 11, 21, 31, 255, 17, 27, 37, 255]);
  });

  it("refuses a file that isn't a PNG", () => {
    expect(() => readPng(Buffer.from("not a png at all"))).toThrow(/not a PNG/);
  });
});
