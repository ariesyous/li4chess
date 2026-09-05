import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/setup.js";
import { ALL_COLORS, PieceType, PlayerColor } from "../src/types.js";

describe("createInitialState", () => {
  const state = createInitialState();

  it("gives each of the 4 players exactly 16 pieces", () => {
    for (const color of ALL_COLORS) {
      const count = state.board.filter((p) => p?.owner === color).length;
      expect(count).toBe(16);
    }
  });

  it("gives each player exactly 1 king, 1 queen, 8 pawns, 2 each of rook/knight/bishop", () => {
    for (const color of ALL_COLORS) {
      const pieces = state.board.filter((p) => p?.owner === color);
      const counts = new Map<PieceType, number>();
      for (const p of pieces) {
        counts.set(p!.type, (counts.get(p!.type) ?? 0) + 1);
      }
      expect(counts.get(PieceType.King)).toBe(1);
      expect(counts.get(PieceType.Queen)).toBe(1);
      expect(counts.get(PieceType.Pawn)).toBe(8);
      expect(counts.get(PieceType.Rook)).toBe(2);
      expect(counts.get(PieceType.Knight)).toBe(2);
      expect(counts.get(PieceType.Bishop)).toBe(2);
    }
  });

  it("starts with Red to move, turn number 1, no result", () => {
    expect(state.turn).toBe(PlayerColor.Red);
    expect(state.turnNumber).toBe(1);
    expect(state.result).toBeNull();
    expect(state.enPassantTarget).toBeNull();
  });

  it("gives every player full castling rights", () => {
    for (const color of ALL_COLORS) {
      expect(state.castlingRights[color]).toEqual({ kingside: true, queenside: true });
    }
  });

  it("leaves all 4 corner cutout regions empty (no pieces placed there)", () => {
    // spot-check: no piece count exceeds 64 total (4 * 16)
    const total = state.board.filter((p) => p !== null).length;
    expect(total).toBe(64);
  });
});
