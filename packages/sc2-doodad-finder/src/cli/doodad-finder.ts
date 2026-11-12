// The Doodad Finder's CLI, `sc2-doodad-finder` (docs/adr/0001), with the public defaults: the
// stock catalog (extracted into the cache folder on a first start), Jev when TYPESAFE_API_KEY or
// the key file holds a key (else the narrowing's order), a spend cap of $1.00 a session unless --budget sets another,
// and a tick log only in a folder --tick-log names. It starts the Finder (start.ts) and prints the
// page's address. The process listens on 127.0.0.1 only. `extract` extracts the catalog again and
// starts nothing, as the catalog's own `sc2-asset-catalog extract` does. `login` saves the TypeSafe
// key to the key file and `logout` deletes it (login.ts). Starting it, the key and what each ask
// sends: the repo's README.md.
//
//   sc2-doodad-finder [--port n] [--budget dollars] [--tick-log <folder>] [--open]
//   sc2-doodad-finder extract | login | logout

import { execFile } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";

import { runCatalogCli } from "@teamantioch/sc2-asset-catalog";

import { keySourceText } from "../credentials.ts";
import { login, logout } from "../login.ts";
import { DEFAULT_BUDGET, dollars } from "../spend-cap.ts";
import { type RunningFinder, startFinder } from "../start.ts";
import { FINDER_PORT } from "../server.ts";
import { isMainModule } from "./is-main.ts";

export const USAGE = "Usage: sc2-doodad-finder [--port n] [--budget dollars] [--tick-log <folder>] [--open]\n       sc2-doodad-finder extract | login | logout";

export type FinderArgs = { readonly port: number; readonly budget?: number; readonly tickLog?: string; readonly open: boolean; readonly help?: true; readonly extract?: true; readonly login?: true; readonly logout?: true };

/** The CLI's options, for parseArgs: sc2-adjutant's CLI adds its own to these. */
export const FINDER_ARG_OPTIONS = { port: { type: "string" }, budget: { type: "string" }, "tick-log": { type: "string" }, open: { type: "boolean" }, help: { type: "boolean" } } as const;

/** The options from parsed values, `--tick-log` resolved from `cwd`. */
export function finderArgs(values: { readonly port?: string | undefined; readonly budget?: string | undefined; readonly "tick-log"?: string | undefined; readonly open?: boolean | undefined; readonly help?: boolean | undefined }, cwd: string, usage = USAGE): FinderArgs {
  const port = Number(values.port ?? FINDER_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port takes a port number\n${usage}`);
  const budget = values.budget === undefined ? undefined : Number(values.budget);
  if (budget !== undefined && !(budget >= 0)) throw new Error(`--budget takes US dollars, 0 or more\n${usage}`);
  return {
    port,
    ...(budget !== undefined ? { budget } : {}),
    ...(values["tick-log"] !== undefined ? { tickLog: path.resolve(cwd, values["tick-log"]) } : {}),
    open: values.open === true,
    ...(values.help ? { help: true as const } : {}),
  };
}

const COMMANDS = ["extract", "login", "logout"] as const;

/** The CLI's options and command: none, `extract`, `login` or `logout`. */
export function parseFinderArgs(args: readonly string[], cwd: string): FinderArgs {
  const { values, positionals } = parseArgs({ args: [...args], options: FINDER_ARG_OPTIONS, allowPositionals: true });
  const [command, ...rest] = positionals;
  if ((command !== undefined && !(COMMANDS as readonly string[]).includes(command)) || rest.length) throw new Error(USAGE);
  return { ...finderArgs(values, cwd), ...(command ? { [command]: true as const } : {}) };
}

/** Says what started, opens the page if asked, and stops on Ctrl-C. */
export function announce(running: RunningFinder, { open, budget }: Pick<FinderArgs, "open" | "budget">, started: number): void {
  console.log(`${running.cards} cards, ${running.embeddedOnOpen} embedded now; ready in ${Math.round(performance.now() - started)} ms`);
  const key = running.keySource ? `, with ${keySourceText(running.keySource)}` : "";
  console.log(running.off ? `Not ranking: ${running.off}` : `Ranking with Jev${key}, up to ${dollars(budget ?? DEFAULT_BUDGET)} this session`);
  console.log(`The Doodad Finder is at ${running.url} (Ctrl-C stops it)`);
  if (open) execFile(process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open", [running.url]);
  const stop = async () => {
    await running.close();
    if (running.spend) console.log(`Estimated spend this run: $${running.spend.toFixed(4)}; payloads in ${running.payloadLog}`);
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

/** Runs the CLI with its arguments: bin/sc2-doodad-finder.js calls this. */
export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const args = parseFinderArgs(argv, process.env.INIT_CWD ?? process.cwd());
  if (args.help) return void console.log(USAGE);
  if (args.extract) return runCatalogCli(["extract"]);
  if (args.login) return void (process.exitCode = await login());
  if (args.logout) return logout();
  const started = performance.now();
  const running = await startFinder({
    port: args.port,
    ...(args.budget !== undefined ? { budget: args.budget } : {}),
    ...(args.tickLog ? { tickLog: args.tickLog } : {}),
    log: (line) => console.log(line),
  });
  if (args.tickLog) console.log(`Ticks are logged to ${args.tickLog}`);
  announce(running, args, started);
}

// Run as a file in a checkout (node src/cli/doodad-finder.ts); the package's bin calls main.
if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
