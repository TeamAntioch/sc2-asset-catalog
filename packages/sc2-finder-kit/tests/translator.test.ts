// The translator slot: which asks need translating, what a translator's failure does, and the
// finder searching the English an ask was translated to.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type Finder, openFinder } from "../src/finder.ts";
import { needsTranslation, translateAsk, type Translator } from "../src/translator.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { type ToyCard, toyTagMatches, TOYS } from "./toy.ts";

describe("needsTranslation", () => {
  it.each([
    ["тяжёлый пресс над конвейером", true],
    ["눈 덮인 소나무", true],
    ["雪の松", true],
    ["صندوق", true],
    ["Zerg хитиновый туннель", true],
    ["heavy press 2", false],
    ["Zerg_Carcass: bone-pile!", false],
    ["señor café über", false],
    ["", false],
    ["42 - 7", false],
  ])("%s -> %s", (ask, expected) => {
    expect(needsTranslation(ask)).toBe(expected);
  });
});

const translator = (translate: Translator["translate"]): Translator & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    translate: (ask, options) => {
      calls.push(ask);
      return translate(ask, options);
    },
  };
};

describe("translateAsk", () => {
  it("does not call the translator for an English ask or without a translator", async () => {
    const t = translator(async () => "never");
    expect(await translateAsk("round ball", t)).toBeUndefined();
    expect(await translateAsk("мяч", undefined)).toBeUndefined();
    expect(t.calls).toEqual([]);
  });

  it("returns the translator's English, trimmed, with the original", async () => {
    const t = translator(async () => "  round ball \n");
    const result = await translateAsk("круглый мяч", t);
    expect(result).toMatchObject({ original: "круглый мяч", english: "round ball" });
    expect(result?.error).toBeUndefined();
  });

  it("leaves the ask as typed when the translator throws, answers nothing or runs out of time", async () => {
    const failing = await translateAsk("мяч", translator(async () => Promise.reject(new Error("gateway 500"))));
    expect(failing).toMatchObject({ english: "мяч", error: "gateway 500" });
    const empty = await translateAsk("мяч", translator(async () => "  "));
    expect(empty).toMatchObject({ english: "мяч", error: "the translator answered nothing" });
    const slow = await translateAsk(
      "мяч",
      translator((_ask, options) => new Promise<string>((_resolve, reject) => options?.signal?.addEventListener("abort", () => reject(new Error("timed out"))))),
      { timeout: 20 },
    );
    expect(slow).toMatchObject({ english: "мяч", error: "timed out" });
  });
});

let dir: string | undefined;
let open: Finder<ToyCard, readonly ToyCard[]> | undefined;
afterEach(async () => {
  open?.close();
  open = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

const start = async (t?: Translator) => {
  dir = await mkdtemp(path.join(tmpdir(), "finder-kit-translate-"));
  const searched: string[] = [];
  const finder = await openFinder<ToyCard, readonly ToyCard[]>({
    load: async () => TOYS,
    cards: (sources) => sources,
    keyword: (sources, ask) => {
      searched.push(ask);
      const words = ask.toLowerCase().match(/[a-z]+/g) ?? [];
      return sources.filter((card) => words.some((word) => card.text.toLowerCase().includes(word)));
    },
    tagMatches: toyTagMatches,
    provides: () => true,
    embedder: fakeEmbedder(),
    cacheFile: path.join(dir, "vectors.bin"),
    ...(t ? { translator: t } : {}),
  });
  open = finder;
  return { finder, searched };
};

describe("openFinder with a translator", () => {
  it("searches the English an ask was translated to, and says so", async () => {
    const t = translator(async () => "hoop");
    const { finder, searched } = await start(t);
    const { candidates, translation, timings } = await finder.narrow("обруч");
    expect(candidates[0]!.id).toBe("GreenRing");
    expect(searched).toEqual(["hoop"]);
    expect(translation).toMatchObject({ original: "обруч", english: "hoop" });
    expect(timings.translate).toBeGreaterThanOrEqual(0);
  });

  it("searches an English ask untranslated, with no translation to report", async () => {
    const t = translator(async () => "never");
    const { finder, searched } = await start(t);
    const result = await finder.narrow("hoop");
    expect(t.calls).toEqual([]);
    expect(searched).toEqual(["hoop"]);
    expect(result.translation).toBeUndefined();
    expect(result.timings.translate).toBeUndefined();
  });

  it("still searches, as typed, when the translator fails", async () => {
    const { finder, searched } = await start(translator(async () => Promise.reject(new Error("down"))));
    const { translation } = await finder.narrow("обруч");
    expect(searched).toEqual(["обруч"]);
    expect(translation).toMatchObject({ english: "обруч", error: "down" });
  });

  it("searches non-English asks as typed without a translator", async () => {
    const { finder, searched } = await start();
    const { translation } = await finder.narrow("обруч");
    expect(searched).toEqual(["обруч"]);
    expect(translation).toBeUndefined();
  });
});
