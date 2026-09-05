import { ALL_COLORS, GameState, PieceType, PlayerColor, applyMove, createInitialState, legalMoves, positionKey } from "@li4chess/engine";
import data from "./positions.json";

export interface PositionSpec {
  id: string; tags: string[]; initial?: boolean; turn?: number;
  pieces?: (number | string)[][]; inactive?: number[]; perft?: number[];
  expect?: { from?: number; to?: number; promotion?: string };
  avoid?: { from: number; to: number };
  legalProperty?: { from: number; to: number; checks: number[] }; winner?: number;
}
export const positions: PositionSpec[] = data;
export function loadPosition(spec: PositionSpec): GameState {
  if (spec.initial) return createInitialState();
  const base = createInitialState();
  const board: (GameState["board"][number])[] = Array(196).fill(null);
  for (const [square, owner, type] of spec.pieces ?? []) {
    if (board[+square]) throw new Error(`Duplicate square in ${spec.id}`);
    board[+square] = { owner: +owner as PlayerColor, type: type as PieceType, hasMoved: true };
  }
  const players = { ...base.players };
  for (const color of spec.inactive ?? []) players[color as PlayerColor] = { ...players[color as PlayerColor], status: "checkmated", eliminatedOnTurn: 0 };
  const castlingRights = { ...base.castlingRights };
  for (const c of ALL_COLORS) castlingRights[c] = { kingside: false, queenside: false };
  const state = { ...base, board, players, castlingRights, turn: (spec.turn ?? 0) as PlayerColor };
  return { ...state, positionCounts: { [positionKey(state)]: 1 } };
}
/** Counts oracle move paths; terminal positions have no descendants. */
export function perft(state: GameState, depth: number): number {
  if (depth === 0) return 1;
  if (state.result) return 0;
  return legalMoves(state).reduce((sum,m) => sum+perft(applyMove(state,m),depth-1),0);
}
