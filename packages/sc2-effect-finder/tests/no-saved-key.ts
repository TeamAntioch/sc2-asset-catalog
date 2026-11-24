// Runs before every Effect Finder test file. A finder reads Jev's key from TYPESAFE_API_KEY or from
// the key file `login` saves in the user's config folder, so a test that opens the real ranker on a
// machine where someone has logged in would call Jev for real and spend. Point the config folder at
// a fresh empty one and drop the variable, so no test can find a key it wasn't handed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const EMPTY_CONFIG_DIR = mkdtempSync(path.join(tmpdir(), "sc2-effect-finder-no-key-"));
process.env.SC2_ASSET_CATALOG_CONFIG = EMPTY_CONFIG_DIR;
delete process.env.TYPESAFE_API_KEY;
