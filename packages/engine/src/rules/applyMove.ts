import { assertLocalMigrationState } from "../stateFormat.js";
import {
  ALL_COLORS,
  GameState,
  Move,
  PlayerColor,
  PlayerState,
  nextColor,
} from "../types.js";
import { applyMoveToBoard } from "./boardOps.js";
import {
  computeDrawResult,
  recomputeCastlingRights,
} from "./elimination.js";
import { positionKey, REPETITION_DRAW_COUNT } from "./repetition.js";
import { awardPoints, captureValue, multiCheckPoints } from "./scoring.js";
import { enPassantRightsAfterMove } from "./enPassant.js";
import { resolveScheduledTurns } from "./turn.js";
import { updateNoMoveCauses } from "./causation.js";

/**
 * Applies a legal move to produce the next GameState: moves/captures/promotes/
 * castles on the board, updates scoring/castling-rights/en-passant, then
 * advances the turn — cascading through any players who turn out to have no
 * legal moves (checkmate or stalemate: retain their whole army as passive
 * obstacles) until an active player with a move is found or the game ends.
 */
export function applyMove(state: GameState, move: Move): GameState {
  assertLocalMigrationState(state);
  if (state.result) throw new Error("Cannot move in a finished game");
  const board = applyMoveToBoard(state.board, move);

  const players: Record<PlayerColor, PlayerState> = { ...state.players };

  const castlingRights = { ...state.castlingRights };
  for (const color of ALL_COLORS) {
    castlingRights[color] = recomputeCastlingRights(board, color, state.castlingRights[color], players[color].status);
  }

  const enPassantRights = enPassantRightsAfterMove(state, board, move);
  const turnNumber = state.turnNumber + 1;

  let working: GameState = {
    ...state,
    completedMoves: { ...state.completedMoves,[move.piece.owner]:state.completedMoves[move.piece.owner]+1 },
    eventSequence: state.eventSequence + 1,
    awardLedger: state.awardLedger,
    rulesetId: null,
    board,
    players,
    turn: state.turn,
    turnNumber,
    castlingRights,
    enPassantRights,
    moveHistory: state.moveHistory,
    result: null,
    positionCounts: state.positionCounts,
  };

  const causeSequence = working.eventSequence;
  working = updateNoMoveCauses(state,working,move.piece.owner,causeSequence);
  if (state.players[move.piece.owner].status === "active" && move.captured && state.players[move.captured.owner].status === "active") {
    working = awardPoints(working,"capture",move.piece.owner,captureValue(move.captured),causeSequence);
  }
  if (state.players[move.piece.owner].status === "active") working = awardPoints(working,"multi-check",move.piece.owner,multiCheckPoints(state,working,move),causeSequence);

  const resolved = resolveScheduledTurns(working,nextColor(move.piece.owner),causeSequence);
  working = resolved.state;

  // Threefold repetition: the same position (board + turn + castling rights +
  // en passant rights + player statuses) recurring 3 times draws the game,
  // even if the elimination check above didn't already end it.
  const key = positionKey(working);
  const count = (working.positionCounts[key] ?? 0) + 1;
  working = { ...working, positionCounts: { ...working.positionCounts, [key]: count } };
  if (working.result === null && count >= REPETITION_DRAW_COUNT) {
    working = { ...working, result: computeDrawResult(working.players) };
  }

  const recordedMove: Move = { ...move, eliminates: resolved.eliminated };
  working = { ...working, moveHistory: [...state.moveHistory, recordedMove] };

  return working;
}
