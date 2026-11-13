// `sc2-doodad-finder login` and `logout`: Jev's key saved to, or deleted from, the key file in the
// per-user config folder (key-file.ts). On a terminal, login asks for the key in raw mode and
// echoes nothing, on Windows, macOS and Linux alike. From a pipe (`echo key | … login`) it reads
// one line. It checks the key with TypeSafe by listing the account's models, which asks Jev
// nothing and costs no tokens, and saves it unless TypeSafe refuses it; when TypeSafe can't be
// reached, it saves it unchecked and says so. Nothing they print holds the key.

import { createInterface } from "node:readline";
import { StringDecoder } from "node:string_decoder";

import { AuthenticationError, PermissionDeniedError, TypeSafeClient } from "@typesafe-ai/sdk";

import { type ConfigPlatform, keyFile, removeKeyFile, saveKeyFile } from "./key-file.ts";
import { npxHint } from "@team-antioch/sc2-asset-catalog/util/npx.js";

/** What checking a key found: it works, TypeSafe refused it, or it couldn't be checked. */
export type KeyCheckResult = { readonly ok: true } | { readonly ok: false; readonly refused: boolean; readonly reason: string };
export type KeyCheck = (key: string) => Promise<KeyCheckResult>;

/** Checks a key by listing the account's models (GET /v1/models): no Jev request, no tokens. */
export function typesafeKeyCheck({ fetch }: { readonly fetch?: typeof globalThis.fetch } = {}): KeyCheck {
  return async (key) => {
    try {
      const client = new TypeSafeClient({ apiKey: key, logLevel: "off", timeout: 10_000, retry: { maxRetries: 0 }, ...(fetch ? { fetch } : {}) });
      await client.models.list();
      return { ok: true };
    } catch (error) {
      const refused = error instanceof AuthenticationError || error instanceof PermissionDeniedError;
      return { ok: false, refused, reason: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** A terminal's input: raw mode turns its echo off. */
type TerminalInput = NodeJS.ReadableStream & { readonly isTTY?: boolean; setRawMode?(raw: boolean): unknown };

export type LoginOptions = ConfigPlatform & {
  /** Where the key is read from (stdin by default). */
  readonly input?: TerminalInput;
  /** Where the prompt and messages go (stdout by default). */
  readonly output?: NodeJS.WritableStream;
  /** How the key is checked (with TypeSafe by default). */
  readonly check?: KeyCheck;
};

const CANCELLED = Symbol("cancelled");

/** Reads what is typed until Enter, in raw mode so nothing is echoed. Ctrl-C cancels. */
function readHidden(input: TerminalInput): Promise<string | typeof CANCELLED> {
  return new Promise((resolve, reject) => {
    const decoder = new StringDecoder("utf8");
    let typed = "";
    const finish = (result: string | typeof CANCELLED | Error) => {
      input.removeListener("data", onData);
      input.removeListener("end", onEnd);
      input.removeListener("error", finish);
      input.setRawMode?.(false);
      input.pause();
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const onEnd = () => finish(typed);
    const onData = (chunk: Buffer | string) => {
      let text = typeof chunk === "string" ? chunk : decoder.write(chunk);
      while (text) {
        // Escape sequences (arrow keys, bracketed-paste marks) are dropped whole; an unfinished
        // one, or a lone Esc, is dropped by itself, so what follows still counts.
        const escape = /^\x1b(?:\[[0-?]*[ -/]*[@-~]|O[@-~])?/.exec(text);
        if (escape) {
          text = text.slice(escape[0].length);
          if (escape[0] === "\x1b") text = text.replace(/^\[[0-?]*[ -/]*$/, "");
          continue;
        }
        const char = text[0]!;
        text = text.slice(1);
        if (char === "\r" || char === "\n" || char === "\x04") return finish(typed);
        if (char === "\x03") return finish(CANCELLED);
        if (char === "\x7f" || char === "\b") typed = [...typed].slice(0, -1).join("");
        else if (char >= " ") typed += char;
      }
    };
    input.setRawMode?.(true);
    input.on("data", onData);
    input.once("end", onEnd);
    input.once("error", finish);
    input.resume();
  });
}

/** Reads one line from a pipe; an input that ends with none gives "". */
function readLine(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const lines = createInterface({ input, terminal: false, crlfDelay: Infinity });
    let line: string | undefined;
    lines.once("line", (first) => {
      line = first;
      lines.close();
    });
    lines.once("close", () => resolve(line ?? ""));
    input.once("error", reject);
  });
}

/** Asks for the key, checks it and saves it. Returns the exit code: 0 saved, 1 not, 130 cancelled. */
export async function login(options: LoginOptions = {}): Promise<number> {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;
  const say = (line: string) => void output.write(`${line}\n`);
  const env = options.env ?? process.env;
  let read: string | typeof CANCELLED;
  if (input.isTTY && input.setRawMode) {
    say("Paste your TypeSafe API key and press Enter. Nothing shows as you type or paste.");
    output.write("TypeSafe API key: ");
    read = await readHidden(input);
    output.write("\n");
  } else {
    if ((output as { isTTY?: boolean }).isTTY) say(`The input isn't a terminal, so the key will show as you paste it. Pipe it in instead: \`echo <key> | ${npxHint("@team-antioch/sc2-doodad-finder login")}\`. Or paste it and press Enter:`);
    read = await readLine(input);
  }
  if (read === CANCELLED) return say("Cancelled: nothing was saved."), 130;
  const key = read.trim();
  if (!key) return say("No key given, so nothing was saved."), 1;
  // Printable ASCII with no spaces: a key pasted with quotes or a stray character is refused here,
  // before it is sent anywhere or saved.
  if (!/^[!-~]+$/.test(key)) return say("That doesn't look like a TypeSafe key: it has spaces or characters a key can't have. Nothing was saved."), 1;
  const hide = (text: string) => text.split(key).join("[the key]");
  const checked = await (options.check ?? typesafeKeyCheck())(key);
  if (!checked.ok && checked.refused) {
    say(hide(`TypeSafe refused the key (${checked.reason}), so it wasn't saved. Check the key and run login again.`));
    return 1;
  }
  await saveKeyFile(key, options);
  const file = keyFile(options);
  say(checked.ok ? `TypeSafe accepted the key. Saved it to ${file}.` : hide(`Saved the key to ${file}, but couldn't check it: ${checked.reason}`));
  say(`The Finder ranks with Jev from its next start. \`${npxHint("@team-antioch/sc2-doodad-finder logout")}\` deletes the key.`);
  if (env.TYPESAFE_API_KEY?.trim()) say("TYPESAFE_API_KEY is set here too, and while it is set it wins over the saved key.");
  return 0;
}

/** Deletes the key file and says whether there was one. */
export async function logout(options: Pick<LoginOptions, "output" | keyof ConfigPlatform> = {}): Promise<void> {
  const output = options.output ?? process.stdout;
  const say = (line: string) => void output.write(`${line}\n`);
  const file = keyFile(options);
  say((await removeKeyFile(options)) ? `Deleted the saved TypeSafe key (${file}).` : `No saved TypeSafe key to delete (${file}).`);
  if ((options.env ?? process.env).TYPESAFE_API_KEY?.trim()) say("TYPESAFE_API_KEY is still set here, so the Finder still ranks with Jev until it is unset.");
}
