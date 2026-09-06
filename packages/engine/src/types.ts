export const RULESET_ID = "li4chess-ffa-standard-v1" as const;

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

export type PlayerStatus = "active" | "checkmated" | "stalemated" | "resigned" | "timed-out";

export interface PlayerState {
  readonly noMoveCause?: { readonly actor:PlayerColor;readonly sequence:number };
  readonly kingStatus?: "walking" | "checkmated" | "stalemated" | "surrendered";
  readonly forfeit?: { readonly reason:"resign" | "timeout" | "disconnect"; readonly sequence:number;
    readonly clock?:{ readonly remainingMs:number }; readonly disconnect?:DisconnectFact };
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
  /** Mean occupied rank for shared placements; not a rating calculation. */
  readonly meanRank: number;
}

export interface GameResult {
  readonly placements: readonly Placement[];
  readonly winner: PlayerColor | null;
  readonly reason: "elimination" | "claim-win" | "repetition" | "insufficient-material" | "fifty-move" | "abort";
  readonly claim?: { readonly actor:PlayerColor;readonly trailer:PlayerColor;readonly lead:number;readonly causeSequence:number };
  readonly abort?: { readonly classification:"early-resign" | "early-timeout"; readonly actor:PlayerColor;
    readonly causeSequence:number; readonly completedMoves:Readonly<Record<PlayerColor,number>>; readonly ratingLiable:PlayerColor;
    readonly clock?:{ readonly remainingMs:number }; readonly disconnect?:DisconnectFact };
}

/** Local exhausted cumulative bank fact; connection tracking/authority belongs to M3. */
export interface DisconnectFact {
  readonly bankMs:60000;
  readonly cumulativeDisconnectedMs:number;
  readonly remainingMs:0;
}

export interface GameState {
  readonly reversibleMoves: number;
  readonly completedMoves: Readonly<Record<PlayerColor,number>>;
  readonly randomSeed: string;
  readonly randomDrawIndex: number;
  readonly randomActions: readonly RandomKingAction[];
  /** Logical event sequence: actions and individual nonzero awards each advance it. */
  readonly eventSequence: number;
  readonly awardLedger: readonly ScoreAward[];
  /** Accepted standard FFA semantics; historical and partial states are rejected. */
  readonly rulesetId: typeof RULESET_ID;
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
  readonly rule: "capture" | "multi-check" | "walking-stalemate" | "mate" | "self-stalemate" | "opponent-stalemate" | "survivor" | "claim-win" | "repetition" | "insufficient-material" | "fifty-move";
  readonly subject?: PlayerColor;
  readonly recipient: PlayerColor;
  readonly delta: number;
  readonly total: number;
}

export interface WalkingSelection {
  readonly algorithmId: "splitmix32-rejection-v1";
  readonly seed: string;
  readonly drawIndex: number;
  readonly drawsUsed: number;
  readonly candidateMovesHash: string;
}

export interface RandomKingAction {
  readonly sequence:number;
  readonly causeSequence:number;
  readonly actor:PlayerColor;
  readonly move:Move;
  readonly selection:WalkingSelection;
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
