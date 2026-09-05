import { PieceType } from "@li4chess/engine";

/** Standard Unicode chess glyphs (using the "white" set for every color; color is applied via CSS fill instead). */
export const PIECE_GLYPHS: Readonly<Record<PieceType, string>> = {
  [PieceType.King]: "♔",
  [PieceType.Queen]: "♕",
  [PieceType.Rook]: "♖",
  [PieceType.Bishop]: "♗",
  [PieceType.Knight]: "♘",
  [PieceType.Pawn]: "♙",
};
