#!/usr/bin/env node
import { runCatalogCli } from "../dist/cli.js";

runCatalogCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
