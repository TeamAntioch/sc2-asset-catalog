// The npx command hints name (src/util/npx.ts).
import { describe, expect, it } from "vitest";

import { npxHint } from "../src/util/npx.ts";

describe("npxHint", () => {
  it("says npx.cmd on Windows, which PowerShell's default policy runs, and npx elsewhere", () => {
    expect(npxHint("@team-antioch/sc2-doodad-finder login", "win32")).toBe("npx.cmd @team-antioch/sc2-doodad-finder login");
    expect(npxHint("@team-antioch/sc2-doodad-finder login", "darwin")).toBe("npx @team-antioch/sc2-doodad-finder login");
  });
});
