import { localSquare, NUM_SQUARES } from "./board.js";
import { positionKey } from "./rules/repetition.js";
import {
  ALL_COLORS,
  GameState,
  Piece,
  PieceType,
  PlayerColor,
  PlayerState,
  SeatConfig,
} from "./types.js";

/** Standard back-rank order, queenside -> kingside, local file 0..7. */
const BACK_RANK: readonly PieceType[] = [
  PieceType.Rook,
  PieceType.Knight,
  PieceType.Bishop,
  PieceType.Queen,
  PieceType.King,
  PieceType.Bishop,
  PieceType.Knight,
  PieceType.Rook,
];

function piece(type: PieceType, owner: PlayerColor): Piece {
  return { type, owner, hasMoved: false };
}

export function createInitialState(seatConfig?: SeatConfig): GameState {
  const board: (Piece | null)[] = new Array(NUM_SQUARES).fill(null);

  for (const color of ALL_COLORS) {
    for (let file = 0; file < 8; file++) {
      board[localSquare(color, file, 0)] = piece(BACK_RANK[file], color);
      board[localSquare(color, file, 1)] = piece(PieceType.Pawn, color);
    }
  }

  const players = {} as Record<PlayerColor, PlayerState>;
  for (const color of ALL_COLORS) {
    players[color] = {
      color,
      status: "active",
      isCPU: seatConfig?.isCPU[color] ?? false,
      cpuDifficulty: seatConfig?.cpuDifficulty?.[color],
      score: 0,
    };
  }

  const castlingRights = {} as GameState["castlingRights"];
  for (const color of ALL_COLORS) {
    (castlingRights as Record<PlayerColor, { kingside: boolean; queenside: boolean }>)[color] = {
      kingside: true,
      queenside: true,
    };
  }

  const initial: GameState = {
    rulesetId: null,
    board,
    players,
    turn: PlayerColor.Red,
    turnNumber: 1,
    castlingRights,
    enPassantRights: [],
    moveHistory: [],
    result: null,
    positionCounts: {},
  };
  return { ...initial, positionCounts: { [positionKey(initial)]: 1 } };
}
