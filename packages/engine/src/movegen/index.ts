import { VALID_SQUARES } from "../board.js";
import { GameState, Move, Piece, PieceType, PlayerColor } from "../types.js";
import { castlingMoves } from "./castling.js";
import { BISHOP_DIRECTIONS, KING_DELTAS, KNIGHT_DELTAS, QUEEN_DIRECTIONS, ROOK_DIRECTIONS } from "./directions.js";
import { leaperDestinations } from "./leapers.js";
import { pawnMoves } from "./pawns.js";
import { slidingDestinations } from "./sliding.js";

export * from "./directions.js";
export * from "./castling.js";
export { raySquares, slidingDestinations } from "./sliding.js";
export { leaperDestinations } from "./leapers.js";
export { pawnMoves, pawnStartSquares } from "./pawns.js";

function movesTo(from: number, destinations: number[], piece: Piece, board: readonly (Piece | null)[]): Move[] {
  return destinations.map((to) => ({
    from,
    to,
    piece,
    captured: board[to] ?? undefined,
    isCheck: [],
    eliminates: [],
  }));
}

/**
 * All pseudo-legal moves for `color` (or state.turn if omitted): obeys piece
 * movement rules, board shape, and castling/en-passant bookkeeping, but does
 * NOT filter out moves that leave the mover's own king in check — that
 * filtering happens in the legality module (task 4).
 */
export function pseudoLegalMoves(state: GameState, color: PlayerColor = state.turn): Move[] {
  if (state.players[color].status !== "active") return [];
  const { board } = state;
  const moves: Move[] = [];

  for (const from of VALID_SQUARES) {
    const piece = board[from];
    if (piece === null || piece.owner !== color) continue;

    switch (piece.type) {
      case PieceType.Pawn:
        moves.push(...pawnMoves(state, from, piece));
        break;
      case PieceType.Knight:
        moves.push(...movesTo(from, leaperDestinations(from, KNIGHT_DELTAS, board, color), piece, board));
        break;
      case PieceType.Bishop:
        moves.push(...movesTo(from, slidingDestinations(from, BISHOP_DIRECTIONS, board, color), piece, board));
        break;
      case PieceType.Rook:
        moves.push(...movesTo(from, slidingDestinations(from, ROOK_DIRECTIONS, board, color), piece, board));
        break;
      case PieceType.Queen:
        moves.push(...movesTo(from, slidingDestinations(from, QUEEN_DIRECTIONS, board, color), piece, board));
        break;
      case PieceType.King:
        moves.push(...movesTo(from, leaperDestinations(from, KING_DELTAS, board, color), piece, board));
        break;
    }
  }

  moves.push(...castlingMoves(state, color));

  return moves;
}
