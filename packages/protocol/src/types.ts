import type { GameResult, GameState, Move, PlayerColor, ScoreAward, WalkingSelection } from "@li4chess/engine";

export const STANDARD_RULESET = "li4chess-ffa-standard-v1" as const;
export const STATE_SCHEMA = "li4chess-state-v2" as const;
export const MODERN_SETUP = "li4chess-modern-ffa-setup-v1" as const;

export interface EngineBuildIdentityV1 {
  readonly format: "li4chess-engine-build-v1";
  readonly sourceRevision: string;
  readonly packageVersions: Readonly<Record<string, string>>;
  readonly workingTree: { readonly status: "clean" } | { readonly status: "dirty"; readonly contentHash: string }
    | { readonly status: "unreproducible"; readonly reason: string };
  readonly buildFingerprint?: string;
}

/** Explicit v2 projection: the ruleset identity is carried by the versioned envelope. */
export interface RulesetStateV2 {
  readonly stateSchemaId: typeof STATE_SCHEMA;
  readonly rulesetId: typeof STANDARD_RULESET;
  readonly setupId: string;
  /** Sequence in this replay, distinct from preserved checkpoint position history. */
  readonly sequence: number;
  readonly position: Omit<GameState, "rulesetId">;
  readonly pendingEffects: readonly ReplayEffect[];
}
export interface RulesetResultV2 {
  readonly stateSchemaId: typeof STATE_SCHEMA;
  readonly rulesetId: typeof STANDARD_RULESET;
  readonly result: GameResult;
}

export type ReplayAction =
  | { readonly type: "move"; readonly actor: PlayerColor; readonly move: Move }
  | { readonly type: "resign"; readonly actor: PlayerColor }
  | { readonly type: "timeout"; readonly actor: PlayerColor; readonly clock: { readonly remainingMs: number } }
  | { readonly type: "disconnectForfeit"; readonly actor: PlayerColor; readonly disconnect: DisconnectFact }
  | { readonly type: "randomKingMove"; readonly actor: PlayerColor; readonly causeSequence?: number;
      readonly checkpointCause?: { readonly positionSequence: number };
      readonly move: Move; readonly selection: WalkingSelection }
  | { readonly type: "claimWin"; readonly actor: PlayerColor };

export interface DisconnectFact {
  readonly bankMs: 60000;
  readonly cumulativeDisconnectedMs: number;
  readonly remainingMs: 0;
}
export type ActionRequest = Exclude<ReplayAction, { type: "move" | "randomKingMove" }>
  | { readonly type: "move"; readonly actor: PlayerColor; readonly move: Pick<Move, "from" | "to" | "promotion"> }
  | { readonly type: "randomKingMove"; readonly actor: PlayerColor };
export type ReplayEffect =
  | { readonly type: "scoreAward"; readonly causeSequence: number; readonly award: ScoreAward }
  | { readonly type: "terminal" | "abort"; readonly causeSequence: number; readonly result: RulesetResultV2 };
export type ReplayEventV2 = (ReplayAction | ReplayEffect) & {
  readonly sequence: number;
  readonly positionSequence: number;
  readonly stateHashBefore: string;
  readonly stateHashAfter: string;
};
export interface ReplayEnvelopeV2 {
  readonly format: "li4chess-replay-v2";
  readonly replaySchemaVersion: 2;
  readonly rulesetId: typeof STANDARD_RULESET;
  readonly stateSchemaId: typeof STATE_SCHEMA;
  readonly engineBuild: EngineBuildIdentityV1;
  readonly game: { readonly mode: "ffa"; readonly setupId: string; readonly seatOrder: readonly PlayerColor[];
    readonly sourceReplayHash?: string };
  readonly initialState: RulesetStateV2;
  readonly initialStateHash: string;
  readonly events: readonly ReplayEventV2[];
  readonly result: RulesetResultV2 | null;
  readonly finalStateHash: string;
}
