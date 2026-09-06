import { localSquare } from "../board.js";
import { GameState, Move, PieceType, PlayerColor } from "../types.js";

const KING_LOCAL_FILE = 4;
const QUEENSIDE_ROOK_LOCAL_FILE = 0;
const KINGSIDE_ROOK_LOCAL_FILE = 7;

interface CastleSpec {
  readonly side: "kingside" | "queenside";
  readonly rookFromLocalFile: number;
  readonly kingToLocalFile: number;
  readonly rookToLocalFile: number;
}

const SPECS: readonly CastleSpec[] = [
  { side: "kingside", rookFromLocalFile: KINGSIDE_ROOK_LOCAL_FILE, kingToLocalFile: 6, rookToLocalFile: 5 },
  { side: "queenside", rookFromLocalFile: QUEENSIDE_ROOK_LOCAL_FILE, kingToLocalFile: 2, rookToLocalFile: 3 },
];

/**
 * Castling candidates ignoring the "king not in / passing through check" restriction
 * (that's applied during legality filtering, since it needs attack detection).
 */
export function castlingMoves(state: GameState, color: PlayerColor): Move[] {
  if (state.players[color].status !== "active") return [];
  const rights = state.castlingRights[color];
  const kingFrom = localSquare(color, KING_LOCAL_FILE, 0);
  const king = state.board[kingFrom];
  if (king === null || king.owner !== color || king.type !== PieceType.King || king.hasMoved) return [];

  const moves: Move[] = [];
  for (const spec of SPECS) {
    if (spec.side === "kingside" && !rights.kingside) continue;
    if (spec.side === "queenside" && !rights.queenside) continue;

    const rookFrom = localSquare(color, spec.rookFromLocalFile, 0);
    const rook = state.board[rookFrom];
    if (rook === null || rook.owner !== color || rook.type !== PieceType.Rook || rook.hasMoved) continue;

    const lo = Math.min(KING_LOCAL_FILE, spec.rookFromLocalFile);
    const hi = Math.max(KING_LOCAL_FILE, spec.rookFromLocalFile);
    let pathClear = true;
    for (let f = lo + 1; f < hi; f++) {
      if (state.board[localSquare(color, f, 0)] !== null) {
        pathClear = false;
        break;
      }
    }
    if (!pathClear) continue;

    const kingTo = localSquare(color, spec.kingToLocalFile, 0);
    moves.push({
      from: kingFrom,
      to: kingTo,
      piece: king,
      castle: spec.side,
      isCheck: [],
      eliminates: [],
    });
  }
  return moves;
}

/** For applyMove: given a castle move, the rook's from/to squares. */
export function rookSquaresForCastle(
  color: PlayerColor,
  side: "kingside" | "queenside"
): { from: number; to: number } {
  const spec = SPECS.find((s) => s.side === side)!;
  return {
    from: localSquare(color, spec.rookFromLocalFile, 0),
    to: localSquare(color, spec.rookToLocalFile, 0),
  };
}

/** The squares the king passes through (inclusive of destination, exclusive of origin) during castling — must not be attacked. */
export function kingPathSquares(
  color: PlayerColor,
  side: "kingside" | "queenside"
): number[] {
  const spec = SPECS.find((s) => s.side === side)!;
  const lo = Math.min(KING_LOCAL_FILE, spec.kingToLocalFile);
  const hi = Math.max(KING_LOCAL_FILE, spec.kingToLocalFile);
  const squares: number[] = [];
  for (let f = lo; f <= hi; f++) {
    if (f === KING_LOCAL_FILE) continue;
    squares.push(localSquare(color, f, 0));
  }
  return squares;
}
