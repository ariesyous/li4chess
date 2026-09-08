import { expect, it } from "vitest";
import { ALL_COLORS, GameState, PieceType, PlayerColor, applyMove, legalMoves, localSquare, positionKey } from "@li4chess/engine";
import { chooseBoundedCpuMove } from "../src/bounded.js";
import { evaluateFull, MATERIAL_ONLY_WEIGHTS, pawnEndgameScore, WIN_SCORE } from "../src/evaluate.js";
import { position, place } from "./helpers.js";

function fixture(rotation: PlayerColor): GameState {
  // Development position: an unopposed pawn, with its king still far behind.
  const base = position([place(PieceType.King, 0, 7, 0), place(PieceType.Pawn, 0, 8, 4),
    place(PieceType.King, 1, 0, 7), place(PieceType.King, 2, 3, 13), place(PieceType.King, 3, 13, 10)], 0);
  const board: GameState["board"][number][] = Array(196).fill(null);
  for (let s = 0; s < 196; s++) {
    const p = base.board[s]; if (!p) continue;
    board[localSquare(rotation, s % 14 - 3, Math.floor(s / 14))] = { ...p, owner: (p.owner + rotation) % 4 };
  }
  return { ...base, board, turn: rotation };
}

for (const color of ALL_COLORS) {
  it(`safe promotion progress and conservative interception, orientation ${color}`, () => {
    const state = fixture(color);
    const pawn = localSquare(color, 5, 4);
    const push = legalMoves(state).find(m => m.from === pawn)!;
    expect(push).toBeDefined();
    expect(pawnEndgameScore(applyMove(state, push), color)).toBeGreaterThan(pawnEndgameScore(state, color));
    const chosen = chooseBoundedCpuMove(state, 3, { maxDepth: 3, nodeBudget: 2048, timeMs: null }, () => .99);
    expect(chosen.move.from).toBe(pawn);
    expect(chosen.diagnostics.nodes).toBeLessThanOrEqual(2048);
    const board = state.board.slice();
    const enemy = ((color + 1) % 4) as PlayerColor;
    const king = board.findIndex(p => p?.owner === enemy && p.type === PieceType.King);
    board[king] = null;
    board[localSquare(color, 6, 6)] = { type: PieceType.King, owner: enemy, hasMoved: true };
    const intercepted = { ...state, board };
    expect(pawnEndgameScore(intercepted, color)).toBeLessThan(pawnEndgameScore(state, color));
    const reply = chooseBoundedCpuMove(intercepted, 3, { maxDepth: 3, nodeBudget: 2048, timeMs: null }, () => .99);
    expect(reply.move.from).not.toBe(pawn); // Immediate king capture is visible.
  });

  it(`blockers remove race credit; king escort has a fixed destination, orientation ${color}`, () => {
    const state = fixture(color);
    const board = state.board.slice();
    board[localSquare(color, 5, 6)] = { type: PieceType.Pawn, owner: color, hasMoved: true };
    const blocked = { ...state, board };
    // Compare the first pawn with and without a passive blocker: dead armies
    // still occupy the route, even though they cannot attack.
    const enemy = ((color + 1) % 4) as PlayerColor;
    board[localSquare(color, 5, 6)] = { type: PieceType.Pawn, owner: enemy, hasMoved: true };
    const passive = { ...blocked, players: { ...state.players, [enemy]: {
      ...state.players[enemy], status: "checkmated" as const, eliminatedOnTurn: 1 } } };
    expect(pawnEndgameScore(passive, color)).toBeLessThan(pawnEndgameScore(state, color));
    const far = pawnEndgameScore(passive, color);
    const king = board.findIndex(p => p?.owner === color && p.type === PieceType.King);
    board[king] = null;
    board[localSquare(color, 4, 4)] = { type: PieceType.King, owner: color, hasMoved: true };
    expect(pawnEndgameScore({ ...passive, board }, color)).toBeGreaterThan(far);
  });

  it(`a score leader still takes a terminal draw, orientation ${color}`, () => {
    const state = fixture(color);
    const leader = { ...state, players: { ...state.players, [color]: { ...state.players[color], score: 50 } } };
    const quiet = legalMoves(leader).find(m => m.piece.type === PieceType.King)!;
    const drawReady = { ...leader, positionCounts: { [positionKey(applyMove(leader, quiet))]: 2 } };
    const reply = chooseBoundedCpuMove(drawReady, 3, { maxDepth: 3, nodeBudget: 2048, timeMs: null }, () => .99);
    const final = applyMove(drawReady, reply.move);
    expect(final.result?.reason).toBe("repetition");
    expect(evaluateFull(final, color)).toBe(WIN_SCORE);
  });
}

it("does not change non-pawn endings or material-only difficulty", () => {
  const state = fixture(0);
  const board = state.board.slice();
  board[50] = { type: PieceType.Rook, owner: 0, hasMoved: true };
  expect(pawnEndgameScore({ ...state, board }, 0)).toBe(0);
  expect(pawnEndgameScore(state, 1)).toBe(0);
  expect(evaluateFull(state, 0, MATERIAL_ONLY_WEIGHTS)).toBe(evaluateFull(state, 0, { ...MATERIAL_ONLY_WEIGHTS, pawnEndgame: 0 }));
});
