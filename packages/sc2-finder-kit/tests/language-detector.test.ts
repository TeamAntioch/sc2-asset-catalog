// The language detector slot: the vocabulary gate that keeps English asks free, how translateAsk and
// the finder use a detector for Latin-script asks, and Jev's detector reading its answer.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type Finder, openFinder } from "../src/finder.ts";
import { jevLanguageDetector, languageRequest } from "../src/jev-language-detector.ts";
import { cachingDetector, type Detection, ENGLISH_AT, inVocabulary, type LanguageDetector, vocabularyOf } from "../src/language-detector.ts";
import { translateAsk, type Translator } from "../src/translator.ts";
import { fakeEmbedder } from "./fake-embedder.ts";
import { type ToyCard, toyTagMatches, TOYS } from "./toy.ts";

const detection = (pEnglish: number, cost = 0.00001): Detection => ({ english: pEnglish >= ENGLISH_AT, pEnglish, cost });
const detector = (pEnglish: number | Error): LanguageDetector & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    detect: async (ask) => {
      calls.push(ask);
      if (pEnglish instanceof Error) throw pEnglish;
      return detection(pEnglish);
    },
  };
};
const translator = (english = "round ball"): Translator & { calls: string[] } => {
  const calls: string[] = [];
  return { calls, translate: async (ask) => (calls.push(ask), english) };
};

describe("vocabulary", () => {
  const vocabulary = vocabularyOf(["Red Ball\nround and red; colour: red", "Sandbag wall, stacked sandbags", "Dead Palm Tree"]);
  it("holds the words of the cards' text, lower-cased", () => {
    expect([...vocabulary]).toContain("sandbag");
    expect([...vocabulary]).toContain("colour");
  });
  it.each([
    ["red ball", true],
    ["Red Balls", true],
    ["palm trees", true],
    ["sandbag walls", true],
    ["sandbag fences", false],
    ["palmera", false],
    ["red palmera", false],
    ["42", true],
  ])("%s -> %s", (ask, expected) => expect(inVocabulary(ask, vocabulary)).toBe(expected));
});

describe("translateAsk with a detector", () => {
  const vocabulary = vocabularyOf(["round ball", "red cube"]);

  it("does not ask the detector when the ask is in the vocabulary, has no letters, or is in another script", async () => {
    const d = detector(0);
    const t = translator();
    expect(await translateAsk("red ball", t, { detector: d, vocabulary })).toBeUndefined();
    expect(await translateAsk("42 -", t, { detector: d })).toBeUndefined();
    expect(await translateAsk("мяч", t, { detector: d, vocabulary })).toMatchObject({ translated: true });
    expect(d.calls).toEqual([]);
  });

  it("leaves an ask the detector calls English, saying so, without translating it", async () => {
    const t = translator();
    const result = await translateAsk("gantry crane", t, { detector: detector(0.98), vocabulary });
    expect(result).toMatchObject({ english: "gantry crane", translated: false, detection: { english: true, pEnglish: 0.98 } });
    expect(t.calls).toEqual([]);
  });

  it("translates an ask the detector calls another language", async () => {
    const t = translator("round ball");
    const result = await translateAsk("bola redonda", t, { detector: detector(0.02), vocabulary });
    expect(result).toMatchObject({ original: "bola redonda", english: "round ball", translated: true, detection: { english: false } });
    expect(t.calls).toEqual(["bola redonda"]);
  });

  it("translates a doubtful ask: below the English threshold counts as not English", async () => {
    const result = await translateAsk("bola", translator(), { detector: detector(0.79), vocabulary });
    expect(result?.translated).toBe(true);
  });

  it("translates when the detector fails, noting why", async () => {
    const result = await translateAsk("bola", translator(), { detector: detector(new Error("jev: down")), vocabulary });
    expect(result).toMatchObject({ translated: true, detection: { error: "jev: down" } });
  });

  it("does nothing without a translator or without a detector for a Latin-script ask", async () => {
    expect(await translateAsk("bola", undefined, { detector: detector(0) })).toBeUndefined();
    expect(await translateAsk("bola", translator())).toBeUndefined();
  });
});

describe("cachingDetector", () => {
  it("asks once per ask, and a repeat costs nothing", async () => {
    const inner = detector(0.01);
    const cached = cachingDetector(inner);
    const first = await cached.detect("bola");
    const again = await cached.detect("bola");
    expect(inner.calls).toEqual(["bola"]);
    expect(first.cost).toBeGreaterThan(0);
    expect(again).toMatchObject({ english: false, cost: 0 });
  });
  it("doesn't remember a failure", async () => {
    let fail = true;
    const cached = cachingDetector({ detect: async () => (fail ? Promise.reject(new Error("down")) : detection(0.5)) });
    await expect(cached.detect("x")).rejects.toThrow("down");
    fail = false;
    expect((await cached.detect("x")).pEnglish).toBe(0.5);
  });
});

describe("jevLanguageDetector", () => {
  const answer = (probabilities: Record<string, number>, choice: string, status = 200): typeof fetch =>
    (async () => new Response(JSON.stringify({ model: "jev-latest", answers: { language: { type: "choice", choice, confidence: 0.9, probabilities } }, usage: { input_tokens: 350, output_tokens: 0 } }), { status, headers: { "content-type": "application/json" } })) as typeof fetch;

  it("asks one Choice question: English, or another language", () => {
    const request = languageRequest("bola redonda");
    expect(request.state).toEqual({ ask: "bola redonda" });
    expect(Object.keys(request.questions)).toEqual(["language"]);
    expect(JSON.stringify(request.questions.language)).toContain("Another language");
  });

  it("reads the probability of English, and prices the input tokens", async () => {
    const english = await jevLanguageDetector({ apiKey: "k", fetch: answer({ English: 0.99, "Another language": 0.01 }, "English") }).detect("gantry crane");
    expect(english).toMatchObject({ english: true, pEnglish: 0.99 });
    expect(english.cost).toBeCloseTo((350 * 0.042) / 1e6, 10);
    const other = await jevLanguageDetector({ apiKey: "k", fetch: answer({ English: 0.03, "Another language": 0.97 }, "Another language") }).detect("bola redonda");
    expect(other).toMatchObject({ english: false, pEnglish: 0.03 });
  });

  it("fails without the key in the message", async () => {
    const detector = jevLanguageDetector({ apiKey: "sk-secret", fetch: (async () => new Response(JSON.stringify({ error: { message: "bad sk-secret" } }), { status: 401, headers: { "content-type": "application/json" } })) as typeof fetch });
    const error = await detector.detect("bola").then(
      () => undefined,
      (e: Error) => e,
    );
    expect(error?.message).toContain("the language check failed");
    expect(error?.message).not.toContain("sk-secret");
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

describe("openFinder with a translator and a language detector", () => {
  const start = async (t: Translator, languageDetector: LanguageDetector) => {
    dir = await mkdtemp(path.join(tmpdir(), "finder-kit-detect-"));
    const searched: string[] = [];
    open = await openFinder<ToyCard, readonly ToyCard[]>({
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
      translator: t,
      languageDetector,
    });
    return { finder: open, searched };
  };

  it("takes an ask made of the cards' words as English without a call, and translates a Latin-script ask the detector calls foreign", async () => {
    const d = detector(0.01);
    const { finder, searched } = await start(translator("hoop"), d);
    const english = await finder.narrow("round hoop");
    expect(english.translation).toBeUndefined();
    expect(d.calls).toEqual([]);
    const foreign = await finder.narrow("aro redondo");
    expect(d.calls).toEqual(["aro redondo"]);
    expect(foreign.translation).toMatchObject({ english: "hoop", translated: true });
    expect(searched).toEqual(["round hoop", "hoop"]);
    expect(foreign.candidates[0]!.id).toBe("GreenRing");
  });

  it("searches an ask the detector calls English as typed", async () => {
    const { finder, searched } = await start(translator("never"), detector(0.99));
    const { translation } = await finder.narrow("gantry hoop");
    expect(translation).toMatchObject({ translated: false, english: "gantry hoop" });
    expect(searched).toEqual(["gantry hoop"]);
  });
});
