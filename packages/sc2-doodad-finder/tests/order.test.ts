// The ranker slot's ordering rule (src/ranker.ts): fit first, already-provided doodads first
// within 0.25 of the same level, then the narrowing's order.
import { describe, expect, it } from "vitest";

import { type CandidateCard, candidateCards } from "../src/cards.ts";
import { orderByFit } from "../src/ranker.ts";
import { sources } from "./fixtures.ts";

const cards = new Map(candidateCards(sources()).map((card) => [card.id, card]));
const narrowed = (provided: Record<string, boolean>) =>
  Object.keys(provided).map((id) => ({ id, card: { ...cards.get(id)!, provided: provided[id] } as CandidateCard }));
const ids = (ordered: readonly { id: string }[]) => ordered.map(({ id }) => id);

describe("orderByFit", () => {
  it("puts the best fit first, whatever the narrowing's order", () => {
    const candidates = narrowed({ SupplyCrate: false, Sandbags: false, MossyBoulder: false });
    const grades = new Map([
      ["SupplyCrate", { level: 1 }],
      ["Sandbags", { level: 3 }],
      ["MossyBoulder", { level: 0 }],
    ]);
    expect(ids(orderByFit(candidates, grades))).toEqual(["Sandbags", "SupplyCrate", "MossyBoulder"]);
    expect(orderByFit(candidates, grades)[0]).toMatchObject({ id: "Sandbags", level: 3 });
  });

  it("puts a provided doodad first over one grading up to 0.25 above it, but not further", () => {
    const candidates = narrowed({ SupplyCrate: false, Sandbags: true, MossyBoulder: false });
    const grades = new Map([
      ["SupplyCrate", { level: 2.9 }],
      ["Sandbags", { level: 2.7 }],
      ["MossyBoulder", { level: 2.4 }],
    ]);
    expect(ids(orderByFit(candidates, grades))).toEqual(["Sandbags", "SupplyCrate", "MossyBoulder"]);
    const further = new Map([...grades, ["SupplyCrate", { level: 3 }]]);
    expect(ids(orderByFit(candidates, further))).toEqual(["SupplyCrate", "Sandbags", "MossyBoulder"]);
    // Exactly 0.25 apart, where 1.89 + 0.25 falls short of 2.14 in floating point.
    const exactly = new Map([...grades, ["SupplyCrate", { level: 2.14 }], ["Sandbags", { level: 1.89 }], ["MossyBoulder", { level: 1 }]]);
    expect(ids(orderByFit(candidates, exactly))).toEqual(["Sandbags", "SupplyCrate", "MossyBoulder"]);
  });

  it("keeps the narrowing's order between equal grades, provided first", () => {
    const candidates = narrowed({ SupplyCrate: false, Sandbags: false, MossyBoulder: true });
    const grades = new Map(["SupplyCrate", "Sandbags", "MossyBoulder"].map((id) => [id, { level: 2 }]));
    expect(ids(orderByFit(candidates, grades))).toEqual(["MossyBoulder", "SupplyCrate", "Sandbags"]);
  });

  it("refuses a candidate the ranking has no grade for", () => {
    expect(() => orderByFit(narrowed({ SupplyCrate: false }), new Map())).toThrow(/SupplyCrate/);
  });
});
