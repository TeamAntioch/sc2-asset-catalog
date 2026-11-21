#!/usr/bin/env node
import { main } from "../dist/cli/set-finder.js";

// A failed start exits once its message is written: the model's download, still under way, would
// otherwise hold the terminal until it finished. Lines already sent to stdout are written first.
main().catch((error) => {
  process.stdout.write("", () => process.stderr.write(`${error instanceof Error ? error.message : error}\n`, () => process.exit(1)));
});
