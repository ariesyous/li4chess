import { chooseBoundedCpuMove } from "@li4chess/bot";
import { deserializeGameState, sha256 } from "@li4chess/protocol";
import { validRequest } from "./cpuContract.js";
import type { CpuResponse, CpuStarted } from "./cpuContract.js";
import { chooseHybrid, hybridCapability } from "@li4chess/tetrarch-engine/hybrid";
import type { AdvisorySearch } from "@li4chess/tetrarch-engine/hybrid";
import { HYBRID_POLICIES } from "./hybridPolicy.js";

/** Validated Worker entry boundary, also exercisable without a browser. */
export async function runCpuJob(value: unknown, started: (message: CpuStarted) => void, adviser?: AdvisorySearch): Promise<CpuResponse> {
  if (!validRequest(value)) throw new Error("Invalid CPU request");
  const request = value;
  if (await sha256(request.stateJson) !== request.stateId) throw new Error("CPU state identity mismatch");
  const state = deserializeGameState(request.stateJson);
  if (state.turn !== request.seat || !state.players[state.turn].isCPU) throw new Error("CPU seat mismatch");
  if (adviser && request.engine !== "native" && hybridCapability(state).canAdvise) {
    // Loading is covered by the host watchdog. Search-start means assets are ready,
    // or initialization failed and the native fallback is about to run.
    try { await adviser.prepare?.(); } catch { /* chooseHybrid records the failed load and selects native search. */ }
  }
  started({ type: "started", version: 1, requestId: request.requestId, gameId: request.gameId, stateId: request.stateId, seat: request.seat });
  const native = (s: typeof state) => chooseBoundedCpuMove(s, request.difficulty, request.budget);
  let result: { move: ReturnType<typeof native>["move"]; diagnostics: CpuResponse["diagnostics"] };
  if (adviser && request.engine !== "native") {
    const policy = HYBRID_POLICIES[request.difficulty];
    let fallback: ReturnType<typeof native> | undefined;
    const chosen = await chooseHybrid(state, adviser, s => {
      fallback = native(s); return { move: fallback.move, stats: { ...fallback.diagnostics } };
    }, { ...policy, ...(request.budget.timeMs ? { timeMs: request.budget.timeMs } : {}) });
    const external = chosen.stats.external;
    result = { move: chosen.move, diagnostics: chosen.stats.fallback
      ? { ...fallback!.diagnostics, engine: "native", fallbackReason: chosen.stats.fallbackReason }
      : { engine: "tetrarch", nodes: external!.nodes, completedDepth: external!.depth,
          elapsedMs: chosen.stats.elapsedMs, stopped: external!.nodes >= policy.nodeBudget ? "nodes" : external!.depth >= policy.maxDepth ? "depth" : "time", fallback: false } };
  } else {
    const reply = native(state); result = { ...reply, diagnostics: { ...reply.diagnostics, engine: "native" } };
  }
  const response: CpuResponse = {
    type: "result", version: 1, requestId: request.requestId, gameId: request.gameId,
    stateId: request.stateId, seat: request.seat,
    move: { from: result.move.from, to: result.move.to, ...(result.move.promotion ? { promotion: result.move.promotion } : {}) },
    diagnostics: result.diagnostics,
  };
  return response;
}
