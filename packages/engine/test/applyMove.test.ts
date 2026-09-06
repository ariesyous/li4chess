import { describe, expect, it } from "vitest";
import { localSquare, squareOf } from "../src/board.js";
import { createInitialState } from "../src/setup.js";
import { GameState, PieceType, PlayerColor } from "../src/types.js";
import { legalMoves } from "../src/rules/legality.js";
import { applyMove } from "../src/rules/applyMove.js";

function emptyState(): GameState {
  const state = createInitialState();
  const board = state.board.slice();
  for (let i = 0; i < board.length; i++) board[i] = null;
  return { ...state, board };
}

describe("applyMove: checkmate elimination", () => {
  it("retains the checkmated player's passive king and army, and play continues with the next active player", () => {
    // Back-rank-style mate: Red king boxed in by its own pawns on rank1 (the
    // squares beside it on rank0 are covered by a rook's ray and a supporting
    // knight, rather than occupied), and Green (the player immediately before
    // Red in turn rotation) slides a rook down file3 to deliver mate along
    // rank0 — checkmate is resolved the moment it becomes Red's actual turn.
    const state = emptyState();
    const board = state.board.slice();
    const redKingSq = squareOf(6, 0);
    board[redKingSq] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(5, 1)] = { type: PieceType.Pawn, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(6, 1)] = { type: PieceType.Pawn, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(7, 1)] = { type: PieceType.Pawn, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(9, 1)] = { type: PieceType.Knight, owner: PlayerColor.Green, hasMoved: true }; // covers (7,0)
    board[squareOf(3, 5)] = { type: PieceType.Rook, owner: PlayerColor.Green, hasMoved: true };
    board[localSquare(PlayerColor.Blue, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    board[localSquare(PlayerColor.Yellow, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Yellow, hasMoved: true };
    board[localSquare(PlayerColor.Green, 4, 5)] = { type: PieceType.King, owner: PlayerColor.Green, hasMoved: true };

    const beforeGreenMove: GameState = { ...state, board, turn: PlayerColor.Green };
    const greenMoves = legalMoves(beforeGreenMove, PlayerColor.Green);
    const mateMove = greenMoves.find((m) => m.from === squareOf(3, 5) && m.to === squareOf(3, 0));
    expect(mateMove).toBeDefined();
    expect(mateMove!.isCheck).toEqual([PlayerColor.Red]);

    const after = applyMove(beforeGreenMove, mateMove!);

    // Red is eliminated, but every owned piece remains at its original square.
    for (let square = 0; square < board.length; square++) {
      if (board[square]?.owner === PlayerColor.Red) expect(after.board[square]).toEqual(board[square]);
    }
    expect(after.players[PlayerColor.Red].status).toBe("checkmated");
    expect(after.players[PlayerColor.Red].eliminatedOnTurn).toBe(after.turnNumber);

    // Turn moves on to the next active player (Blue), skipping the now-eliminated Red.
    expect(after.turn).toBe(PlayerColor.Blue);
    expect(after.result).toBeNull();

    // The applied move is recorded with `eliminates` set.
    const lastMove = after.moveHistory[after.moveHistory.length - 1];
    expect(lastMove.eliminates).toContain(PlayerColor.Red);
  });
});

describe("applyMove: stalemate freezes pieces in place", () => {
  it("marks the player stalemated, keeps their pieces on the board, and skips them in future rotation", () => {
    // Red king in a corner with only 3 reachable neighbor squares (the other 5
    // directions fall in the board's cutout), each covered by a different Blue
    // knight so none of them also directly check the king.
    const state = emptyState();
    const board = state.board.slice();
    const redKingSq = squareOf(3, 0);
    board[redKingSq] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(5, 0)] = { type: PieceType.Knight, owner: PlayerColor.Blue, hasMoved: true }; // covers (3,1)
    board[squareOf(6, 1)] = { type: PieceType.Knight, owner: PlayerColor.Blue, hasMoved: true }; // covers (4,0)
    board[squareOf(6, 2)] = { type: PieceType.Knight, owner: PlayerColor.Blue, hasMoved: true }; // covers (4,1)
    board[localSquare(PlayerColor.Blue, 4, 5)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    board[localSquare(PlayerColor.Yellow, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Yellow, hasMoved: true };
    board[localSquare(PlayerColor.Green, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Green, hasMoved: true };

    const beforeState: GameState = { ...state, board, turn: PlayerColor.Green };
    const redMoves = legalMoves({ ...beforeState, turn: PlayerColor.Red }, PlayerColor.Red);
    // Precondition: this geometry is genuinely a stalemate (no legal moves, king not in check).
    expect(redMoves.length).toBe(0);

    const greenMoves = legalMoves(beforeState, PlayerColor.Green);
    expect(greenMoves.length).toBeGreaterThan(0);
    const after = applyMove(beforeState, greenMoves[0]);

    expect(after.players[PlayerColor.Red].status).toBe("stalemated");
    expect(after.board[redKingSq]).not.toBeNull(); // king/pieces remain frozen in place, not removed
    expect(after.turn).not.toBe(PlayerColor.Red);
  });
});

describe("applyMove: scoring and game end", () => {
  it("credits capture points to the capturing player", () => {
    const state = emptyState();
    const board = state.board.slice();
    board[squareOf(5, 5)] = { type: PieceType.Rook, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(5, 8)] = { type: PieceType.Knight, owner: PlayerColor.Blue, hasMoved: true };
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[localSquare(PlayerColor.Blue, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Blue, hasMoved: true };
    board[localSquare(PlayerColor.Yellow, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Yellow, hasMoved: true };
    board[localSquare(PlayerColor.Green, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Green, hasMoved: true };
    const before: GameState = { ...state, board, turn: PlayerColor.Red };

    const moves = legalMoves(before, PlayerColor.Red);
    const capture = moves.find((m) => m.to === squareOf(5, 8));
    expect(capture).toBeDefined();

    const after = applyMove(before, capture!);
    expect(after.players[PlayerColor.Red].score).toBe(3); // knight value
  });

  it("ends the game and computes placements once only one active player remains", () => {
    const state = emptyState();
    const board = state.board.slice();
    board[localSquare(PlayerColor.Red, 4, 0)] = { type: PieceType.King, owner: PlayerColor.Red, hasMoved: true };
    board[squareOf(6, 1)] = { type: PieceType.Pawn, owner: PlayerColor.Red, hasMoved: false };
    const before: GameState = {
      ...state,
      board,
      turn: PlayerColor.Red,
      players: {
        [PlayerColor.Red]: { color: PlayerColor.Red, status: "active", isCPU: false, score: 5 },
        [PlayerColor.Blue]: { color: PlayerColor.Blue, status: "checkmated", isCPU: false, score: 2, eliminatedOnTurn: 3 },
        [PlayerColor.Yellow]: { color: PlayerColor.Yellow, status: "checkmated", isCPU: false, score: 1, eliminatedOnTurn: 5 },
        [PlayerColor.Green]: { color: PlayerColor.Green, status: "stalemated", isCPU: false, score: 0, eliminatedOnTurn: 7 },
      },
    };

    const moves = legalMoves(before, PlayerColor.Red);
    expect(moves.length).toBeGreaterThan(0);
    const after = applyMove(before, moves[0]);

    expect(after.result).not.toBeNull();
    expect(after.result!.winner).toBe(PlayerColor.Red);
    expect(after.result!.placements[0]).toEqual({ color: PlayerColor.Red, place: 1, score: 5 });
    // Green eliminated last (turn 7) among the non-winners -> 2nd place.
    expect(after.result!.placements[1].color).toBe(PlayerColor.Green);
    expect(after.result!.placements[2].color).toBe(PlayerColor.Yellow);
    expect(after.result!.placements[3].color).toBe(PlayerColor.Blue);
  });
});
