import { Piece, PieceType } from "../types.js";

/** Value of a live captured piece; caller handles passive/dead eligibility. */
export function captureValue(piece: Piece): number {
  return piece.promotedFrom === PieceType.Pawn ? 1 : PIECE_VALUES[piece.type];
}

export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  [PieceType.Pawn]: 1,
  [PieceType.Knight]: 3,
  [PieceType.Bishop]: 3,
  [PieceType.Rook]: 5,
  [PieceType.Queen]: 9,
  [PieceType.King]: 0, // kings are never "captured" — see elimination rules
};
