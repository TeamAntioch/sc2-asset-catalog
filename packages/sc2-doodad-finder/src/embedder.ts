// The Doodad Finder's embeddings model (docs/adr/0001): it runs on this machine, with no network call
// once its weights are downloaded. The model is Alibaba's gte-small (384 dimensions, about 34 MB
// quantized to 8 bits), run by transformers.js on ONNX Runtime for Node. On the test asks
// it found as many candidates as bge-small and bge-base, and more of the top-ranked than
// bge-small, at the fastest narrowing (the test command's --model compares them). Its weights
// download to a machine cache the first time it runs, never into the repo. Tests use a fake behind
// the same interface, so they need no model.

import { modelCacheDir } from "./cache-dir.ts";

export { modelCacheDir } from "./cache-dir.ts";

/** Embeds texts as unit vectors: an ask as a query, a card as a passage. */
export type Embedder = {
  /** The model's name: vectors from two models aren't comparable, so the cache keeps them apart. */
  readonly model: string;
  embed(texts: readonly string[], as: "query" | "passage"): Promise<Float32Array[]>;
};

export const FINDER_MODEL = "Xenova/gte-small";

/**
 * How each model the test command can compare pools its tokens into one vector, and what it puts
 * before a query: bge pools by its first token and asks for an instruction before a short query
 * searched against passages; gte averages its tokens and takes none.
 */
export const MODELS: Readonly<Record<string, { readonly pooling: "cls" | "mean"; readonly queryPrefix: string }>> = {
  "Xenova/bge-small-en-v1.5": { pooling: "cls", queryPrefix: "Represent this sentence for searching relevant passages: " },
  "Xenova/bge-base-en-v1.5": { pooling: "cls", queryPrefix: "Represent this sentence for searching relevant passages: " },
  "Xenova/gte-small": { pooling: "mean", queryPrefix: "" },
  "Xenova/gte-base": { pooling: "mean", queryPrefix: "" },
};

/** At most this many texts per call to the model, so a cold start's thousands of cards don't make one huge batch. */
const BATCH = 32;

/** The local model, loaded once (downloading its weights the first time). */
export async function localEmbedder(options: { readonly model?: string; readonly cacheDir?: string } = {}): Promise<Embedder> {
  const model = options.model ?? FINDER_MODEL;
  const settings = MODELS[model];
  if (!settings) throw new Error(`No settings for the embeddings model ${model}: it takes one of ${Object.keys(MODELS).join(", ")}`);
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = options.cacheDir ?? modelCacheDir();
  const extract = await pipeline("feature-extraction", model, { dtype: "q8" });
  return {
    model,
    async embed(texts, as) {
      const vectors: Float32Array[] = [];
      for (let start = 0; start < texts.length; start += BATCH) {
        const batch = texts.slice(start, start + BATCH).map((text) => (as === "query" ? settings.queryPrefix + text : text));
        const output = await extract(batch, { pooling: settings.pooling, normalize: true });
        const [rows, dimensions] = output.dims as [number, number];
        const data = output.data as Float32Array;
        for (let row = 0; row < rows; row++) vectors.push(data.slice(row * dimensions, (row + 1) * dimensions));
      }
      return vectors;
    },
  };
}
