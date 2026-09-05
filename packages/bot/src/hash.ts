import { ALL_COLORS, GameState, Piece } from "@li4chess/engine";

const MASK = (1n << 64n)-1n;
/** Deterministic pseudorandom token keys, then XOR as in Zobrist hashing. */
function token(key: string): bigint {
  let h = 14695981039346656037n;
  for (let i=0;i<key.length;i++) h = ((h ^ BigInt(key.charCodeAt(i))) * 1099511628211n) & MASK;
  h = ((h ^ (h >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  h = ((h ^ (h >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return h ^ (h >> 31n);
}
const pieceKeys = new Map<string,bigint>();
function pieceKey(square: number, piece: Piece | null): bigint {
  if (!piece) return 0n;
  const key = `${square}:${piece.owner}:${piece.type}:${+piece.hasMoved}`;
  let value = pieceKeys.get(key);
  if (value === undefined) { value = token(key); pieceKeys.set(key,value); }
  return value;
}
function metadata(s: GameState): string {
  return JSON.stringify([s.turn,s.turnNumber,s.enPassantTarget,
    ALL_COLORS.map(c=>[s.players[c].status,s.players[c].score,s.players[c].eliminatedOnTurn ?? null,
      s.castlingRights[c].kingside,s.castlingRights[c].queenside]),s.result,
    Object.entries(s.positionCounts).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0)]);
}
/** Full history counts are necessary: equal boards with different recurrence paths can have different values. */
export function searchSignature(s: GameState): string {
  return JSON.stringify(s.board)+metadata(s);
}
export function positionHash(s: GameState): bigint {
  let hash = token(metadata(s));
  for (let i=0;i<s.board.length;i++) hash ^= pieceKey(i,s.board[i]);
  return hash;
}
/** Oracle-compatible delta update. Scans changed squares (including elimination), not a make/unmake fast path. */
export function updatePositionHash(hash: bigint, before: GameState, after: GameState): bigint {
  let next = hash ^ token(metadata(before)) ^ token(metadata(after));
  for (let i=0;i<before.board.length;i++) if (before.board[i] !== after.board[i])
    next ^= pieceKey(i,before.board[i]) ^ pieceKey(i,after.board[i]);
  return next;
}

export interface TTEntry {
  signature: string; depth: number; value: number; bound: "exact" | "lower" | "upper";
  bestMove?: string;
}
/** Per-search table: root perspective/evaluator are fixed. Exact signature verifies collisions. */
export class TranspositionTable {
  private entries = new Map<bigint,TTEntry>();
  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) throw new Error("Invalid TT capacity");
  }
  get(hash: bigint, signature: string): TTEntry | undefined {
    const entry = this.entries.get(hash); return entry?.signature === signature ? entry : undefined;
  }
  set(hash: bigint, entry: TTEntry) {
    if (!this.capacity) return;
    if (!this.entries.has(hash) && this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(hash,entry);
  }
}
