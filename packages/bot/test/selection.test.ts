import { GameState, Move, PlayerColor, applyMove, legalMoves, positionKey } from "@li4chess/engine";
import { describe, expect, it } from "vitest";
import { DIFFICULTY_PRESETS } from "../src/difficulty.js";
import { evaluateFull } from "../src/evaluate.js";
import { chooseCpuMove, refineContenders } from "../src/index.js";
import { ScoredMove, scoreMovesExactly } from "../src/search.js";

import { PieceType } from "@li4chess/engine";
import { place, position, seededRandom } from "./helpers.js";

const TWO_PLAYER = [PlayerColor.Red, PlayerColor.Yellow];

/** Exact value of every legal move, independent of whatever bounds ranking used. */
function exactValues(state: GameState, color: PlayerColor, level: 1 | 2 | 3 | 4 | 5) {
  const config = DIFFICULTY_PRESETS[level];
  return scoreMovesExactly(state, color, legalMoves(state, color), {
    maxDepth: config.maxDepth,
    evaluate: (s, c) => evaluateFull(s, c, config.evalWeights),
  });
}

/** Marks the position `move` would produce as already seen, so it counts as a repetition. */
function havingSeen(state: GameState, move: Move): GameState {
  return {
    ...state,
    positionCounts: { ...state.positionCounts, [positionKey(applyMove(state, move))]: 1 },
  };
}

/**
 * Repetition is only ever meant to break a tie between near-equal moves. The
 * pool it chooses from is built from rankMoves' upper bounds and then rescored
 * exactly — and the exact scores have to be filtered too. A bound says a move is
 * no better than the cutoff; it says nothing about how much worse the move
 * really is, so filtering on bounds alone let an arbitrarily bad move sit in the
 * pool and get played the moment the leader repeated.
 */
describe("move selection never trades value for novelty", () => {
  const midgame = () =>
    position(
      [
        place(PieceType.King, PlayerColor.Red, 6, 3),
        place(PieceType.Queen, PlayerColor.Red, 6, 6),
        place(PieceType.Rook, PlayerColor.Red, 4, 4),
        place(PieceType.Knight, PlayerColor.Red, 8, 5),
        place(PieceType.King, PlayerColor.Yellow, 6, 10),
        place(PieceType.Queen, PlayerColor.Yellow, 7, 9),
        place(PieceType.Rook, PlayerColor.Yellow, 9, 8),
        place(PieceType.Knight, PlayerColor.Yellow, 5, 9),
      ],
      PlayerColor.Red,
      TWO_PLAYER
    );

  // One level is enough end-to-end: the rule itself is level-independent and
  // covered directly below, and deeper searches of this position cost minutes.
  for (const level of [3] as const) {
    it(`stays within the contender tolerance of the best move at level ${level}`, () => {
      const base = midgame();
      const exact = exactValues(base, PlayerColor.Red, level);
      const best = exact[0];

      // Make the best move a repetition, which is what sends selection down the
      // alternatives path in the first place.
      const state = havingSeen(base, best.move);
      const chosen = chooseCpuMove(state, PlayerColor.Red, level, seededRandom(11));

      const chosenValue = exact.find(
        (e) => e.move.from === chosen.from && e.move.to === chosen.to && e.move.promotion === chosen.promotion
      );
      expect(chosenValue, "chosen move should be a legal move of the position").toBeDefined();
      // 0.5 is CONTENDER_TOLERANCE; a move outside it is not a tiebreak, it is a blunder.
      expect(
        chosenValue!.value,
        `chose a move worth ${chosenValue!.value.toFixed(3)} over the best at ${best.value.toFixed(3)}`
      ).toBeGreaterThanOrEqual(best.value - 0.5);
    });
  }

  it("still prefers a fresh move when the alternatives really are equal", () => {
    const base = midgame();
    const exact = exactValues(base, PlayerColor.Red, 3);
    const tied = exact.filter((e) => e.value >= exact[0].value - 0.5);
    if (tied.length < 2) return; // nothing to tiebreak in this position

    const state = havingSeen(base, exact[0].move);
    const chosen = chooseCpuMove(state, PlayerColor.Red, 3, seededRandom(11));
    expect(chosen.to === exact[0].move.to && chosen.from === exact[0].move.from).toBe(false);
  });
});

/**
 * The end-to-end tests above pin the contract but cannot force the failure:
 * they depend on a real search producing a bound that badly overstates its
 * move, which this position never does. Controlled values make the case
 * reproducible — a leader worth +10 that repeats, and an alternative whose
 * bound flattered it into the pool but which is really worth -100.
 */
describe("refineContenders", () => {
  const stub = (from: number, value: number): ScoredMove => ({
    move: { from, to: from + 1, piece: null, isCheck: [], eliminates: [] } as unknown as Move,
    value,
  });

  it("drops a candidate whose exact score falls outside the tolerance", () => {
    const near = [stub(1, 10), stub(2, 9.8)]; // 9.8 is a bound, not a value
    const pool = refineContenders(near, () => [stub(1, 10), stub(2, -100)]);
    expect(pool.map((p) => p.value)).toEqual([10]);
  });

  it("keeps candidates that really are near-equal", () => {
    const near = [stub(1, 10), stub(2, 9.8)];
    const pool = refineContenders(near, () => [stub(1, 10), stub(2, 9.7)]);
    expect(pool.map((p) => p.value)).toEqual([10, 9.7]);
  });

  it("does not rescore when there is nothing to choose between", () => {
    let called = false;
    const pool = refineContenders([stub(1, 10)], () => {
      called = true;
      return [];
    });
    expect(called).toBe(false);
    expect(pool.map((p) => p.value)).toEqual([10]);
  });
});
