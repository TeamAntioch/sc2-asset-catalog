import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";

/**
 * Writes a file whole: to a temporary name of its own beside it, then over it, so a reader never sees
 * half of it, and two writers at once (in two processes, say) never write into one temporary file.
 */
export async function writeWhole(file: string, data: string | Uint8Array): Promise<void> {
  const partial = `${file}.${randomUUID()}.partial`;
  try {
    await writeFile(partial, data);
    await rename(partial, file);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}
