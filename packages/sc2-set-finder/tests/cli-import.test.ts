// The CLI modules are imported by other programs (sc2-adjutant's CLI adds its options to
// FINDER_ARG_OPTIONS): importing one runs nothing and throws nothing, whatever the process's
// argv[1] is.
import { afterEach, describe, expect, it, vi } from "vitest";

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
      const cli = await import("../src/cli/set-finder.ts");
      expect(cli.FINDER_ARG_OPTIONS.port).toEqual({ type: "string" });
      const asks = await import("../src/cli/test-asks.ts");
      expect(asks.TOP_SETS).toBe(3);
    }
  });
});
