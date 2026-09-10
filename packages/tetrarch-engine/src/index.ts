import { ALL_COLORS, PieceType, isSquareOnBoard, boardToLocal, legalMoves, positionKey } from "@li4chess/engine";
import type { GameState, Move } from "@li4chess/engine";

export const TETRARCH_REVISION = "4a35cea06b710a6633302c2226ebfebbba52d7a4";

/** Production support is deliberately empty: root parity cannot fix divergent search rules. */
export function canUseTetrarch(_state: GameState): { supported: false; reasons: string[] } {
  return { supported: false, reasons: ["v8-search-semantics-unaccepted", ...researchCapability(_state)] };
}

/** Root movegen transport only. NOT a claim that Tetrarch can search this state faithfully. */
export function researchCapability(state: GameState): string[] {
  const reasons: string[] = [];
  if (state.rulesetId !== "li4chess-ffa-standard-v1") reasons.push("ruleset");
  if (state.result) reasons.push("terminal");
  if (state.enPassantRights.length) reasons.push("en-passant-semantics");
  for (const c of ALL_COLORS) {
    const p = state.players[c];
    if (p.status === "resigned" || p.status === "timed-out" || p.kingStatus === "walking") reasons.push("forfeit-or-walking-king");
    if (!Number.isInteger(p.score) || p.score < 0 || p.score > 65535) reasons.push("fractional-or-out-of-range-score");
  }
  for (let s = 0; s < state.board.length; s++) {
    const p = state.board[s];
    if (p?.type === PieceType.Pawn && p.hasMoved && boardToLocal(p.owner, s % 14, Math.floor(s / 14))[1] === 1)
      reasons.push("moved-pawn-on-home-rank");
  }
  return [...new Set(reasons)];
}

export function toMailbox(square: number): number {
  if (!Number.isInteger(square) || !isSquareOnBoard(square)) throw new Error("Invalid canonical square");
  return Math.floor(square / 14) * 16 + square % 14;
}
export function fromMailbox(square: number): number {
  if (!Number.isInteger(square) || square < 0 || square > 255 || (square & 15) > 13) throw new Error("Invalid mailbox square");
  const canonical = (square >> 4) * 14 + (square & 15);
  if (!isSquareOnBoard(canonical)) throw new Error("Invalid mailbox square");
  return canonical;
}
export function decodeMove(raw: number): Pick<Move, "from" | "to" | "promotion"> {
  if (!Number.isInteger(raw) || raw < 0 || raw > 0x7fffff) throw new Error("Invalid encoded move");
  const promotion = (raw >>> 20) & 7;
  if (promotion !== 0 && promotion !== 6) throw new Error("Unsupported promotion");
  return { from: fromMailbox(raw & 255), to: fromMailbox((raw >>> 8) & 255),
    ...(promotion ? { promotion: PieceType.Queen } : {}) };
}
export function matchCandidate(state: GameState, raw: number): { move?: Move; diagnostic?: unknown } {
  const moves = state.result || state.players[state.turn].status !== "active" ? [] : legalMoves(state);
  try {
    const request = decodeMove(raw);
    const move = moves.find(m => m.from === request.from && m.to === request.to && m.promotion === request.promotion);
    if (move) return { move };
  } catch { /* Rejection includes the original encoding, never fabricated metadata. */ }
  return { diagnostic: { reason: "illegal-external-move", position: positionKey(state), turn: state.turn,
    externalMove: raw, capability: canUseTetrarch(state), canonicalLegalMoves: moves.map(m => ({ from:m.from, to:m.to, promotion:m.promotion })) } };
}

export function chooseWithFallback(state: GameState, fallback: (state: GameState) => Move): { move: Move; fallbackReason: string[] } {
  const capability = canUseTetrarch(state);
  if (state.result || state.players[state.turn].status !== "active") throw new Error("No ordinary bot turn");
  const candidate = fallback(structuredClone(state));
  const move = legalMoves(state).find(m => m.from === candidate.from && m.to === candidate.to && m.promotion === candidate.promotion);
  if (!move) throw new Error("Native fallback returned an illegal move");
  return { move, fallbackReason: capability.reasons };
}

export function packResearchState(state: GameState): { squares: Uint8Array; meta: Int32Array } {
  const unsupported = researchCapability(state);
  if (unsupported.length) throw new Error(`Unsupported research state: ${unsupported.join(",")}`);
  const squares = new Uint8Array(256);
  const types = "PNBRQK";
  state.board.forEach((p, s) => { if (p) squares[toMailbox(s)] = 1 + p.owner * 7 + (p.promotedFrom ? 6 : types.indexOf(p.type)); });
  const meta = new Int32Array(18);
  for (const c of ALL_COLORS) {
    meta[c] = state.players[c].score;
    meta[4+c] = Number(state.players[c].status === "active");
    meta[8+c] = Number(state.castlingRights[c].kingside);
    meta[12+c] = Number(state.castlingRights[c].queenside);
  }
  meta[16] = state.turn; meta[17] = state.reversibleMoves;
  return { squares, meta };
}
