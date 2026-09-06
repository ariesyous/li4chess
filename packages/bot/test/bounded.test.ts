import { describe, expect, it } from "vitest";
import { applyMove, createInitialState, legalMoves, resignPlayer, PieceType, PlayerColor } from "@li4chess/engine";
import { chooseBoundedCpuMove, CPU_POLICIES } from "../src/bounded.js";
import type { CpuLevel } from "../src/bounded.js";
import { scoreMovesExactly } from "../src/search.js";
import { evaluateFull } from "../src/evaluate.js";
import { DIFFICULTY_PRESETS } from "../src/difficulty.js";
import { place, position } from "./helpers.js";

describe("bounded production search", () => {
  it("preserves terminal utility over material on a won endgame", () => {
    const state = position([
      place(PieceType.King, PlayerColor.Red, 6, 3), place(PieceType.Queen, PlayerColor.Red, 10, 5),
      place(PieceType.Rook, PlayerColor.Red, 9, 12), place(PieceType.King, PlayerColor.Yellow, 3, 13),
    ], PlayerColor.Red, [PlayerColor.Red, PlayerColor.Yellow]);
    const result = chooseBoundedCpuMove(state, 5, { maxDepth: 2, nodeBudget: 32768, timeMs: null }, () => 0.99);
    expect(result.diagnostics.completedDepth).toBe(2);
    expect(applyMove(state, result.move).result?.winner).toBe(PlayerColor.Red);
  });
  it("searches recorded walking descendants without changing source randomness", () => {
    const base = createInitialState();
    const state = resignPlayer({ ...base,
      board: base.board.map((piece, square) => piece?.type === PieceType.King || square === 20 ? piece : null),
      castlingRights: { 0: { kingside: false, queenside: false }, 1: { kingside: false, queenside: false },
        2: { kingside: false, queenside: false }, 3: { kingside: false, queenside: false } },
      completedMoves: { 0: 3, 1: 3, 2: 3, 3: 3 } }, 1);
    const snapshot = structuredClone(state);
    const result = chooseBoundedCpuMove(state, 3, { maxDepth: 2, nodeBudget: 32768, timeMs: null }, () => 0.99);
    expect(result.diagnostics.completedDepth).toBe(2);
    expect(legalMoves(state)).toContainEqual(result.move);
    expect(state).toEqual(snapshot);
    const walking = applyMove(state, result.move);
    expect(walking.players[walking.turn].kingStatus).toBe("walking");
    expect(() => chooseBoundedCpuMove(walking, 3)).toThrow("active turn");
  });
  const state = createInitialState();
  for (const level of [1, 2, 3, 4, 5] as CpuLevel[]) {
    it(`level ${level} is legal and deterministic under a node cap`, () => {
      const budget = { ...CPU_POLICIES[level], nodeBudget: 24, timeMs: null };
      const a = chooseBoundedCpuMove(state, level, budget, () => 0.99, () => 0);
      const b = chooseBoundedCpuMove(state, level, budget, () => 0.99, () => 0);
      expect(a).toEqual(b);
      expect(a.diagnostics.nodes).toBeLessThanOrEqual(24);
      expect(legalMoves(state)).toContainEqual(a.move);
    });
  }
  it("zero budget uses a legal fallback without visiting a node", () => {
    const result = chooseBoundedCpuMove(state, 5, { maxDepth: 5, nodeBudget: 0, timeMs: null });
    expect(result.move).toEqual(legalMoves(state)[0]);
    expect(result.diagnostics).toMatchObject({ nodes: 0, completedDepth: 0, fallback: true, stopped: "nodes" });
  });
  it("an interrupted deeper iteration retains the exact shallow best", () => {
    const roots = legalMoves(state);
    const result = chooseBoundedCpuMove(state, 5, { maxDepth: 5, nodeBudget: roots.length + 1, timeMs: null }, () => 0.99);
    const ranked = scoreMovesExactly(state, state.turn, roots, { maxDepth: 1, evaluate: (s, c) => evaluateFull(s, c, DIFFICULTY_PRESETS[5].evalWeights) });
    expect(result.diagnostics.completedDepth).toBe(1);
    expect(ranked.find(entry => entry.move.from === result.move.from && entry.move.to === result.move.to)!.value).toBeGreaterThanOrEqual(ranked[0].value - 0.5);
  });
  it("polls elapsed time and rejects invalid budgets", () => {
    let clock = 0;
    const result = chooseBoundedCpuMove(state, 5, { maxDepth: 5, nodeBudget: 100, timeMs: 2 }, () => 0.99, () => clock++);
    expect(result.diagnostics.stopped).toBe("time");
    expect(result.diagnostics.nodes).toBeLessThan(100);
    for (const nodeBudget of [-1, NaN, Infinity, 1.5, 32769]) {
      expect(() => chooseBoundedCpuMove(state, 1, { maxDepth: 1, nodeBudget, timeMs: null })).toThrow("budget");
    }
  });
});
