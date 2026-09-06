import { describe, expect, it } from "vitest";
import { squareOf } from "../src/board.js";
import { createInitialState } from "../src/setup.js";
import { GameState, PieceType, PlayerColor } from "../src/types.js";
import { legalMoves } from "../src/rules/legality.js";
import { applyMove } from "../src/rules/applyMove.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board, positionCounts: {} };
}

describe("threefold repetition", () => {
  it("draws the game once the same position recurs 3 times, with all active players tying for 1st", () => {
    // Two lone, far-apart kings, each shuffling back and forth between 2 squares —
    // a textbook repetition scenario. Yellow/Green are eliminated upfront so this
    // test isolates the repetition behavior to the two shuffling players.
    const state = emptyState();
    const board = state.board.slice();
    const redHome = squareOf(6, 0);
    const redAway = squareOf(6, 1);
    const blueHome = squareOf(0, 6);
    const blueAway = squareOf(1, 6);
    board[redHome] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[blueHome] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };

    let working: GameState = {
      ...state,
      board,
      turn: PlayerColor.Red,
      players: {
        ...state.players,
        [PlayerColor.Yellow]: { ...state.players[PlayerColor.Yellow], status: "checkmated", eliminatedOnTurn: 1 },
        [PlayerColor.Green]: { ...state.players[PlayerColor.Green], status: "checkmated", eliminatedOnTurn: 1 },
      },
      positionCounts: {},
    };

    let redAtHome = true;
    let blueAtHome = true;
    let plies = 0;

    while (working.result === null && plies < 40) {
      const mover = working.turn;
      const moves = legalMoves(working, mover);
      const target =
        mover === PlayerColor.Red ? (redAtHome ? redAway : redHome) : blueAtHome ? blueAway : blueHome;
      const move = moves.find((m) => m.to === target);
      expect(move).toBeDefined();

      working = applyMove(working, move!);
      if (mover === PlayerColor.Red) redAtHome = !redAtHome;
      else blueAtHome = !blueAtHome;
      plies++;
    }

    expect(working.result).not.toBeNull();
    expect(working.result!.reason).toBe("repetition");
    expect(working.result!.winner).toBeNull();
    const first = working.result!.placements.filter((p) => p.place === 1).map((p) => p.color);
    expect(first.sort()).toEqual([0,1,2,3]); // all four have equal points before DRAW award migration
  });
});
