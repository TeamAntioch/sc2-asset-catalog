#!/usr/bin/env node
import { main } from "../dist/cli/doodad-finder.js";

// A failed start exits once its message is written: a download still under way (the model's, the
// catalog's) would otherwise hold the terminal until it finished.
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : error}\n`, () => process.exit(1));
});
