// Lock files shared by `render` runs (src/util/file-lock.ts): taken by one at a time, broken when
// their process has gone or they're too old to be in use.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLock, withFileLock } from "../src/util/file-lock.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "file-lock-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** The id of a process that has run and exited. */
const gonePid = (): Promise<number> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", ""]);
    child.on("exit", () => resolve(child.pid!));
  });

describe("file locks", () => {
  it("creates a lock naming this process only when there is none", async () => {
    const lock = path.join(dir, "a.lock");
    expect(await createLock(lock)).toBe(true);
    expect(await readFile(lock, "utf8")).toBe(String(process.pid));
    expect(await createLock(lock)).toBe(false);
  });

  it("runs callers one at a time, and lets go after", async () => {
    const lock = path.join(dir, "a.lock");
    let inside = 0;
    let most = 0;
    await Promise.all(
      Array.from({ length: 5 }, () =>
        withFileLock(lock, async () => {
          most = Math.max(most, ++inside);
          await new Promise((resolve) => setTimeout(resolve, 10));
          inside--;
        }),
      ),
    );
    expect(most).toBe(1);
    expect(existsSync(lock)).toBe(false);
  });

  it("breaks a lock whose process has gone, and one too old to be in use whoever holds it", async () => {
    const lock = path.join(dir, "a.lock");
    await writeFile(lock, String(await gonePid()));
    expect(await withFileLock(lock, async () => "ran", { timeoutMs: 1000 })).toBe("ran");

    await writeFile(lock, String(process.pid));
    const old = new Date(Date.now() - 120_000);
    await utimes(lock, old, old);
    expect(await withFileLock(lock, async () => "ran", { timeoutMs: 1000, staleAfterMs: 60_000 })).toBe("ran");
  });

  it("waits for a lock a running process holds, and fails past its timeout", async () => {
    const lock = path.join(dir, "a.lock");
    await writeFile(lock, String(process.pid));
    await expect(withFileLock(lock, async () => "ran", { timeoutMs: 100 })).rejects.toThrow(/held for over/);
    expect(await readFile(lock, "utf8")).toBe(String(process.pid));
  });
});
