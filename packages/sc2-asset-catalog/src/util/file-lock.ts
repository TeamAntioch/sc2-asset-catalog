// Lock files that processes on one machine take and break, for state several `render` runs share.
import { randomUUID } from "node:crypto";
import { link, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

/** Whether a process with this id is running on this machine (one we may not signal is). */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

const code = (error: unknown): string | undefined => (error as NodeJS.ErrnoException).code;

/**
 * Creates `lockPath` naming this process, unless it exists: true when this call made it. The pid is
 * written to a file of its own first and linked into place, so a lock is never seen empty.
 */
export async function createLock(lockPath: string): Promise<boolean> {
  const partial = `${lockPath}.${randomUUID()}.partial`;
  await writeFile(partial, String(process.pid));
  try {
    await link(partial, lockPath);
    return true;
  } catch (error) {
    if (code(error) === "EEXIST") return false;
    throw error;
  } finally {
    await rm(partial, { force: true });
  }
}

/**
 * Removes `lockPath` if the process it names has gone, or (with `maxAgeMs`) it is older than that,
 * whoever holds it; true when the lock is gone after. Of several removing a stale lock at once, one
 * moves it aside; a lock another took meanwhile, moved aside by mistake, is put back.
 */
export async function removeIfStale(lockPath: string, { maxAgeMs }: { readonly maxAgeMs?: number } = {}): Promise<boolean> {
  let seen: string;
  let age: number;
  try {
    [seen, age] = await Promise.all([readFile(lockPath, "utf8"), stat(lockPath).then((info) => Date.now() - info.mtimeMs)]);
  } catch (error) {
    if (code(error) === "ENOENT") return true;
    throw error;
  }
  if (isRunning(Number(seen)) && (maxAgeMs === undefined || age <= maxAgeMs)) return false;
  const aside = `${lockPath}.${randomUUID()}.stale`;
  try {
    await rename(lockPath, aside);
  } catch (error) {
    if (code(error) === "ENOENT") return true;
    throw error;
  }
  try {
    if ((await readFile(aside, "utf8")) !== seen) await link(aside, lockPath).catch(() => {});
  } finally {
    await rm(aside, { force: true });
  }
  return true;
}

/**
 * Runs `use` holding `lockPath`, so other processes (and this one's other callers) wait: for short
 * work that mustn't interleave with another's, such as a read-change-write. A lock whose process has
 * gone, or that is older than `staleAfterMs` (far longer than such work takes, so a reused pid can't
 * keep it), is broken. Past `timeoutMs` of waiting it fails.
 */
export async function withFileLock<T>(lockPath: string, use: () => Promise<T>, { timeoutMs = 30_000, staleAfterMs = 60_000 } = {}): Promise<T> {
  for (let waited = 0; !(await createLock(lockPath)); ) {
    if (await removeIfStale(lockPath, { maxAgeMs: staleAfterMs })) continue;
    if (waited > timeoutMs) throw new Error(`${lockPath} has been held for over ${timeoutMs / 1000} s; remove it if no other render is running`);
    const pause = 5 + Math.random() * 20;
    await sleep(pause);
    waited += pause;
  }
  try {
    return await use();
  } finally {
    await rm(lockPath, { force: true });
  }
}
