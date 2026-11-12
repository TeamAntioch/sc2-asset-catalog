// `sc2-doodad-finder login` and `logout` (src/login.ts): the key asked for with no echo on a
// terminal, or read as one line from a pipe, checked, then saved to the key file; logout deletes it.
// The key never appears in what they print. Each test has its own config folder; checks are fakes.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable, Writable } from "node:stream";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readKeyFile, saveKeyFile } from "../src/key-file.ts";
import { type KeyCheck, login, logout, typesafeKeyCheck } from "../src/login.ts";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "doodad-finder-login-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});
const on = (more: Record<string, string> = {}) => ({ env: { SC2_ASSET_CATALOG_CONFIG: dir, ...more } });

/** What a command printed. */
function printed() {
  let text = "";
  const output = new Writable({
    write(chunk, _encoding, done) {
      text += String(chunk);
      done();
    },
  });
  return { output, text: () => text };
}

const works: KeyCheck = async () => ({ ok: true });
const refuses: KeyCheck = async () => ({ ok: false, refused: true, reason: "401 Cannot authenticate" });
const offline: KeyCheck = async () => ({ ok: false, refused: false, reason: "fetch failed" });

/** A terminal: raw mode can be set, and what is typed arrives as it is typed. */
function terminal() {
  const input = new PassThrough() as PassThrough & { isTTY: boolean; isRaw: boolean; setRawMode(raw: boolean): unknown };
  input.isTTY = true;
  input.isRaw = false;
  const modes: boolean[] = [];
  input.setRawMode = (raw: boolean) => {
    modes.push(raw);
    input.isRaw = raw;
    return input;
  };
  return { input, modes };
}

describe("login from a pipe", () => {
  it("reads one line, checks the key and saves it, never printing it", async () => {
    const out = printed();
    const checked: string[] = [];
    const code = await login({ input: Readable.from(["ts-piped-key\n", "next line\n"]), output: out.output, ...on(), check: async (key) => (checked.push(key), { ok: true }) });
    expect(code).toBe(0);
    expect(checked).toEqual(["ts-piped-key"]);
    expect(readKeyFile(on())).toBe("ts-piped-key");
    expect(out.text()).toMatch(/TypeSafe accepted the key/);
    expect(out.text()).toContain(path.join(dir, "typesafe-key"));
    expect(out.text()).not.toContain("ts-piped-key");
  });

  it("reads a last line with no newline, trimmed", async () => {
    const out = printed();
    expect(await login({ input: Readable.from(["  ts-no-newline \r"]), output: out.output, ...on(), check: works })).toBe(0);
    expect(readKeyFile(on())).toBe("ts-no-newline");
  });

  it("saves nothing for an empty line", async () => {
    const out = printed();
    expect(await login({ input: Readable.from(["\n"]), output: out.output, ...on(), check: works })).toBe(1);
    expect(readKeyFile(on())).toBeUndefined();
    expect(out.text()).toMatch(/no key/i);
  });

  it("saves nothing when TypeSafe refuses the key, and keeps the key saved before", async () => {
    await saveKeyFile("ts-old", on());
    const out = printed();
    expect(await login({ input: Readable.from(["ts-wrong\n"]), output: out.output, ...on(), check: refuses })).toBe(1);
    expect(readKeyFile(on())).toBe("ts-old");
    expect(out.text()).toMatch(/refused/);
    expect(out.text()).not.toContain("ts-wrong");
  });

  it("saves the key unchecked when TypeSafe can't be reached, and says so", async () => {
    const out = printed();
    expect(await login({ input: Readable.from(["ts-unchecked\n"]), output: out.output, ...on(), check: offline })).toBe(0);
    expect(readKeyFile(on())).toBe("ts-unchecked");
    expect(out.text()).toMatch(/couldn't check it: fetch failed/);
  });

  it("refuses a key with spaces or characters a key can't have, before checking it", async () => {
    for (const line of ["ts key\n", "\u201cts-quoted\u201d\n", "ts-zero\u200bwidth\n"]) {
      const out = printed();
      const checked: string[] = [];
      expect(await login({ input: Readable.from([line]), output: out.output, ...on(), check: async (key) => (checked.push(key), { ok: true }) })).toBe(1);
      expect(checked).toEqual([]);
      expect(out.text()).toMatch(/doesn't look like a TypeSafe key/);
    }
    expect(readKeyFile(on())).toBeUndefined();
  });

  it("says what it pasted will show when the input is a pipe but the output is a terminal", async () => {
    const out = printed();
    (out.output as Writable & { isTTY?: boolean }).isTTY = true;
    await login({ input: Readable.from(["ts-piped\n"]), output: out.output, ...on(), check: works });
    expect(out.text()).toMatch(/isn't a terminal, so the key will show as you paste/);
  });

  it("says the variable wins when TYPESAFE_API_KEY is set", async () => {
    const out = printed();
    await login({ input: Readable.from(["ts-saved\n"]), output: out.output, ...on({ TYPESAFE_API_KEY: "ts-env-key" }), check: works });
    expect(out.text()).toMatch(/TYPESAFE_API_KEY is set .* wins/);
    expect(out.text()).not.toContain("ts-env-key");
  });

  it("never prints the key, even in a reason that holds it", async () => {
    const out = printed();
    await login({ input: Readable.from(["ts-echoed\n"]), output: out.output, ...on(), check: async (key) => ({ ok: false, refused: true, reason: `bad key ${key}` }) });
    expect(out.text()).not.toContain("ts-echoed");
  });
});

describe("login on a terminal", () => {
  it("asks with no echo in raw mode, with backspace and a paste, then puts the terminal back", async () => {
    const { input, modes } = terminal();
    const out = printed();
    const done = login({ input, output: out.output, ...on(), check: works });
    await new Promise((resolve) => setImmediate(resolve));
    expect(input.isRaw).toBe(true);
    input.write("ts-ab");
    input.write("\x7f");
    input.write("\x1b[200~c-pasted\x1b[201~");
    input.write("\r");
    expect(await done).toBe(0);
    expect(readKeyFile(on())).toBe("ts-ac-pasted");
    expect(modes).toEqual([true, false]);
    expect(out.text()).toMatch(/TypeSafe API key: /);
    for (const typed of ["ts-ab", "ts-ac", "pasted", "*"]) expect(out.text()).not.toContain(typed);
  });

  it("drops a lone Esc and an unfinished escape sequence without losing Enter or the next key", async () => {
    const { input } = terminal();
    const out = printed();
    const done = login({ input, output: out.output, ...on(), check: works });
    await new Promise((resolve) => setImmediate(resolve));
    input.write("\x1b");
    input.write("ts-a\x1b[A");
    input.write("b\x1b[");
    input.write("\r");
    expect(await done).toBe(0);
    expect(readKeyFile(on())).toBe("ts-ab");
  });

  it("still cancels on Ctrl-C after an unfinished escape sequence", async () => {
    const { input, modes } = terminal();
    const out = printed();
    const done = login({ input, output: out.output, ...on(), check: works });
    await new Promise((resolve) => setImmediate(resolve));
    input.write("ts\x1b[");
    input.write("\x03");
    expect(await done).toBe(130);
    expect(modes).toEqual([true, false]);
  });

  it("saves nothing on Ctrl-C, and puts the terminal back", async () => {
    const { input, modes } = terminal();
    const out = printed();
    const done = login({ input, output: out.output, ...on(), check: works });
    await new Promise((resolve) => setImmediate(resolve));
    input.write("ts-half\x03");
    expect(await done).toBe(130);
    expect(readKeyFile(on())).toBeUndefined();
    expect(modes).toEqual([true, false]);
    expect(out.text()).not.toContain("ts-half");
  });
});

describe("logout", () => {
  it("deletes the key file and says so", async () => {
    await saveKeyFile("ts-saved", on());
    const out = printed();
    await logout({ output: out.output, ...on() });
    expect(readKeyFile(on())).toBeUndefined();
    expect(out.text()).toMatch(/Deleted the saved TypeSafe key/);
    expect(out.text()).not.toContain("ts-saved");
  });

  it("says when there was no key file", async () => {
    const out = printed();
    await logout({ output: out.output, ...on() });
    expect(out.text()).toMatch(/No saved TypeSafe key/);
  });

  it("says TYPESAFE_API_KEY is still set when it is", async () => {
    const out = printed();
    await logout({ output: out.output, ...on({ TYPESAFE_API_KEY: "ts-env-key" }) });
    expect(out.text()).toMatch(/TYPESAFE_API_KEY is still set/);
    expect(out.text()).not.toContain("ts-env-key");
  });
});

describe("typesafeKeyCheck", () => {
  const answering = (status: number, body: unknown) => {
    const asked: Request[] = [];
    const fetch = async (input: string | URL | Request, init?: RequestInit) => {
      asked.push(new Request(input, init));
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    };
    return { fetch: fetch as typeof globalThis.fetch, asked };
  };

  it("lists the account's models, which asks Jev nothing, and takes an answer as a working key", async () => {
    const { fetch, asked } = answering(200, { models: [{ name: "jev-latest", description: "", release_date: "" }] });
    expect(await typesafeKeyCheck({ fetch })("ts-good")).toEqual({ ok: true });
    expect(asked.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual(["GET /v1/models"]);
  });

  it("takes a 401 or 403 as a refused key", async () => {
    for (const status of [401, 403]) expect(await typesafeKeyCheck(answering(status, { error: "no" }))("ts-bad")).toMatchObject({ ok: false, refused: true });
  });

  it("takes a failed connection or a server error as unchecked", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof globalThis.fetch;
    expect(await typesafeKeyCheck({ fetch })("ts-any")).toMatchObject({ ok: false, refused: false });
    expect(await typesafeKeyCheck(answering(500, { error: "down" }))("ts-any")).toMatchObject({ ok: false, refused: false });
  });
});
