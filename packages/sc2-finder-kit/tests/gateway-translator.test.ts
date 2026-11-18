// The gateway translator reads and sends what the Gateway's chat endpoint takes, never leaks the
// key, and the caching translator calls once per ask.
import { describe, expect, it } from "vitest";

import { cachingTranslator, gatewayTranslator, TRANSLATE_PROMPT, TRANSLATOR_MODEL } from "../src/gateway-translator.ts";

const reply = (body: unknown, status = 200): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

describe("gatewayTranslator", () => {
  it("sends the ask with the glossary prompt, the key and the signal, and returns the text unquoted", async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    const fetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: ' "heavy press head"\n' } }] }));
    }) as typeof globalThis.fetch;
    const signal = AbortSignal.timeout(1000);
    const english = await gatewayTranslator({ apiKey: "sk-test", fetch }).translate("тяжёлая головка пресса", { signal });
    expect(english).toBe("heavy press head");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer sk-test");
    expect(seen[0]!.init.signal).toBe(signal);
    const body = JSON.parse(seen[0]!.init.body as string);
    expect(body.model).toBe(TRANSLATOR_MODEL);
    expect(body.messages).toEqual([
      { role: "system", content: TRANSLATE_PROMPT },
      { role: "user", content: "тяжёлая головка пресса" },
    ]);
  });

  it("throws the Gateway's words, without the key, when it refuses", async () => {
    const translator = gatewayTranslator({ apiKey: "sk-secret", fetch: reply({ error: { message: "Rate limit exceeded: 5 requests per minute" } }, 429) });
    const error = await translator.translate("мяч").then(
      () => undefined,
      (e: Error) => e,
    );
    expect(error?.message).toBe("AI Gateway 429: Rate limit exceeded: 5 requests per minute");
    expect(error?.message).not.toContain("sk-secret");
  });

  it("throws when the answer has no text, or isn't JSON", async () => {
    await expect(gatewayTranslator({ apiKey: "k", fetch: reply({ choices: [] }) }).translate("мяч")).rejects.toThrow("without text");
    await expect(gatewayTranslator({ apiKey: "k", fetch: (async () => new Response("<html>", { status: 502 })) as typeof fetch }).translate("мяч")).rejects.toThrow("AI Gateway 502: no reason given");
  });
});

describe("cachingTranslator", () => {
  const counting = () => {
    const calls: string[] = [];
    return { calls, translate: async (ask: string) => (calls.push(ask), `en:${ask}`) };
  };

  it("asks the translator once per ask", async () => {
    const inner = counting();
    const translator = cachingTranslator(inner);
    expect(await translator.translate("a")).toBe("en:a");
    expect(await translator.translate("a")).toBe("en:a");
    await translator.translate("b");
    expect(inner.calls).toEqual(["a", "b"]);
  });

  it("forgets the oldest past its limit, and doesn't remember a failure", async () => {
    const inner = counting();
    const translator = cachingTranslator(inner, 2);
    for (const ask of ["a", "b", "c", "a"]) await translator.translate(ask);
    expect(inner.calls).toEqual(["a", "b", "c", "a"]);
    let fail = true;
    const flaky = cachingTranslator({ translate: async () => (fail ? Promise.reject(new Error("down")) : "ok") });
    await expect(flaky.translate("x")).rejects.toThrow("down");
    fail = false;
    expect(await flaky.translate("x")).toBe("ok");
  });
});
