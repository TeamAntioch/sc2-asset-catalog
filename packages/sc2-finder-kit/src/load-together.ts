// The first-start race both finders run (docs/adr/0002): their extraction and the embeddings model,
// loaded together.

import { type Embedder, localEmbedder, MissingRuntimeError } from "./embedder.ts";

export type LoadTogetherOptions = {
  /** For tests: the embeddings model in place of the local one, or what loads it. */
  readonly embedder?: Embedder | (() => Promise<Embedder>);
  /** For tests: the fetch the extraction downloads with (the global one by default). */
  readonly fetch?: typeof globalThis.fetch;
  /** Lines worth showing the user as the finder starts. */
  readonly log: (line: string) => void;
  /**
   * Starts the finder's extraction (`undefined` when there is nothing to extract). It is handed a
   * `log` that goes quiet once the model has failed, a `fetch` that can be stopped, and the signal
   * that stops it; whatever it can't stop through those it should refuse to start once `signal` is aborted.
   */
  readonly extract: ((io: { readonly log: (line: string) => void; readonly fetch: typeof globalThis.fetch; readonly signal: AbortSignal }) => Promise<void>) | undefined;
};

/**
 * The extraction (done on a first start) and the model, loaded together: on a first start both
 * download. Whichever fails first is said, and a machine that can't load the model (on Windows,
 * without the Visual C++ runtime) is told so at once, the extraction stopped and quiet. Any other
 * model failure waits on the extraction, whose own failure (offline, say) is the one worth saying.
 */
export async function loadTogether(options: LoadTogetherOptions): Promise<Embedder> {
  const stop = new AbortController();
  const fetch = options.fetch ?? globalThis.fetch;
  const stoppable: typeof globalThis.fetch = (input, init) => fetch(input, { ...init, signal: stop.signal });
  const quiet = (line: string) => {
    if (!stop.signal.aborted) options.log(line);
  };
  const extraction = options.extract ? options.extract({ log: quiet, fetch: stoppable, signal: stop.signal }) : Promise.resolve();
  const { embedder } = options;
  const model = typeof embedder === "function" ? embedder() : embedder ? Promise.resolve(embedder) : localEmbedder();
  const first = await Promise.race([
    model.then((loaded) => ({ embedder: loaded }), (error: unknown) => ({ modelError: error })),
    // The extraction's success doesn't end the race: only its failure does.
    extraction.then(() => new Promise<never>(() => {}), (error: unknown) => ({ extractionError: error })),
  ]);
  if ("extractionError" in first) throw first.extractionError;
  if ("modelError" in first) {
    if (first.modelError instanceof MissingRuntimeError) {
      stop.abort();
      extraction.catch(() => {});
      throw first.modelError;
    }
    await extraction;
    throw first.modelError;
  }
  await extraction;
  return first.embedder;
}
