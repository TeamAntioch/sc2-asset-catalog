// The tray's copy text (src/tray.ts): what a click on "copy" puts on the clipboard, for one ticked
// card or the whole tray. An id is what the Editor's doodad palette searches by; a dependency is
// what the map must add before it can place the doodad.
import { describe, expect, it } from "vitest";

import { itemCopyText, trayCopyText } from "../src/tray.ts";
import { VOID_CAMPAIGN } from "./fixtures.ts";

const LIBERTY = "bnet:Liberty (Campaign)/0.0/999,file:Campaigns/Liberty.SC2Campaign";

describe("the tray's copy text", () => {
  it("is the id alone for a doodad that needs nothing added", () => {
    expect(itemCopyText({ id: "SupplyCrate" })).toBe("SupplyCrate");
  });

  it("is the id and the package it needs, by name", () => {
    expect(itemCopyText({ id: "FoundryStamperHead", dependency: VOID_CAMPAIGN })).toBe("FoundryStamperHead (needs Void (Campaign))");
  });

  it("lists every id, one a line, then each package needed once", () => {
    const text = trayCopyText([
      { id: "FoundryStamperHead", dependency: VOID_CAMPAIGN },
      { id: "SupplyCrate" },
      { id: "FoundryPressFrame", dependency: LIBERTY },
      { id: "MossyBoulder", dependency: VOID_CAMPAIGN },
    ]);
    expect(text).toBe(["FoundryStamperHead", "SupplyCrate", "FoundryPressFrame", "MossyBoulder", "", "Dependencies: Void (Campaign), Liberty (Campaign)"].join("\n"));
  });

  it("is the ids alone when none needs a package, and nothing for an empty tray", () => {
    expect(trayCopyText([{ id: "SupplyCrate" }, { id: "Sandbags" }])).toBe("SupplyCrate\nSandbags");
    expect(trayCopyText([])).toBe("");
  });
});
