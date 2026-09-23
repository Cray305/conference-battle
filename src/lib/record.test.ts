import { describe, expect, test } from "bun:test";
import { winPct } from "./record.ts";

describe("winPct", () => {
  test("divides wins by games played", () => {
    expect(winPct({ wins: 3, losses: 1 })).toBe(0.75);
  });

  test("returns 0 when no games have been played", () => {
    expect(winPct({ wins: 0, losses: 0 })).toBe(0);
  });
});
