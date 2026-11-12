import type { z } from "zod";

/** A zod error's issues on one line: each issue's path (or `whole`, for the value itself) and message. */
export function formatIssues(error: z.ZodError, whole: string): string {
  return error.issues.map((issue) => `${issue.path.join(".") || whole}: ${issue.message}`).join("; ");
}
