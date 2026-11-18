// A translator (translator.ts) that asks a small model through Vercel's AI Gateway, whose
// chat-completions endpoint takes the usual OpenAI-shaped request. No SDK: one fetch. The default
// model, amazon/nova-micro, was the cheapest of eight tried that answered in about 0.6 s and
// translated 13 of 15 Russian and Korean test asks as the doodad search needs them (about $0.003
// per 1,000 asks); the others cost no more than $0.07 but took two to six times as long.
//
// A free Gateway account is held to 5 requests a minute a model and refused some models outright;
// a paid balance lifts both. Every failure is thrown with the Gateway's own words and never the
// key, and translateAsk leaves the ask as typed.

import type { Translator } from "./translator.ts";

export const GATEWAY_CHAT_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
export const TRANSLATOR_MODEL = "amazon/nova-micro";

/**
 * What the model is told. The glossary is the game's own localized names, which a general
 * translation gets wrong: Russian "линкор" is the Battlecruiser, not a battleship.
 */
export const TRANSLATE_PROMPT = [
  "You translate searches typed by StarCraft II map makers into short plain English, for finding doodads (map decorations) by their descriptions.",
  "Keep game terms (Zerg, Terran, Protoss, Xel'Naga) and ids as they are.",
  "Use the game's English names: линкор and 전투순양함 are Battlecruiser; 'doodad' is the map decoration, never a toy or a gadget.",
  "Reply with the English translation only, with no quotes, notes or explanation.",
].join(" ");

export type GatewayTranslatorOptions = {
  readonly apiKey: string;
  readonly model?: string;
  readonly url?: string;
  /** For tests. */
  readonly fetch?: typeof globalThis.fetch;
};

type ChatReply = { readonly choices?: readonly { readonly message?: { readonly content?: unknown } }[]; readonly error?: { readonly message?: unknown } };

export function gatewayTranslator({ apiKey, model = TRANSLATOR_MODEL, url = GATEWAY_CHAT_URL, fetch = globalThis.fetch }: GatewayTranslatorOptions): Translator {
  return {
    async translate(ask, options) {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 200, temperature: 0, messages: [{ role: "system", content: TRANSLATE_PROMPT }, { role: "user", content: ask }] }),
        ...(options?.signal ? { signal: options.signal } : {}),
      });
      const reply = (await response.json().catch(() => ({}))) as ChatReply;
      if (!response.ok) {
        const said = typeof reply.error?.message === "string" ? reply.error.message : "no reason given";
        throw new Error(`AI Gateway ${response.status}: ${said}`);
      }
      const content = reply.choices?.[0]?.message?.content;
      if (typeof content !== "string") throw new Error("AI Gateway answered without text");
      // A model sometimes quotes what it was told to leave bare.
      return content.trim().replace(/^["'“”«»]+|["'“”«»]+$/g, "");
    },
  };
}

/**
 * Remembers what a translator answered for each ask (up to `max`, the oldest forgotten first), so an
 * ask asked again costs no call. A failure is not remembered.
 */
export function cachingTranslator(inner: Translator, max = 500): Translator {
  const known = new Map<string, string>();
  return {
    async translate(ask, options) {
      const seen = known.get(ask);
      if (seen !== undefined) return seen;
      const english = await inner.translate(ask, options);
      known.set(ask, english);
      if (known.size > max) known.delete(known.keys().next().value!);
      return english;
    },
  };
}
