import { describe, it, expect } from "vitest";
import fc from "fast-check";

describe("test framework smoke", () => {
  it("roda asserções básicas do Vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("roda property tests com fast-check", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      })
    );
  });
});
