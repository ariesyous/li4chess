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
import { isPlayerInCheck } from "./check.js";
import {
  computeDrawResult,
  computeGameResult,
  countActive,
  recomputeCastlingRights,
  removeAllPiecesOf,
} from "./elimination.js";
import { hasLegalMove } from "./legality.js";
import { positionKey, REPETITION_DRAW_COUNT } from "./repetition.js";
import { PIECE_VALUES } from "./scoring.js";
import { enPassantRightsAfterMove, remainingEnPassantRights } from "./enPassant.js";

const MAX_ROTATION_STEPS = 4;

/**
 * Applies a legal move to produce the next GameState: moves/captures/promotes/
 * castles on the board, updates scoring/castling-rights/en-passant, then
 * advances the turn — cascading through any players who turn out to have no
 * legal moves (checkmate: eliminate and remove their pieces; stalemate: freeze
 * them in place) until an active player with a move is found or the game ends.
 */
export function applyMove(state: GameState, move: Move): GameState {
  assertLocalMigrationState(state);
  const board = applyMoveToBoard(state.board, move);

  const players: Record<PlayerColor, PlayerState> = { ...state.players };
  if (move.captured && state.players[move.captured.owner].status === "active") {
    const mover = players[move.piece.owner];
    players[move.piece.owner] = { ...mover, score: mover.score + PIECE_VALUES[move.captured.type] };
  }

  const castlingRights = { ...state.castlingRights };
  for (const color of ALL_COLORS) {
    castlingRights[color] = recomputeCastlingRights(board, color, state.castlingRights[color], players[color].status);
  }

  const enPassantRights = enPassantRightsAfterMove(state, board, move);
  const turnNumber = state.turnNumber + 1;

  let working: GameState = {
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

  const eliminated: PlayerColor[] = [];
  let candidate = nextColor(move.piece.owner);
  for (let step = 0; step < MAX_ROTATION_STEPS; step++) {
    if (countActive(working.players) <= 1) break;
    if (working.players[candidate].status !== "active") {
      candidate = nextColor(candidate);
      continue;
    }

    if (hasLegalMove(working, candidate)) {
      working = { ...working, turn: candidate };
      break;
    }

    const inCheck = isPlayerInCheck(working, candidate);
    const nextPlayers: Record<PlayerColor, PlayerState> = { ...working.players };
    nextPlayers[candidate] = {
      ...nextPlayers[candidate],
      status: inCheck ? "checkmated" : "stalemated",
      eliminatedOnTurn: turnNumber,
    };
    if (inCheck) eliminated.push(candidate);
    const nextBoard = inCheck ? removeAllPiecesOf(working.board, candidate) : working.board;
    working = {
      ...working,
      board: nextBoard,
      players: nextPlayers,
      castlingRights: { ...working.castlingRights, [candidate]: { kingside: false, queenside: false } },
    };
    working = { ...working, enPassantRights: remainingEnPassantRights(working) };
    candidate = nextColor(candidate);
  }

  if (countActive(working.players) <= 1) {
    working = { ...working, result: computeGameResult(working.players) };
  }

  // Threefold repetition: the same position (board + turn + castling rights +
  // en passant rights + player statuses) recurring 3 times draws the game,
  // even if the elimination check above didn't already end it.
  const key = positionKey(working);
  const count = (working.positionCounts[key] ?? 0) + 1;
  working = { ...working, positionCounts: { ...working.positionCounts, [key]: count } };
  if (working.result === null && count >= REPETITION_DRAW_COUNT) {
    working = { ...working, result: computeDrawResult(working.players) };
  }

  const recordedMove: Move = { ...move, eliminates: eliminated };
  working = { ...working, moveHistory: [...state.moveHistory, recordedMove] };

  return working;
}
