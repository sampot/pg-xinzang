import { describe, it, expect } from "vitest";
import {
  makeDeck,
  shuffle,
  newRound,
  flipCard,
  isHeartbeat,
  nextActive,
  resolveSlap,
  checkWinner,
  RANKS,
} from "./game.js";

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("makeDeck", () => {
  it("produces 104 cards (two decks)", () => {
    const deck = makeDeck();
    expect(deck.length).toBe(104);
    const unique = new Set(deck.map((c) => `${c.rank}-${c.suit}`));
    expect(unique.size).toBe(52);
    deck.forEach((c) => {
      expect(RANKS).toContain(c.rank);
      expect(c.suit).toBeGreaterThanOrEqual(0);
      expect(c.suit).toBeLessThan(4);
    });
  });
});

describe("shuffle", () => {
  it("keeps all cards", () => {
    const deck = makeDeck();
    const out = shuffle(deck, seq([0.9, 0.2, 0.5, 0.1, 0.7]));
    expect(out.length).toBe(104);
    expect(out.every((c) => c && c.rank)).toBe(true);
  });
});

describe("newRound", () => {
  it("deals evenly and picks a target 1..13", () => {
    const r = newRound(2, seq([0.99, 0.12]));
    expect(r.playerCount).toBe(2);
    expect(r.hands[0].length).toBe(52);
    expect(r.hands[1].length).toBe(52);
    expect(r.target).toBeGreaterThanOrEqual(1);
    expect(r.target).toBeLessThanOrEqual(13);
    expect(r.flipped).toEqual([]);
    expect(r.turn).toBe(0);
  });
  it("clamps player count", () => {
    expect(newRound(9).playerCount).toBe(6);
    expect(newRound(1).playerCount).toBe(2);
  });
});

describe("isHeartbeat", () => {
  it("true only on rank === target", () => {
    expect(isHeartbeat(5, 5)).toBe(true);
    expect(isHeartbeat(5, 6)).toBe(false);
  });
});

describe("flipCard", () => {
  it("flips the top card and advances to next player", () => {
    const s = newRound(2, seq([0.5, 0.12, 0.2]));
    const before = s.hands[0].length;
    const res = flipCard(s);
    expect(res.ok).toBe(true);
    expect(s.hands[0].length).toBe(before - 1);
    expect(s.flipped.length).toBe(1);
    expect(s.flipped[0]).toEqual(res.card);
  });
  it("rejects when finished", () => {
    const s = newRound(2);
    s.result = { winner: 0 };
    expect(flipCard(s).ok).toBe(false);
  });
});

describe("nextActive", () => {
  it("skips out players", () => {
    const s = newRound(3);
    s.out[1] = true;
    s.hands[1] = [];
    expect(nextActive(s, 0)).toBe(2);
    s.out[2] = true;
    s.hands[2] = [];
    expect(nextActive(s, 0)).toBe(0);
  });
});

describe("resolveSlap", () => {
  it("slowest player collects the flipped pile", () => {
    const s = newRound(2, seq([0.5, 0.12]));
    s.turn = 0;
    flipCard(s);
    expect(s.flipped.length).toBe(1);
    const before = s.hands[1].length;
    resolveSlap(s, (p) => (p === 0 ? 0 : 999)); // p0 fast, p1 slow
    expect(s.hands[1].length).toBe(before + 1);
    expect(s.flipped.length).toBe(0);
  });
});

describe("checkWinner", () => {
  it("declares winner when only one player remains", () => {
    const s = newRound(2, seq([0.5, 0.12]));
    s.hands[1] = [];
    s.played = [];
    const ret = checkWinner(s, 0, 10);
    expect(ret).toBeTruthy();
    expect(ret.winner).toBe(0);
    expect(s.result.winner).toBe(0);
  });
});