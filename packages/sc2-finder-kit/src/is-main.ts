import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Whether the module at `url` is the one the process was started with (`argv1`, process.argv[1]),
 * so a CLI module runs only then and is safe to import. Never throws: an argv[1] that isn't a file
 * (a REPL, `node -e`, a test runner's own) is no module's.
 */
export function isMainModule(url: string, argv1: string | undefined = process.argv[1]): boolean {
  if (!argv1) return false;
  try {
    return url === pathToFileURL(realpathSync(argv1)).href;
  } catch {
    return false;
  }
}
