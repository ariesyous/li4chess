import { assertLocalMigrationState, legalMoves } from "@li4chess/engine";
import type { GameState, Move } from "@li4chess/engine";
import { serializeGameState, sha256 } from "@li4chess/protocol";
import { matchCandidate, packResearchState, researchCapability, TETRARCH_REVISION } from "./index.js";

export interface AdvisoryBudget { nodeBudget: number; maxDepth: number; timeMs?: number }
export interface AdvisoryResult {
  best?: number; nodes: number; depth: number; elapsedMs: number;
  nnueLoaded: boolean; score: number | null; pv: number[];
}
export interface AdvisoryRequest {
  stateId: string; squares: Uint8Array; meta: Int32Array; budget: AdvisoryBudget;
}
export interface AdvisorySearch {
  prepare?(): Promise<void>;
  search(request: AdvisoryRequest, signal?: AbortSignal): Promise<AdvisoryResult>;
}
export type NativeSearch = (state: GameState) => { move: Move; stats?: Record<string, unknown> };

export const HYBRID_MODEL_LIMITATIONS = [
  "descendant-active-king-captures", "descendant-en-passant-differences", "score-attribution",
  "survival-terminal-utility", "prior-repetition-history-not-transferred", "draw-and-claim-horizon",
] as const;

/** Experiment routing, not certification of the external search model. */
export function hybridCapability(state: GameState) {
  const reasons = researchCapability(state);
  return { canAdvise: reasons.length === 0, reasons, modelLimitations: HYBRID_MODEL_LIMITATIONS };
}
export function abortError(): Error { return Object.assign(new Error("Search cancelled"), { name: "AbortError" }); }
function checkAbort(signal?: AbortSignal): void { if (signal?.aborted) throw abortError(); }

/** Only this parent-side boundary chooses a canonical move. The adviser gets no GameState. */
export async function chooseHybrid(state: GameState, external: AdvisorySearch, native: NativeSearch,
  budget: AdvisoryBudget, signal?: AbortSignal) {
  checkAbort(signal);
  assertLocalMigrationState(state);
  const snapshot = structuredClone(state);
  if (snapshot.result || snapshot.players[snapshot.turn].status !== "active") throw new Error("No ordinary bot turn");
  const legal = legalMoves(snapshot);
  if (!legal.length) throw new Error("No legal bot move");
  const capability = hybridCapability(snapshot);
  const stateId = await sha256(serializeGameState(snapshot));
  checkAbort(signal);
  const started = performance.now();
  let fallbackReason: string | undefined;
  let externalResult: AdvisoryResult | undefined;
  let rejection: unknown;
  if (!capability.canAdvise) fallbackReason = "unsupported-state";
  else {
    try {
      const packed = packResearchState(snapshot);
      externalResult = await external.search({ ...packed, stateId, budget }, signal);
      checkAbort(signal);
      if (!externalResult.nnueLoaded) throw new Error("nnue-not-loaded");
      const matched = matchCandidate(snapshot, externalResult.best!);
      if (matched.move) return {
        move: matched.move,
        stats: { engineUsed: "tetrarch-v8", revision: TETRARCH_REVISION, stateId,
          fallback: false, capability, external: externalResult,
          nodes: externalResult.nodes, depthReached: externalResult.depth, elapsedMs: performance.now() - started },
      };
      fallbackReason = "illegal-external-move"; rejection = matched.diagnostic;
    } catch (error) {
      checkAbort(signal);
      if (error instanceof Error && error.name === "AbortError") throw error;
      fallbackReason = error instanceof Error ? error.message : "external-error";
    }
  }
  checkAbort(signal);
  const fallback = native(structuredClone(snapshot));
  checkAbort(signal);
  const matched = legal.find(m => m.from === fallback.move.from && m.to === fallback.move.to && m.promotion === fallback.move.promotion);
  if (!matched) throw new Error("Native fallback returned an illegal move");
  return {
    move: matched,
    stats: { engineUsed: "production-bounded", revision: TETRARCH_REVISION, stateId,
      fallback: true, fallbackReason, capability, external: externalResult, rejection,
      native: fallback.stats, elapsedMs: performance.now() - started },
  };
}
