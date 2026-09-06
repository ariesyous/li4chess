import { describe, expect, it } from "vitest";
import { ALL_COLORS, PieceType, PlayerColor, VALID_SQUARES, createInitialState, isOnBoard, legalMoves } from "../src/index.js";
import { play } from "./ffa-helpers.js";

// Independent coordinate oracle transcribed from the accepted Modern layout.
const armies = [
  { id: "FFA-SETUP-01", color: PlayerColor.Red, back: [3,4,5,6,7,8,9,10], pawns: [17,18,19,20,21,22,23,24] },
  { id: "FFA-SETUP-02", color: PlayerColor.Blue, back: [140,126,112,98,84,70,56,42], pawns: [141,127,113,99,85,71,57,43] },
  { id: "FFA-SETUP-03", color: PlayerColor.Yellow, back: [192,191,190,189,188,187,186,185], pawns: [178,177,176,175,174,173,172,171] },
  { id: "FFA-SETUP-04", color: PlayerColor.Green, back: [55,69,83,97,111,125,139,153], pawns: [54,68,82,96,110,124,138,152] },
] as const;
describe("accepted Modern setup (partial migration, not standard-v1 certification)", () => {
  for (const { id, color, back, pawns } of armies) it(`${id}: ${PlayerColor[color]} coordinates and clockwise opening`, () => {
    const state = createInitialState();
    const order = [PieceType.Rook, PieceType.Knight, PieceType.Bishop, PieceType.Queen, PieceType.King, PieceType.Bishop, PieceType.Knight, PieceType.Rook];
    expect(state.board).toHaveLength(196);
    expect(VALID_SQUARES).toHaveLength(160);
    for (let r = 0; r < 14; r++) for (let f = 0; f < 14; f++) {
      expect(isOnBoard(f, r)).toBe(!((f < 3 || f > 10) && (r < 3 || r > 10)));
    }
    const expected: [number, PieceType][] = [
      ...back.map((square, i): [number, PieceType] => [square, order[i]]),
      ...pawns.map((square): [number, PieceType] => [square, PieceType.Pawn]),
    ];
    expect(state.board.flatMap((p, square) => p?.owner === color ? [[square, p.type]] : []).sort((a,b) => Number(a[0])-Number(b[0])))
      .toEqual(expected.sort((a,b) => Number(a[0])-Number(b[0])));
    expect(state.board.filter(Boolean)).toHaveLength(64);
    expect(state.board.filter(p => p?.owner === color).every(p => !p!.hasMoved)).toBe(true);
    expect(legalMoves(state, color)).toHaveLength(20);
    expect(state.rulesetId).toBeNull();
    let current = state;
    for (const seat of ALL_COLORS) {
      expect(current.turn).toBe(seat);
      current = play(current, seat, [6, 1], [6, 3]);
    }
    expect(current.turn).toBe(PlayerColor.Red);
  });
});
