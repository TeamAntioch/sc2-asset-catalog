// The Finder imports the catalog and the kit as Node does, from their dist; tests run them from source.
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      "@team-antioch/sc2-asset-catalog/catalog": fileURLToPath(new URL("../sc2-asset-catalog/src/catalog", import.meta.url)),
      "@team-antioch/sc2-finder-kit": fileURLToPath(new URL("../sc2-finder-kit/src", import.meta.url)),
    },
  },
});
