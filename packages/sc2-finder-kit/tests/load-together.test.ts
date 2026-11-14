// The first-start race (src/load-together.ts): the extraction and the model, loaded together.
import { describe, expect, it } from "vitest";

import { MissingRuntimeError } from "../src/embedder.ts";
import { loadTogether } from "../src/load-together.ts";
import { fakeEmbedder } from "./fake-embedder.ts";

const never = () => new Promise<never>(() => {});

describe("loadTogether", () => {
  it("returns the model once the extraction is done", async () => {
    const model = fakeEmbedder();
    const order: string[] = [];
    const embedder = await loadTogether({
      embedder: model,
      log: () => {},
      extract: async () => {
        order.push("extracted");
      },
    });
    expect(embedder).toBe(model);
    expect(order).toEqual(["extracted"]);
  });

  it("needs no extraction when there is none to run", async () => {
    const model = fakeEmbedder();
    expect(await loadTogether({ embedder: () => Promise.resolve(model), log: () => {}, extract: undefined })).toBe(model);
  });

  it("says the extraction's failure first, without waiting on a slow model", async () => {
    const failure = new Error("offline");
    await expect(loadTogether({ embedder: never, log: () => {}, extract: () => Promise.reject(failure) })).rejects.toBe(failure);
  });

  it("stops the extraction and its output at once when the model's runtime is missing", async () => {
    const lines: string[] = [];
    let signal: AbortSignal | undefined;
    let quiet: ((line: string) => void) | undefined;
    const run = loadTogether({
      embedder: () => Promise.reject(new MissingRuntimeError("no runtime")),
      log: (line) => lines.push(line),
      extract: ({ log, signal: stop }) => {
        signal = stop;
        quiet = log;
        return never();
      },
    });
    await expect(run).rejects.toBeInstanceOf(MissingRuntimeError);
    expect(signal?.aborted).toBe(true);
    quiet?.("downloading");
    expect(lines).toEqual([]);
  });

  it("waits on the extraction after another model failure, so its failure is the one said", async () => {
    const failure = new Error("offline");
    await expect(
      loadTogether({
        embedder: () => Promise.reject(new Error("model: fetch failed")),
        log: () => {},
        extract: () => new Promise<void>((_, reject) => setTimeout(() => reject(failure), 10)),
      }),
    ).rejects.toBe(failure);
  });

  it("says the model's failure when the extraction succeeds", async () => {
    const failure = new Error("corrupt model");
    await expect(loadTogether({ embedder: () => Promise.reject(failure), log: () => {}, extract: async () => {} })).rejects.toBe(failure);
  });

  it("hands the extraction a fetch that stops with the signal", async () => {
    let aborted = false;
    const fetchStub: typeof globalThis.fetch = (_input, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject((aborted = true, new Error("aborted")))));
    const run = loadTogether({
      embedder: () => Promise.reject(new MissingRuntimeError("no runtime")),
      fetch: fetchStub,
      log: () => {},
      extract: ({ fetch }) => fetch("https://example.test/").then(() => {}),
    });
    await expect(run).rejects.toBeInstanceOf(MissingRuntimeError);
    expect(aborted).toBe(true);
  });
});
