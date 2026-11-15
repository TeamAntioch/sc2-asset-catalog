// The kit's Jev ranker takes its wording from the finder: the state, the Score question and the
// levels sent are the finder's, and the card goes under the finder's field.
import { describe, expect, it } from "vitest";

import { jevRequest } from "../src/jev-ranker.ts";
import { TOYS, toyWording } from "./toy.ts";

describe("jevRequest", () => {
  it("sends the finder's wording and each card under its field", () => {
    const request = jevRequest({ ask: "round things", object: "a game", tags: [{ facet: "colour", value: "red" }], candidates: TOYS.slice(0, 2) }, toyWording);
    expect(request.state).toEqual({ about: toyWording.about, ask: "round things", object: "a game", tags: ["colour: red"] });
    expect(Object.keys(request.questions)).toEqual(["c0", "c1"]);
    expect(JSON.stringify(request.questions.c1)).toContain("square and red");
    expect(JSON.stringify(request.questions.c0)).toContain('"toy"');
    expect(JSON.stringify(request.questions.c0)).toContain(toyWording.question);
    expect(JSON.stringify(request.questions.c0)).toContain("Exactly.");
  });
});
