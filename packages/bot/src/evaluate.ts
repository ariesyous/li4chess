import {
  ALL_COLORS,
  BOARD_SIZE,
  GameState,
  KING_DELTAS,
  PIECE_VALUES,
  PieceType,
  PlayerColor,
  attackMap,
  boardToLocal,
  fileOf,
  isOnBoard,
  isPlayerInCheck,
  pseudoLegalMoves,
  rankOf,
  hasLiveKing,
  isLivePiece,
} from "@li4chess/engine";

// A king has a rule award value of 20, but is not capturable material.
const MATERIAL_VALUES = { ...PIECE_VALUES, [PieceType.King]: 0 };

/** Active material only, from `botColor`'s perspective. */
export function evaluateMaterial(state: GameState, botColor: PlayerColor): number {
  let score = 0;
  for (const piece of state.board) {
    if (piece === null || state.players[piece.owner].status !== "active") continue;
    const value = MATERIAL_VALUES[piece.type];
    score += piece.owner === botColor ? value : -value;
  }
  return score;
}

/**
 * Magnitude of a decisive result. Far above any reachable material score, so
 * terminal result ordering dominates every positional term — without
 * this the bot happily walks into checkmate to win a queen. Historically,
 * mate removed its army and `survivalBias` charged only 3 pawns for losing.
 * Retained passive material likewise has no live evaluation value.
 *
 * Scores at or beyond MATE_THRESHOLD are treated as "decisive" by the search,
 * which shifts them toward zero by the ply they were found at so that a faster
 * win outranks a slower one.
 */
export const WIN_SCORE = 1_000_000;
export const MATE_THRESHOLD = WIN_SCORE / 2;

/** Terminal outcomes rank by points and shared mean rank; chronology is irrelevant. */
const PLACEMENT_CREDIT = 1_000;

export interface EvalWeights {
  readonly material: number;
  readonly kingSafety: number;
  readonly centerControl: number;
  readonly mobility: number;
  readonly threatBalance: number;
  /** Rewards pawns for being closer to their own promotion rank — without this, nothing in the eval favors pushing a pawn over any other quiet move, so it never seeks to force promotion/checkmate on its own. */
  readonly pawnAdvancement: number;
  /** Per opponent already out of the game: in a free-for-all, one fewer live attacker is worth something beyond the material they took with them (a mated bare king removes no material at all). */
  readonly eliminationBonus: number;
  /**
   * Endgame-only drive toward actually delivering mate against an opponent who
   * is down to a bare king: confine their king to the board edge, cut down its
   * escape squares, and walk our own king in. Every other term is flat across
   * such a position — a lone enemy king means no material to win, no threats to
   * balance and no center to contest — so without this the bot has literally
   * nothing to distinguish one queen move from another and shuffles forever.
   */
  readonly kingHunt: number;
  /** Historical configuration field; points-based terminal ranks do not use material contempt. */
  readonly drawContempt: number;
}

export const FULL_EVAL_WEIGHTS: EvalWeights = {
  material: 1,
  kingSafety: 0.3,
  centerControl: 0.05,
  mobility: 0.02,
  threatBalance: 0.15,
  pawnAdvancement: 0.1,
  eliminationBonus: 2,
  kingHunt: 0.2,
  drawContempt: 8,
};

export const MATERIAL_ONLY_WEIGHTS: EvalWeights = {
  material: 1,
  kingSafety: 0,
  centerControl: 0,
  mobility: 0,
  threatBalance: 0,
  pawnAdvancement: 0,
  eliminationBonus: 0,
  kingHunt: 0,
  drawContempt: 0,
};

// Central squares of the 14x14 cross board — contested by all 4 players at once,
// unlike standard chess where center vs. corner is a 2-player-only distinction.
const CENTER_MIN = 5;
const CENTER_MAX = 8;
const BOARD_CENTER = (BOARD_SIZE - 1) / 2;

function isCenterSquare(square: number): boolean {
  const f = fileOf(square);
  const r = rankOf(square);
  return f >= CENTER_MIN && f <= CENTER_MAX && r >= CENTER_MIN && r <= CENTER_MAX;
}

function activeOpponentsOf(state: GameState, color: PlayerColor): PlayerColor[] {
  return ALL_COLORS.filter((c) => c !== color && hasLiveKing(state,c));
}

function chebyshevDistance(a: number, b: number): number {
  return Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)));
}

/** How far a square sits from the middle of the board — 0 dead center, ~6.5 at an arm tip. */
function distanceFromCenter(square: number): number {
  return Math.max(Math.abs(fileOf(square) - BOARD_CENTER), Math.abs(rankOf(square) - BOARD_CENTER));
}

/**
 * Per-color totals gathered in the eval's single sweep of the board, so the
 * endgame terms below don't each re-walk all 196 cells looking for a king or
 * adding up material.
 */
interface BoardSummary {
  /** Square each color's king stands on, or -1 if it has none. Indexed by PlayerColor. */
  readonly kingSquare: Int32Array;
  /** Value of everything a color owns except its king. Indexed by PlayerColor. */
  readonly nonKingMaterial: Int32Array;
}

/**
 * Squares the king on `kingSquare` could still step to: on the board, not
 * occupied by one of its own pieces, and not covered by the hunter. An
 * approximation of "escape squares" — it ignores pins and discovered checks,
 * which is fine for a heuristic that only ever runs against a bare king.
 */
function escapeSquareCount(
  board: GameState["board"],
  kingSquare: number,
  kingOwner: PlayerColor,
  hunterAttacks: Uint8Array
): number {
  const file = fileOf(kingSquare);
  const rank = rankOf(kingSquare);
  let count = 0;
  for (const [df, dr] of KING_DELTAS) {
    const f = file + df;
    const r = rank + dr;
    if (!isOnBoard(f, r)) continue;
    const square = r * BOARD_SIZE + f;
    if (hunterAttacks[square] === 1) continue;
    const occupant = board[square];
    if (occupant !== null && occupant.owner === kingOwner) continue;
    count++;
  }
  return count;
}

/** Least material that can realistically force a win: a rook, a queen, or two-plus minors. */
const MATING_MATERIAL = 5;

/**
 * Positive when `botColor` is closing out a won bare-king endgame: the target
 * king pushed toward an edge or an arm tip, its escape squares taken away, and
 * our own king marched up to support. Zero unless some opponent really is down
 * to a lone king while we hold enough to finish with, so it cannot distort
 * ordinary middlegame judgement.
 *
 * Taking a lone king's last escape square is a win here whether or not it is in
 * check at the time: a stalemated player is no longer active, so under this
 * variant's rules stalemating the last opponent leaves the bot the sole
 * survivor and therefore the winner (see docs/rules-spec.md).
 */
function kingHuntScore(
  board: GameState["board"],
  botColor: PlayerColor,
  opponents: readonly PlayerColor[],
  summary: BoardSummary,
  botAttacks: Uint8Array
): number {
  const botKing = summary.kingSquare[botColor];
  if (botKing < 0 || summary.nonKingMaterial[botColor] < MATING_MATERIAL) return 0;

  let score = 0;
  for (const opponent of opponents) {
    const targetKing = summary.kingSquare[opponent];
    if (targetKing < 0 || summary.nonKingMaterial[opponent] > 0) continue;
    score +=
      distanceFromCenter(targetKing) +
      (8 - escapeSquareCount(board, targetKing, opponent, botAttacks)) +
      (BOARD_SIZE - chebyshevDistance(botKing, targetKing));
  }
  return score;
}

/**
 * Full v2 positional eval: a weighted sum of several factors folded to a single
 * scalar from `botColor`'s perspective (required by the paranoid search backup).
 *
 * Decisive outcomes short-circuit the weighted terms entirely (see WIN_SCORE
 * and PLACEMENT_CREDIT above); everything below them is the ordinary positional
 * judgement of a live position.
 * Mobility/threat terms deliberately use cheap approximations
 * (pseudo-legal move counts, precomputed attack maps rather than per-piece
 * legality simulation), since this runs at every leaf node of the search.
 */
export function evaluateFull(
  state: GameState,
  botColor: PlayerColor,
  weights: EvalWeights = FULL_EVAL_WEIGHTS
): number {
  if (state.result?.reason === "abort") return 0;
  // Final points outrank player status: an eliminated player can still win.
  if (state.result) {
    if (state.result.winner === botColor) return WIN_SCORE;
    const rank=state.result.placements.find(p=>p.color===botColor)!.meanRank;
    return -WIN_SCORE+(ALL_COLORS.length-rank)*PLACEMENT_CREDIT;
  }

  const opponents = activeOpponentsOf(state, botColor);

  // One sweep per color up front, instead of an isSquareAttacked scan per piece
  // per opponent: the threat term alone used to re-walk the whole board ~100
  // times for a single leaf evaluation.
  const botAttacks = attackMap(state.board, botColor,piece=>isLivePiece(state,piece));
  const opponentAttacks = opponents.map((opp) => attackMap(state.board, opp,piece=>isLivePiece(state,piece)));

  let material = 0;
  let centerControl = 0;
  let threatBalance = 0;
  let pawnAdvancement = 0;
  const summary: BoardSummary = {
    kingSquare: new Int32Array(ALL_COLORS.length).fill(-1),
    nonKingMaterial: new Int32Array(ALL_COLORS.length),
  };

  for (let square = 0; square < state.board.length; square++) {
    const piece = state.board[square];
    if (piece === null || !isLivePiece(state,piece)) continue;
    const value = MATERIAL_VALUES[piece.type];
    const isBot = piece.owner === botColor;
    material += isBot ? value : -value;

    if (isCenterSquare(square)) centerControl += isBot ? 1 : -1;

    if (piece.type === PieceType.King) summary.kingSquare[piece.owner] = square;
    else summary.nonKingMaterial[piece.owner] += value;

    if (piece.type === PieceType.Pawn) {
      const [, localRank] = boardToLocal(piece.owner, fileOf(square), rankOf(square));
      pawnAdvancement += isBot ? localRank : -localRank;
    }

    if (piece.type !== PieceType.King) {
      if (isBot) {
        // Bot material currently hanging to any active opponent.
        if (opponentAttacks.some((attacks) => attacks[square] === 1)) {
          threatBalance -= value;
        }
      } else if (state.players[piece.owner].status === "active" && botAttacks[square] === 1) {
        // Opponent material currently hanging to the bot.
        threatBalance += value;
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
  const eliminatedOpponents = 3 - opponents.length;

  const positional =
    material * weights.material +
    centerControl * weights.centerControl +
    mobility * weights.mobility +
    threatBalance * weights.threatBalance +
    kingSafety * weights.kingSafety +
    pawnAdvancement * weights.pawnAdvancement +
    eliminatedOpponents * weights.eliminationBonus +
    kingHuntScore(state.board, botColor, opponents, summary, botAttacks) * weights.kingHunt;

  const rivals=ALL_COLORS.filter(color=>color!==botColor);
  const pointLead=state.players[botColor].score-Math.max(...rivals.map(color=>state.players[color].score));
  // Scores persist after elimination. They are the result objective; material
  // and king safety estimate the ability to earn further points.
  return pointLead*10+positional;
}
