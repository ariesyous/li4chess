import { expect, it, vi } from "vitest";
import { createInitialState, legalMoves } from "@li4chess/engine";
import { serializeGameState, sha256 } from "@li4chess/protocol";
import { runCpuJob } from "../src/game/cpuJob.js";
import type { CpuRequest } from "../src/game/cpuContract.js";
import { toMailbox } from "@li4chess/tetrarch-engine";
import { CPU_POLICIES } from "@li4chess/bot";
import { HYBRID_POLICIES } from "../src/game/hybridPolicy.js";

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
it("uses the adviser by default, rejects its illegal move, and honors native recovery requests", async () => {
  const input = await request(), move = legalMoves(createInitialState())[0];
  const search = vi.fn(async () => ({ best: toMailbox(move.from) | (toMailbox(move.to)<<8),
    nodes: 1000, depth: 2, elapsedMs: 5, nnueLoaded: true, score: 0, pv: [] }));
  expect((await runCpuJob(input,()=>{}, {search})).diagnostics).toMatchObject({engine:"tetrarch",nodes:1000,completedDepth:2});
  search.mockResolvedValueOnce({best:0,nodes:1000,depth:2,elapsedMs:5,nnueLoaded:true,score:0,pv:[]});
  expect((await runCpuJob(input,()=>{}, {search})).diagnostics).toMatchObject({engine:"native",fallbackReason:"illegal-external-move"});
  await runCpuJob({...input,engine:"native"},()=>{}, {search});
  expect(search).toHaveBeenCalledTimes(2);
});
it("rejects malformed requests, budget, hash, state, and unauthorized seat before searching", async () => {
  const input = await request(), started = vi.fn();
  const invalidState = "{}";
  for (const value of [null, {}, { ...input, difficulty: 11 }, { ...input, difficulty: 1.5 }, { ...input, budget: { ...input.budget, nodeBudget: Infinity } },
    { ...input, stateId: `sha256:${"0".repeat(64)}` }, { ...input, seat: 1 },
    { ...input, stateJson: invalidState, stateId: await sha256(invalidState) }]) {
    await expect(runCpuJob(value, started)).rejects.toThrow();
  }
  const human = serializeGameState(createInitialState());
  await expect(runCpuJob({ ...input, stateJson: human, stateId: await sha256(human) }, started)).rejects.toThrow("seat");
  expect(started).not.toHaveBeenCalled();
});
it("routes level 10 with its larger adviser budget", async () => {
  const input = { ...await request(), difficulty: 10 as const, budget: CPU_POLICIES[10] };
  const move = legalMoves(createInitialState())[0];
  const search = vi.fn(async (..._args: unknown[]) => ({ best: toMailbox(move.from) | (toMailbox(move.to) << 8),
    nodes: 100000, depth: 14, elapsedMs: 5, nnueLoaded: true, score: 0, pv: [] }));
  expect((await runCpuJob(input, () => {}, { search })).diagnostics).toMatchObject({ engine: "tetrarch", nodes: 100000, completedDepth: 14 });
  expect(search).toHaveBeenCalledWith(expect.objectContaining({ budget: { ...HYBRID_POLICIES[10], timeMs: 9750 } }), undefined);
});
it("does not grant a fresh native allowance after the adviser exhausts the search time", async () => {
  const input = { ...await request(), difficulty: 10 as const, budget: CPU_POLICIES[10] };
  let clock = 0;
  const now = vi.spyOn(performance, "now").mockImplementation(() => clock);
  try {
    const search = vi.fn(async () => {
      clock = 10000;
      return { best: 0, nodes: 100, depth: 1, elapsedMs: 10000, nnueLoaded: true, score: 0, pv: [] };
    });
    const result = await runCpuJob(input, () => {}, { search });
    expect(result.diagnostics).toMatchObject({ engine: "native", nodes: 0, completedDepth: 0, stopped: "time", fallbackReason: "illegal-external-move" });
    expect(legalMoves(createInitialState()).some(move => move.from === result.move.from && move.to === result.move.to)).toBe(true);
  } finally { now.mockRestore(); }
});
