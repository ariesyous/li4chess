import { ALL_COLORS, PieceType } from "@li4chess/engine";
import type { Move, Piece, PlayerColor } from "@li4chess/engine";

export interface CaptureGroup {
  readonly key: string;
  readonly piece: Piece;
  readonly count: number;
}

/** Use recorded captures, including en passant and walking-King moves, rather than missing board pieces or scores. */
export function capturedPiecesByPlayer(history: readonly Move[]): Record<PlayerColor, readonly CaptureGroup[]> {
  const order = [PieceType.King, PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight, PieceType.Pawn];
  const result: Record<PlayerColor, readonly CaptureGroup[]> = { 0: [], 1: [], 2: [], 3: [] };
  for (const color of ALL_COLORS) {
    const groups = new Map<string, CaptureGroup>();
    for (const move of history) {
      if (move.piece.owner !== color || !move.captured) continue;
      const piece = move.captured;
      const key = `${piece.owner}-${piece.type}-${piece.promotedFrom ?? ""}`;
      groups.set(key, { key, piece, count: (groups.get(key)?.count ?? 0) + 1 });
    }
    result[color] = [...groups.values()].sort((a, b) => a.piece.owner - b.piece.owner || order.indexOf(a.piece.type) - order.indexOf(b.piece.type));
  }
  return result;
}
