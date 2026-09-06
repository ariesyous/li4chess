import { isSquareOnBoard } from "@li4chess/engine";
import type { GameState } from "@li4chess/engine";
import { canonicalJson, deserializeGameState, recordReplay, replayCheckpoint, serializeGameState } from "@li4chess/protocol";
import type { ActionRequest, EngineBuildIdentityV1 } from "@li4chess/protocol";

export const LOCAL_SAVE_KEY = "li4chess.local-game.v1";
export interface LocalJournal { initial: GameState; requests: ActionRequest[]; sourceReplayHash?: string }
export interface ResumedGame { state: GameState; sourceReplayHash: string }
export interface SaveStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }

function fields(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid local action.");
  const object = value as Record<string, unknown>;
  if (required.some(key => !Object.hasOwn(object, key)) || Object.keys(object).some(key => !required.includes(key) && !optional.includes(key))) {
    throw new Error("Invalid local action fields.");
  }
  return object;
}
function readRequest(value: unknown): ActionRequest {
  if (!value || typeof value !== "object") throw new Error("Invalid local action.");
  const type = (value as { type?: unknown }).type;
  const extra = type === "move" ? ["move"] : type === "timeout" ? ["clock"] : type === "disconnectForfeit" ? ["disconnect"] : [];
  const action = fields(value, ["type", "actor", ...extra]);
  if (!["move", "randomKingMove", "resign", "timeout", "disconnectForfeit", "claimWin"].includes(String(type)) ||
      !Number.isInteger(action.actor) || Number(action.actor) < 0 || Number(action.actor) > 3) throw new Error("Invalid local action type/seat.");
  if (type === "move") {
    const move = fields(action.move, ["from", "to"], ["promotion"]);
    if (![move.from, move.to].every(square => Number.isInteger(square) && isSquareOnBoard(Number(square))) ||
      (move.promotion !== undefined && move.promotion !== "Q")) throw new Error("Invalid local move intention.");
  }
  if (type === "timeout" && fields(action.clock, ["remainingMs"]).remainingMs !== 0) throw new Error("Invalid timeout fact.");
  if (type === "disconnectForfeit") {
    const fact = fields(action.disconnect, ["bankMs", "remainingMs", "cumulativeDisconnectedMs"]);
    if (fact.bankMs !== 60000 || fact.remainingMs !== 0 || !Number.isSafeInteger(fact.cumulativeDisconnectedMs) || Number(fact.cumulativeDisconnectedMs) < 60000) {
      throw new Error("Invalid disconnect fact.");
    }
  }
  return action as unknown as ActionRequest;
}

/** Atomic synchronous persistence closes the move/refresh race. The initial
 * state is state-v2, not a second engine shape; requests are replay intentions. */
export function saveLocalGame(storage: SaveStorage, journal: LocalJournal, producer: EngineBuildIdentityV1): void {
  storage.setItem(LOCAL_SAVE_KEY, canonicalJson({ format: "li4chess-local-journal-v1",
    initialState: JSON.parse(serializeGameState(journal.initial)), requests: journal.requests.map(request => {
      // The engine regenerates piece/capture/check metadata on recovery.
      if (request.type !== "move") return request;
      const { from, to, promotion } = request.move;
      return { type: "move", actor: request.actor, move: { from, to, ...(promotion ? { promotion } : {}) } };
    }),
    producer, ...(journal.sourceReplayHash ? { sourceReplayHash: journal.sourceReplayHash } : {}) }));
}

/** Nothing mounts or schedules CPU work before both existing M1 readers pass.
 * Reconstruct effects and random actions, then checkpoint under the current build
 * with a content link to the saved producer's validated replay. */
export async function resumeLocalGame(storage: SaveStorage): Promise<ResumedGame> {
  const text = storage.getItem(LOCAL_SAVE_KEY);
  if (text === null) throw new Error("No saved game on this browser.");
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid local save.");
  const saved = value as Record<string, unknown>;
  const keys = Object.keys(saved);
  if (saved.format !== "li4chess-local-journal-v1" || !Array.isArray(saved.requests) ||
      keys.some(key => !["format", "initialState", "requests", "producer", "sourceReplayHash"].includes(key)) ||
      (saved.sourceReplayHash !== undefined && typeof saved.sourceReplayHash !== "string")) throw new Error("Invalid or incompatible local save.");
  const initial = deserializeGameState(JSON.stringify(saved.initialState));
  const replay = await recordReplay(initial, saved.requests.map(readRequest), saved.producer as EngineBuildIdentityV1,
    saved.sourceReplayHash as string | undefined);
  return replayCheckpoint(replay);
}
