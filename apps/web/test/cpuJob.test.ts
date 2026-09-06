import { expect, it, vi } from "vitest";
import { createInitialState, legalMoves } from "@li4chess/engine";
import { serializeGameState, sha256 } from "@li4chess/protocol";
import { runCpuJob } from "../src/game/cpuJob.js";
import type { CpuRequest } from "../src/game/cpuContract.js";

async function request(): Promise<CpuRequest> {
  const stateJson = serializeGameState(createInitialState({ isCPU: { 0: true, 1: false, 2: false, 3: false } }));
  return { type: "search", version: 1, requestId: "r", gameId: "g", stateId: await sha256(stateJson), stateJson, seat: 0,
    difficulty: 1, budget: { maxDepth: 1, nodeBudget: 0, timeMs: null } };
}
it("validates state-v2 and returns an identified legal intention with diagnostics", async () => {
  const input = await request(), started = vi.fn();
  const result = await runCpuJob(input, started);
  expect(started).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ requestId: "r", gameId: "g", stateId: input.stateId, seat: 0, diagnostics: { nodes: 0, fallback: true } });
  expect(legalMoves(createInitialState()).some(m => m.from === result.move.from && m.to === result.move.to)).toBe(true);
});
it("rejects malformed requests, budget, hash, state, and unauthorized seat before searching", async () => {
  const input = await request(), started = vi.fn();
  const invalidState = "{}";
  for (const value of [null, {}, { ...input, budget: { ...input.budget, nodeBudget: Infinity } },
    { ...input, stateId: `sha256:${"0".repeat(64)}` }, { ...input, seat: 1 },
    { ...input, stateJson: invalidState, stateId: await sha256(invalidState) }]) {
    await expect(runCpuJob(value, started)).rejects.toThrow();
  }
  const human = serializeGameState(createInitialState());
  await expect(runCpuJob({ ...input, stateJson: human, stateId: await sha256(human) }, started)).rejects.toThrow("seat");
  expect(started).not.toHaveBeenCalled();
});
