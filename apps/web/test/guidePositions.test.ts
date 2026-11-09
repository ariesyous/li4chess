import { describe, expect, it } from "vitest";
import {
  ALL_COLORS, PieceType, PlayerColor, VALID_SQUARES, applyMoveRequest, captureValue, claimWin, localSquare,
} from "@li4chess/engine";
import {
  afterCapture, afterRecapture, beforeCapture, coordinates, promotionTo, startingBoard, teachingPosition,
} from "../src/content/guidePositions.js";

describe("published guide examples", () => {
  it("shows the real 160-square board and all four starting armies", () => {
    expect(VALID_SQUARES).toHaveLength(160);
    expect(startingBoard.turn).toBe(PlayerColor.Red);
    for (const owner of ALL_COLORS) {
      expect(startingBoard.board.filter(piece => piece?.owner === owner)).toHaveLength(16);
      expect(startingBoard.board[localSquare(owner, 3, 0)]?.type).toBe(PieceType.Queen);
      expect(startingBoard.board[localSquare(owner, 4, 0)]?.type).toBe(PieceType.King);
    }
  });

  it("promotes on the stated eighth rank in every orientation with a one-point Queen", () => {
    const targets = ["f8", "h9", "i7", "g6"];
    for (const owner of ALL_COLORS) {
      const from = localSquare(owner, 2, 6), to = localSquare(owner, 2, 7);
      const state = { ...teachingPosition([[from, { type: PieceType.Pawn, owner, hasMoved: true }]]), turn: owner };
      const after = applyMoveRequest(state, { from, to });
      expect(coordinates(to)).toBe(targets[owner]);
      expect(after.board[to]).toMatchObject({ type: PieceType.Queen, promotedFrom: PieceType.Pawn, owner });
      expect(captureValue(after.board[to]!)).toBe(1);
    }
    expect(coordinates(promotionTo)).toBe("f8");
  });

  it("allows both capture-trap moves and the two intervening quiet King moves", () => {
    expect(beforeCapture.turn).toBe(PlayerColor.Red);
    expect(afterCapture.players[PlayerColor.Red].score).toBe(5);
    expect(afterRecapture.moveHistory.map(move => `${coordinates(move.from)}-${coordinates(move.to)}`))
      .toEqual(["h4-j4", "a7-b7", "g14-h14", "m7-j4"]);
    expect(afterRecapture.players[PlayerColor.Red].score).toBe(5);
    expect(afterRecapture.players[PlayerColor.Green].score).toBe(9);
    expect(afterRecapture.awardLedger.map(award => [award.rule, award.recipient, award.delta]))
      .toEqual([["capture", PlayerColor.Red, 5], ["capture", PlayerColor.Green, 9]]);
  });

  it("keeps the eliminated 40-point player above the 30-v-8 Claim Win example", () => {
    const state = teachingPosition([]);
    const players = { ...state.players,
      0: { ...state.players[0], status: "checkmated" as const, score: 40 },
      1: { ...state.players[1], score: 30 }, 2: { ...state.players[2], score: 8 },
      3: { ...state.players[3], status: "checkmated" as const, score: 0 } };
    const result = claimWin({ ...state, players }, PlayerColor.Blue).result;
    expect(result?.winner).toBe(PlayerColor.Red);
    expect(result?.placements.map(({ color, score, place }) => [color, score, place]))
      .toEqual([[0, 40, 1], [1, 30, 2], [2, 28, 3], [3, 0, 4]]);
  });
});
