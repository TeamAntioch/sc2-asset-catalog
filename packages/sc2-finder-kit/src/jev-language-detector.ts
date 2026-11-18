// A language detector (language-detector.ts) that asks Jev one Choice question: English, or another
// language. Measured on 70 asks in Spanish, German, French, Portuguese and Polish and 25 in English,
// it called all 25 English asks English and 68 of the 70 others another language (the two it
// took for English were mostly the proper name Xel'Naga, and English search finds those too), in
// about 110 ms and 350 input tokens, under two thousandths of a cent a call.

import { type Fetch, type Question, type SystemOneRequest, TypeSafeClient } from "@typesafe-ai/sdk";

import { JEV_INPUT_PRICE, JEV_MODEL } from "./jev-ranker.ts";
import { type Detection, ENGLISH_AT, type LanguageDetector } from "./language-detector.ts";
import type { PayloadLog } from "./ranker.ts";

const ENGLISH = "English";
const OTHER = "Another language";

export const LANGUAGE_QUESTION: Question = {
  type: "choice",
  instructions:
    "What language is the search in `ask` written in? A search is a few words a StarCraft II map maker types to find a map decoration. Game names such as Zerg, Protoss, Terran and Xel'Naga are used in every language.",
  criteria: { [ENGLISH]: null, [OTHER]: null },
};

/** The request for one ask: what is sent and logged. */
export const languageRequest = (ask: string): SystemOneRequest => ({ model: JEV_MODEL, state: { ask }, questions: { language: LANGUAGE_QUESTION } });

export type JevLanguageOptions = {
  readonly apiKey: string;
  readonly log?: PayloadLog;
  /** For tests: answers in place of the API. */
  readonly fetch?: Fetch;
  /** Milliseconds per attempt (3 s by default). */
  readonly timeout?: number;
};

export function jevLanguageDetector(options: JevLanguageOptions): LanguageDetector {
  const client = new TypeSafeClient({ apiKey: options.apiKey, logLevel: "off", ...(options.fetch ? { fetch: options.fetch } : {}), timeout: options.timeout ?? 3000 });
  const hide = (text: string) => text.split(options.apiKey).join("[the key]");
  return {
    async detect(ask, { signal } = {}): Promise<Detection> {
      const payload = languageRequest(ask);
      const at = new Date().toISOString();
      const started = performance.now();
      let result;
      try {
        result = await client.systemOne(payload, signal ? { signal } : {});
      } catch (error) {
        // The key never goes further than the client: not into the log, the terminal or the page.
        const message = hide(error instanceof Error ? error.message : String(error));
        options.log?.({ ranker: "jev", at, ms: performance.now() - started, request: payload, error: message });
        throw new Error(`jev: the language check failed: ${message}`);
      }
      options.log?.({ ranker: "jev", at, ms: performance.now() - started, request: payload, response: result });
      const answer = result.answers.language;
      if (answer?.type !== "choice") throw new Error("jev: the language check came back without an answer");
      const pEnglish = answer.probabilities[ENGLISH] ?? (answer.choice === ENGLISH ? 1 : 0);
      return { english: pEnglish >= ENGLISH_AT, pEnglish, cost: (result.usage.input_tokens ?? 0) * JEV_INPUT_PRICE };
    },
  };
}
