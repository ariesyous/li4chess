import { describe, expect, it } from "vitest";
import { applyMove } from "../src/rules/applyMove.js";
import { hasLegalMove, legalMoves } from "../src/rules/legality.js";
import { createInitialState } from "../src/setup.js";
import { ALL_COLORS, GameState } from "../src/types.js";

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function expectAgreement(state: GameState): void {
  for (const color of ALL_COLORS) {
    expect(hasLegalMove(state, color), `disagreed for ${color}`).toBe(legalMoves(state, color).length > 0);
  }
}

describe("hasLegalMove", () => {
  it("agrees with legalMoves in the starting position", () => {
    expectAgreement(createInitialState());
  });

  it("agrees with legalMoves throughout randomly played games", () => {
    const rand = mulberry32(31);
    for (let seed = 0; seed < 4; seed++) {
      let state = createInitialState();
      for (let ply = 0; ply < 25 && state.result === null; ply++) {
        const moves = legalMoves(state, state.turn);
        if (moves.length === 0) break;
        state = applyMove(state, moves[Math.floor(rand() * moves.length)]);
        expectAgreement(state);
      }
    }
  });

  it("is false for a color with no pieces on the board", () => {
    const base = createInitialState();
    const state: GameState = { ...base, board: base.board.map(() => null) };
    for (const color of ALL_COLORS) expect(hasLegalMove(state, color)).toBe(false);
  });
});
