// The CLI modules are imported by other programs (sc2-adjutant's CLI adds its options to
// FINDER_ARG_OPTIONS): importing one runs nothing and throws nothing, whatever the process's
// argv[1] is.
import { afterEach, describe, expect, it, vi } from "vitest";

import { isMainModule } from "@team-antioch/sc2-finder-kit/is-main.js";

const argv = [...process.argv];
afterEach(() => {
  process.argv.splice(0, process.argv.length, ...argv);
  vi.resetModules();
});

describe("importing the CLI", () => {
  it("works when the process's argv[1] isn't a file", async () => {
    for (const bogus of ["/no/such/file", "not a path", ""]) {
      process.argv[1] = bogus;
      vi.resetModules();
      const cli = await import("../src/cli/music-finder.ts");
      expect(cli.FINDER_ARG_OPTIONS.port).toEqual({ type: "string" });
    }
  });

  it("knows the module run as the program, and nothing else", () => {
    expect(isMainModule(import.meta.url, "/no/such/file")).toBe(false);
    expect(isMainModule(import.meta.url, undefined)).toBe(false);
    expect(isMainModule(import.meta.url, new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))).toBe(true);
  });
});
