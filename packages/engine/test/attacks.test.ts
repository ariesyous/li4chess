import { describe, expect, it } from "vitest";
import { VALID_SQUARES } from "../src/board.js";
import { applyMove } from "../src/rules/applyMove.js";
import { attackMap, isSquareAttacked } from "../src/rules/attacks.js";
import { legalMoves } from "../src/rules/legality.js";
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

function expectMapMatchesQueries(state: GameState): void {
  for (const color of ALL_COLORS) {
    const map = attackMap(state.board, color);
    for (const square of VALID_SQUARES) {
      expect(
        map[square] === 1,
        `square ${square} attacked-by-${color} disagreed (map=${map[square]})`
      ).toBe(isSquareAttacked(state.board, square, color));
    }
  }
}

describe("attackMap", () => {
  it("agrees with isSquareAttacked on every square of the starting position", () => {
    expectMapMatchesQueries(createInitialState());
  });

  it("agrees with isSquareAttacked throughout randomly played games", () => {
    const rand = mulberry32(7);
    for (let seed = 0; seed < 3; seed++) {
      let state = createInitialState();
      for (let ply = 0; ply < 20 && state.result === null; ply++) {
        const moves = legalMoves(state, state.turn);
        if (moves.length === 0) break;
        state = applyMove(state, moves[Math.floor(rand() * moves.length)]);
        expectMapMatchesQueries(state);
      }
    }
  });

  it("marks nothing for a color with no pieces left on the board", () => {
    const state = createInitialState();
    const emptyBoard = state.board.map(() => null);
    expect(attackMap(emptyBoard, ALL_COLORS[0]).some((v) => v === 1)).toBe(false);
  });
});
