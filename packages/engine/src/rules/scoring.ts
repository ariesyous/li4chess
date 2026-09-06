import { ALL_COLORS, GameState, Move, Piece, PieceType, PlayerColor, ScoreAward } from "../types.js";
import { findKingSquare, pieceAttacksSquare } from "./attacks.js";
import { isPlayerInCheck } from "./check.js";

/** Value of a live captured piece; caller handles passive/dead eligibility. */
export function captureValue(piece: Piece): number {
  return piece.promotedFrom === PieceType.Pawn ? 1 : PIECE_VALUES[piece.type];
}

export const PIECE_VALUES: Readonly<Record<PieceType, number>> = {
  [PieceType.Pawn]: 1,
  [PieceType.Knight]: 3,
  [PieceType.Bishop]: 5,
  [PieceType.Rook]: 5,
  [PieceType.Queen]: 9,
  [PieceType.King]: 20, // live kings are non-capturable; king awards use this value
};

/** Append one immutable nonzero award; events retain their initiating cause. */
export function awardPoints(state: GameState, rule: ScoreAward["rule"], recipient: PlayerColor, delta: number, causeSequence: number, subject?: PlayerColor): GameState {
  if (delta === 0) return state;
  const total = (Math.round(state.players[recipient].score*3) + Math.round(delta*3))/3;
  const sequence = state.eventSequence + 1;
  return { ...state, eventSequence:sequence,
    players:{ ...state.players, [recipient]:{ ...state.players[recipient], score:total } },
    awardLedger:[...state.awardLedger, { sequence,causeSequence,rule,recipient,delta,total,...(subject === undefined ? {} : { subject }) }] };
}

/** New checks by the mover's army only; continuing checks never count.
 * Move.isCheck includes continuing checks and is deliberately not the oracle.
 */
export function multiCheckPoints(before: GameState, after: GameState, move: Move): number {
  const checkingTypes: PieceType[] = [];
  let checkedKings = 0;
  for (const color of ALL_COLORS) {
    if (color === move.piece.owner || before.players[color].status !== "active" || isPlayerInCheck(before,color)) continue;
    const king = findKingSquare(after.board,color);
    if (king === null) continue;
    const types = after.board.flatMap((piece,from) =>
      piece?.owner === move.piece.owner && pieceAttacksSquare(after.board,from,king) ? [piece.type] : []);
    if (types.length) { checkedKings++; checkingTypes.push(...types); }
  }
  if (checkedKings < 2) return 0;
  const queen = checkingTypes.includes(PieceType.Queen);
  return checkedKings === 2 ? (queen ? 1 : 5) : (queen ? 5 : 20);
}
