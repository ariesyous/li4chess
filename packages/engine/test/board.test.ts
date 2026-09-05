import { describe, expect, it } from "vitest";
import {
  BOARD_SIZE,
  boardToLocal,
  fileOf,
  isOnBoard,
  localToBoard,
  rankOf,
  squareOf,
  VALID_SQUARES,
} from "../src/board.js";
import { ALL_COLORS, PlayerColor } from "../src/types.js";

describe("board geometry", () => {
  it("has exactly 160 valid squares (196 - 4*9 cutout)", () => {
    expect(VALID_SQUARES.length).toBe(160);
  });

  it("excludes all four 3x3 corners", () => {
    for (let file = 0; file < 3; file++) {
      for (let rank = 0; rank < 3; rank++) {
        expect(isOnBoard(file, rank)).toBe(false);
        expect(isOnBoard(file, BOARD_SIZE - 1 - rank)).toBe(false);
        expect(isOnBoard(BOARD_SIZE - 1 - file, rank)).toBe(false);
        expect(isOnBoard(BOARD_SIZE - 1 - file, BOARD_SIZE - 1 - rank)).toBe(false);
      }
    }
  });

  it("fileOf/rankOf/squareOf round-trip", () => {
    for (const square of VALID_SQUARES) {
      expect(squareOf(fileOf(square), rankOf(square))).toBe(square);
    }
  });

  it("localToBoard maps every player's full local board onto valid, distinct squares", () => {
    for (const color of ALL_COLORS) {
      const seen = new Set<number>();
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 14; r++) {
          const [file, rank] = localToBoard(color, f, r);
          expect(isOnBoard(file, rank)).toBe(true);
          const sq = squareOf(file, rank);
          expect(seen.has(sq)).toBe(false);
          seen.add(sq);
        }
      }
    }
  });

  it("each player's local back rank (rank 0) sits on their own board edge", () => {
    // Red: bottom edge (rank 0), Blue: left edge (file 0), Yellow: top edge (rank 13), Green: right edge (file 13)
    for (let f = 0; f < 8; f++) {
      const [rf, rr] = localToBoard(PlayerColor.Red, f, 0);
      expect(rr).toBe(0);
      const [bf] = localToBoard(PlayerColor.Blue, f, 0);
      expect(bf).toBe(0);
      const [, yr] = localToBoard(PlayerColor.Yellow, f, 0);
      expect(yr).toBe(13);
      const [gf] = localToBoard(PlayerColor.Green, f, 0);
      expect(gf).toBe(13);
    }
  });

  it("boardToLocal inverts localToBoard for every player and every local coordinate", () => {
    for (const color of ALL_COLORS) {
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 14; r++) {
          const [file, rank] = localToBoard(color, f, r);
          expect(boardToLocal(color, file, rank)).toEqual([f, r]);
        }
      }
    }
  });

  it("the four players' local frames are 90-degree rotations of one another (no overlap in starting zones)", () => {
    const zones = ALL_COLORS.map((color) => {
      const squares = new Set<number>();
      for (let f = 0; f < 8; f++) {
        for (let r = 0; r < 2; r++) {
          const [file, rank] = localToBoard(color, f, r);
          squares.add(squareOf(file, rank));
        }
      }
      return squares;
    });
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        for (const sq of zones[i]) {
          expect(zones[j].has(sq)).toBe(false);
        }
      }
    }
  });
});
