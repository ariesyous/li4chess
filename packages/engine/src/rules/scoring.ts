import { PieceType } from "../types.js";

export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  [PieceType.Pawn]: 1,
  [PieceType.Knight]: 3,
  [PieceType.Bishop]: 3,
  [PieceType.Rook]: 5,
  [PieceType.Queen]: 9,
  [PieceType.King]: 0, // kings are never "captured" — see elimination rules
};
