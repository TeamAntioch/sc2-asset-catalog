// Small pieces of a card's markup (src/card-html.ts).
import { describe, expect, it } from "vitest";

import { escapeHtml, sectionSeconds } from "../src/card-html.ts";

describe("sectionSeconds", () => {
  it("reads m:ss, mm:ss and h:mm:ss", () => {
    expect(sectionSeconds("0:38")).toBe(38);
    expect(sectionSeconds("00:38")).toBe(38);
    expect(sectionSeconds("2:05")).toBe(125);
    expect(sectionSeconds("1:02:03")).toBe(3723);
  });

  it("is 0, never NaN, for what isn't a clock time", () => {
    for (const odd of ["", "38", "soon", "1:xx", "1:2:3:4"]) expect(sectionSeconds(odd), odd).toBe(0);
  });
});

describe("escapeHtml", () => {
  it("makes the five characters safe", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
