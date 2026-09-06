export enum PlayerColor {
  Red = 0,
  Blue = 1,
  Yellow = 2,
  Green = 3,
}

export const ALL_COLORS: readonly PlayerColor[] = [
  PlayerColor.Red,
  PlayerColor.Blue,
  PlayerColor.Yellow,
  PlayerColor.Green,
];

/** Turn order rotates clockwise: Red -> Blue -> Yellow -> Green -> Red ... */
export function nextColor(color: PlayerColor): PlayerColor {
  return ((color + 1) % 4) as PlayerColor;
}

export enum PieceType {
  Pawn = "P",
  Knight = "N",
  Bishop = "B",
  Rook = "R",
  Queen = "Q",
  King = "K",
}

export interface Piece {
  readonly type: PieceType;
  readonly owner: PlayerColor;
  readonly hasMoved: boolean;
  /** Automatic pawn-Queen: Queen geometry/classification, one capture point. */
  readonly promotedFrom?: PieceType.Pawn;
}

/** Index into the flat 196-cell (14x14) board array. 0..195. */
export type Square = number;

export type PlayerStatus = "active" | "checkmated" | "stalemated" | "resigned";

export interface PlayerState {
  readonly color: PlayerColor;
  readonly status: PlayerStatus;
  readonly isCPU: boolean;
  readonly cpuDifficulty?: number;
  readonly score: number;
  readonly eliminatedOnTurn?: number;
}

export interface CastlingRights {
  readonly kingside: boolean;
  readonly queenside: boolean;
}

export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly piece: Piece;
  readonly captured?: Piece;
  readonly promotion?: PieceType;
  readonly castle?: "kingside" | "queenside";
  /** Square of the pawn removed by an en passant capture (distinct from `to`). */
  readonly enPassantCapture?: Square;
  /** Colors of opponents whose king this move puts in check (0-3 entries). Populated by applyMove. */
  readonly isCheck: readonly PlayerColor[];
  /** Colors of players eliminated (checkmated) as a direct result of this move. Populated by applyMove. */
  readonly eliminates: readonly PlayerColor[];
}

export interface Placement {
  readonly color: PlayerColor;
  readonly place: number;
  readonly score: number;
}

export interface GameResult {
  readonly placements: readonly Placement[];
  readonly winner: PlayerColor | null;
  /** "elimination": exactly one active player remained. "repetition": drawn — the same position recurred 3 times, so every still-active player ties for first. */
  readonly reason: "elimination" | "repetition";
}

export interface GameState {
  /** Logical event sequence: actions and individual nonzero awards each advance it. */
  readonly eventSequence: number;
  readonly awardLedger: readonly ScoreAward[];
  /** Partial M1 migration only. Neither historical house-v1 nor reserved standard-v1. */
  readonly rulesetId: null;
  readonly board: readonly (Piece | null)[];
  readonly players: Readonly<Record<PlayerColor, PlayerState>>;
  readonly turn: PlayerColor;
  readonly turnNumber: number;
  readonly castlingRights: Readonly<Record<PlayerColor, CastlingRights>>;
  readonly enPassantRights: readonly EnPassantRight[];
  readonly moveHistory: readonly Move[];
  readonly result: GameResult | null;
  /** Counts how many times each position (see rules/repetition.ts) has occurred, for threefold-repetition draw detection. */
  readonly positionCounts: Readonly<Record<string, number>>;
}

export interface ScoreAward {
  readonly sequence: number;
  readonly causeSequence: number;
  readonly rule: "capture" | "multi-check";
  readonly recipient: PlayerColor;
  readonly delta: number;
  readonly total: number;
}

/** One double push can grant several opponents one opportunity each. */
export interface EnPassantRight {
  readonly target: Square;
  readonly pawnSquare: Square;
  readonly pawnOwner: PlayerColor;
  /** Fixed at the push, then consumed individually on each eligible player's turn. */
  readonly eligiblePlayers: readonly PlayerColor[];
}

export interface SeatConfig {
  readonly isCPU: Readonly<Record<PlayerColor, boolean>>;
  readonly cpuDifficulty?: Readonly<Partial<Record<PlayerColor, number>>>;
}
