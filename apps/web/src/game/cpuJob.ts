import { chooseBoundedCpuMove } from "@li4chess/bot";
import { deserializeGameState, sha256 } from "@li4chess/protocol";
import { validRequest } from "./cpuContract.js";
import type { CpuResponse, CpuStarted } from "./cpuContract.js";

/** Validated Worker entry boundary, also exercisable without a browser. */
export async function runCpuJob(value: unknown, started: (message: CpuStarted) => void): Promise<CpuResponse> {
  if (!validRequest(value)) throw new Error("Invalid CPU request");
  const request = value;
  if (await sha256(request.stateJson) !== request.stateId) throw new Error("CPU state identity mismatch");
  const state = deserializeGameState(request.stateJson);
  if (state.turn !== request.seat || !state.players[state.turn].isCPU) throw new Error("CPU seat mismatch");
  started({ type: "started", version: 1, requestId: request.requestId, gameId: request.gameId, stateId: request.stateId, seat: request.seat });
  const result = chooseBoundedCpuMove(state, request.difficulty, request.budget);
  const response: CpuResponse = {
    type: "result", version: 1, requestId: request.requestId, gameId: request.gameId,
    stateId: request.stateId, seat: request.seat,
    move: { from: result.move.from, to: result.move.to, ...(result.move.promotion ? { promotion: result.move.promotion } : {}) },
    diagnostics: result.diagnostics,
  };
  return response;
}
