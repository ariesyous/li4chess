import {
  ALL_COLORS,
  GameState,
  PIECE_VALUES,
  PieceType,
  PlayerColor,
  boardToLocal,
  fileOf,
  isPlayerInCheck,
  isSquareAttacked,
  pseudoLegalMoves,
  rankOf,
} from "@li4chess/engine";

/** v1 eval: material only, from `botColor`'s perspective. Kept for comparison/regression baselines. */
export function evaluateMaterial(state: GameState, botColor: PlayerColor): number {
  let score = 0;
  for (const piece of state.board) {
    if (piece === null) continue;
    const value = PIECE_VALUES[piece.type];
    score += piece.owner === botColor ? value : -value;
  }
  return score;
}

export interface EvalWeights {
  readonly material: number;
  readonly kingSafety: number;
  readonly centerControl: number;
  readonly mobility: number;
  readonly threatBalance: number;
  readonly survivalBias: number;
  /** Rewards pawns for being closer to their own promotion rank — without this, nothing in the eval favors pushing a pawn over any other quiet move, so it never seeks to force promotion/checkmate on its own. */
  readonly pawnAdvancement: number;
}

export const FULL_EVAL_WEIGHTS: EvalWeights = {
  material: 1,
  kingSafety: 0.3,
  centerControl: 0.05,
  mobility: 0.02,
  threatBalance: 0.15,
  survivalBias: 3,
  pawnAdvancement: 0.1,
};

export const MATERIAL_ONLY_WEIGHTS: EvalWeights = {
  material: 1,
  kingSafety: 0,
  centerControl: 0,
  mobility: 0,
  threatBalance: 0,
  survivalBias: 0,
  pawnAdvancement: 0,
};

// Central squares of the 14x14 cross board — contested by all 4 players at once,
// unlike standard chess where center vs. corner is a 2-player-only distinction.
const CENTER_MIN = 5;
const CENTER_MAX = 8;

function isCenterSquare(square: number): boolean {
  const f = fileOf(square);
  const r = rankOf(square);
  return f >= CENTER_MIN && f <= CENTER_MAX && r >= CENTER_MIN && r <= CENTER_MAX;
}

function activeOpponentsOf(state: GameState, color: PlayerColor): PlayerColor[] {
  return ALL_COLORS.filter((c) => c !== color && state.players[c].status === "active");
}

/**
 * Full v2 eval, weighted sum of several factors, all folded to a single scalar
 * from `botColor`'s perspective (required by the paranoid search backup).
 * Mobility/threat terms deliberately use cheap approximations
 * (pseudo-legal move counts, single-attacker checks) rather than full legality
 * simulation, since this runs at every leaf node of the search.
 */
export function evaluateFull(
  state: GameState,
  botColor: PlayerColor,
  weights: EvalWeights = FULL_EVAL_WEIGHTS
): number {
  const opponents = activeOpponentsOf(state, botColor);

  let material = 0;
  let centerControl = 0;
  let threatBalance = 0;
  let pawnAdvancement = 0;

  for (let square = 0; square < state.board.length; square++) {
    const piece = state.board[square];
    if (piece === null) continue;
    const value = PIECE_VALUES[piece.type];
    const isBot = piece.owner === botColor;
    material += isBot ? value : -value;

    if (isCenterSquare(square)) centerControl += isBot ? 1 : -1;

    if (piece.type === PieceType.Pawn) {
      const [, localRank] = boardToLocal(piece.owner, fileOf(square), rankOf(square));
      pawnAdvancement += isBot ? localRank : -localRank;
    }

    if (piece.type !== PieceType.King) {
      if (isBot) {
        // Bot material currently hanging to any active opponent.
        if (opponents.some((opp) => isSquareAttacked(state.board, square, opp))) {
          threatBalance -= value;
        }
      } else if (state.players[piece.owner].status === "active") {
        // Opponent material currently hanging to the bot.
        if (isSquareAttacked(state.board, square, botColor)) {
          threatBalance += value;
        }
      }
    }
  }

  const botMobility = pseudoLegalMoves(state, botColor).length;
  const opponentMobility =
    opponents.length === 0
      ? 0
      : opponents.reduce((sum, opp) => sum + pseudoLegalMoves(state, opp).length, 0) / opponents.length;
  const mobility = botMobility - opponentMobility;

  const kingSafety = isPlayerInCheck(state, botColor) ? -1 : 0;
  const survivalBias = state.players[botColor].status !== "active" ? -1 : 0;

  return (
    material * weights.material +
    centerControl * weights.centerControl +
    mobility * weights.mobility +
    threatBalance * weights.threatBalance +
    kingSafety * weights.kingSafety +
    survivalBias * weights.survivalBias +
    pawnAdvancement * weights.pawnAdvancement
  );
}
