// The finder kit's embeddings model (docs/adr/0001): it runs on this machine, with no network call
// once its weights are downloaded. The model is Alibaba's gte-small (384 dimensions, about 34 MB
// quantized to 8 bits), run by transformers.js on ONNX Runtime for Node. On the test asks
// it found as many candidates as bge-small and bge-base, and more of the top-ranked than
// bge-small, at the fastest narrowing (the test command's --model compares them). Its weights
// download to a machine cache the first time it runs, never into the repo. Tests use a fake behind
// the same interface, so they need no model.

import { existsSync } from "node:fs";
import path from "node:path";

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

/**
 * On Windows, ONNX Runtime's native files need the Microsoft Visual C++ runtime (vcruntime140.dll,
 * msvcp140.dll), which a fresh Windows, and a fresh Node, don't have; loading them then fails with
 * only "The specified module could not be found". The error that says what to install, for that
 * failure; else none.
 */
export function missingRuntime(
  error: unknown,
  { platform = process.platform, arch = process.arch, hasRuntime = runtimeInstalled }: { readonly platform?: NodeJS.Platform; readonly arch?: string; readonly hasRuntime?: () => boolean } = {},
): Error | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (platform !== "win32" || !/specified module could not be found/i.test(message) || !/onnxruntime/i.test(message)) return undefined;
  // The same words come for any DLL missing (onnxruntime.dll quarantined, a partial npx cache):
  // the runtime is only blamed when its own DLLs aren't there.
  if (hasRuntime()) return undefined;
  const redist = arch === "arm64" ? "arm64" : "x64";
  return new MissingRuntimeError(
    `The embeddings model can't load: ONNX Runtime needs the Microsoft Visual C++ Redistributable (${redist}, to match this Node), which isn't installed or is too old. Install it from https://aka.ms/vs/17/release/vc_redist.${redist}.exe (or \`winget install Microsoft.VCRedist.2015+.${redist}\`), then start the Finder again. (ONNX Runtime said: ${message.split(/\r?\n/)[0]})`,
    { cause: error },
  );
}

/** The embeddings model can't load on this machine until something is installed: no use waiting on the rest of a start. */
export class MissingRuntimeError extends Error {
  override name = "MissingRuntimeError";
}

/** Whether the Visual C++ runtime's DLLs are in Windows's System32. */
function runtimeInstalled(): boolean {
  const system32 = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  // vcruntime140_1.dll came with the 2019 runtime: a 2015 or 2017 one has the other two without it.
  return ["vcruntime140.dll", "vcruntime140_1.dll", "msvcp140.dll"].every((dll) => existsSync(path.join(system32, dll)));
}

/** A network failure's words and codes, as fetch and Node give them. */
const NETWORK = /fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|getaddrinfo|socket hang up/i;

/** Why the model didn't load, in words: the connection when a download failed, else the cache. */
export function modelLoadError(model: string, error: unknown, cacheDir: string): Error {
  const cause = error instanceof Error ? error : new Error(String(error));
  const said = `${cause.message} ${(cause.cause as { code?: string } | undefined)?.code ?? ""}`;
  const message = cause.message.replace(/[.\s]+$/, "");
  return new Error(
    NETWORK.test(said)
      ? `The embeddings model (${model}) couldn't download: ${message}. Check the connection and start again: it downloads once.`
      : `The embeddings model (${model}) couldn't load: ${message}. If it keeps failing, delete its cache folder, ${cacheDir}, and start again to download it afresh.`,
    { cause: error },
  );
}

/** At most this many texts per call to the model, so a cold start's thousands of cards don't make one huge batch. */
const BATCH = 32;

/** The local model, loaded once (downloading its weights the first time). */
export async function localEmbedder(options: { readonly model?: string; readonly cacheDir?: string } = {}): Promise<Embedder> {
  const model = options.model ?? FINDER_MODEL;
  const settings = MODELS[model];
  if (!settings) throw new Error(`No settings for the embeddings model ${model}: it takes one of ${Object.keys(MODELS).join(", ")}`);
  let extract;
  try {
    const { env, pipeline } = await import("@huggingface/transformers");
    env.cacheDir = options.cacheDir ?? modelCacheDir();
    extract = await pipeline("feature-extraction", model, { dtype: "q8" });
  } catch (error) {
    throw missingRuntime(error) ?? modelLoadError(model, error, options.cacheDir ?? modelCacheDir());
  }
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
