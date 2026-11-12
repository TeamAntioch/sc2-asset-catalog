import { z } from "zod";

import { formatIssues } from "./format-issues.js";

/** Some text, not only spaces: what every text field of the catalog's files is. */
export const TextSchema = z.string().regex(/\S/, "needs some text");

/**
 * A JSON file's contents checked against `schema`, refused naming `shown` when it isn't JSON, and
 * naming each issue's path when it isn't `what` (such as "a valid Doodad Uses file").
 */
export function parseJsonFile<Schema extends z.ZodType>(text: string, shown: string, schema: Schema, what: string): z.output<Schema> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`${shown} isn't JSON: ${(error as Error).message}`, { cause: error });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new Error(`${shown} isn't ${what}: ${formatIssues(parsed.error, "(file)")}`);
  return parsed.data;
}
