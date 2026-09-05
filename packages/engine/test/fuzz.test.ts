import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/setup.js";
import { GameState } from "../src/types.js";
import { legalMoves } from "../src/rules/legality.js";
import { applyMove } from "../src/rules/applyMove.js";

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

const MAX_PLIES = 80;

function playRandomGame(seed: number): { plies: number; state: GameState } {
  const rand = mulberry32(seed);
  let state = createInitialState();
  let plies = 0;
  while (state.result === null && plies < MAX_PLIES) {
    const moves = legalMoves(state, state.turn);
    if (moves.length === 0) {
      throw new Error(
        `No legal moves for ${state.turn} but game not marked as ended (turn ${state.turnNumber})`
      );
    }
    const move = moves[Math.floor(rand() * moves.length)];
    const before = state;
    state = applyMove(state, move);

    // Invariants that must hold after every single move, regardless of game content.
    const totalPieces = state.board.filter((p) => p !== null).length;
    const beforePieces = before.board.filter((p) => p !== null).length;
    expect(totalPieces).toBeLessThanOrEqual(beforePieces);

    plies++;
  }
  return { plies, state };
}

describe("fuzz: random self-play games", () => {
  it("every game terminates (either a result, or the ply cap) without throwing, across many seeds", () => {
    const NUM_GAMES = 8;
    for (let seed = 1; seed <= NUM_GAMES; seed++) {
      const { plies, state } = playRandomGame(seed);
      // Either the game concluded with a proper result, or we hit the safety cap —
      // either way, no exceptions and no stuck-forever loop.
      if (state.result !== null) {
        expect(state.result.placements).toHaveLength(4);
        expect(state.result.placements.map((p) => p.place).sort()).toEqual([1, 2, 3, 4]);
      }
      expect(plies).toBeGreaterThan(0);
    }
  });

  it("whenever a random game does reach a result within the ply cap, placements are a permutation of the 4 colors with a single winner", () => {
    // Random play rarely delivers an actual checkmate chain within a short ply
    // cap (that's expected — see the scripted checkmate/game-end tests for
    // targeted coverage of the end-of-game logic itself); this just checks the
    // invariant holds on however many of these random games happen to finish.
    for (let seed = 1; seed <= 20; seed++) {
      const { state } = playRandomGame(seed);
      if (state.result === null) continue;
      const colors = state.result.placements.map((p) => p.color).sort();
      expect(colors).toEqual([0, 1, 2, 3]);
      expect(state.result.winner).not.toBeNull();
      expect(state.result.placements.find((p) => p.color === state.result!.winner)!.place).toBe(1);
    }
  });
});
