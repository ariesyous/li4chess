import { boardToLocal, fileOf, isOnBoard, localSquare, rankOf, squareOf } from "../board.js";
import { GameState, Move, Piece, PieceType, PlayerColor } from "../types.js";
import { addVectors, forwardVector, sideVector } from "./directions.js";

const PROMOTION_LOCAL_RANK = 7;
const START_LOCAL_RANK = 1;

function baseMove(from: number, to: number, piece: Piece): Omit<Move, "promotion"> {
  return { from, to, piece, isCheck: [], eliminates: [] };
}

/** Pawn pushes, captures, en passant and promotion candidates. Ignores whether the mover's own king ends up in check. */
export function pawnMoves(state: GameState, from: number, piece: Piece): Move[] {
  const { board } = state;
  const color = piece.owner;
  if (state.players[color].status !== "active") return [];
  const moves: Move[] = [];
  const forward = forwardVector(color);
  const side = sideVector(color);

  const fromFile = fileOf(from);
  const fromRank = rankOf(from);
  const [, localRank] = boardToLocal(color, fromFile, fromRank);

  const pushDestination = (dist: number): number | null => {
    const file = fromFile + forward[0] * dist;
    const rank = fromRank + forward[1] * dist;
    if (!isOnBoard(file, rank)) return null;
    return squareOf(file, rank);
  };

  const emitWithPromotion = (from: number, to: number, extra: Partial<Move> = {}) => {
    const [, toLocalRank] = boardToLocal(color, fileOf(to), rankOf(to));
    if (toLocalRank === PROMOTION_LOCAL_RANK) {
      moves.push({ ...baseMove(from, to, piece), promotion: PieceType.Queen, ...extra });
    } else {
      moves.push({ ...baseMove(from, to, piece), ...extra });
    }
  };

  // Single push
  const oneStep = pushDestination(1);
  if (oneStep !== null && board[oneStep] === null) {
    emitWithPromotion(from, oneStep);

    // Double push, only from the starting rank, only if both squares are empty
    if (localRank === START_LOCAL_RANK && !piece.hasMoved) {
      const twoStep = pushDestination(2);
      if (twoStep !== null && board[twoStep] === null) {
        moves.push({ ...baseMove(from, twoStep, piece) });
      }
    }
  }

  // Captures (including en passant), diagonal = forward +/- side
  for (const sign of [1, -1] as const) {
    const [df, dr] = addVectors(forward, side, sign);
    const file = fromFile + df;
    const rank = fromRank + dr;
    if (!isOnBoard(file, rank)) continue;
    const to = squareOf(file, rank);
    const occupant = board[to];
    if (occupant !== null && occupant.owner !== color) {
      emitWithPromotion(from, to, { captured: occupant });
    } else if (occupant === null) {
      // The victim is located by its double push, not the capturer's axis:
      // adjacent-seat pawns can also attack the skipped square.
      for (const right of state.enPassantRights) {
        if (right.target !== to || !right.eligiblePlayers.includes(color)) continue;
        const capturedPawn = board[right.pawnSquare];
        if (!capturedPawn || capturedPawn.owner !== right.pawnOwner || capturedPawn.owner === color || capturedPawn.type !== PieceType.Pawn) continue;
        emitWithPromotion(from, to, {
          captured: capturedPawn,
          enPassantCapture: right.pawnSquare,
        });
      }
    }
  }

  return moves;
}

export function pawnStartSquares(color: PlayerColor): number[] {
  const squares: number[] = [];
  for (let f = 0; f < 8; f++) squares.push(localSquare(color, f, START_LOCAL_RANK));
  return squares;
}
