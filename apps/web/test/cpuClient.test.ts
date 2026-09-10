import { afterEach, describe, expect, it, vi } from "vitest";
import { requestCpu, requestHybridCpu } from "../src/game/cpuClient.js";
import type { WorkerPort } from "../src/game/cpuClient.js";
import type { CpuRequest, CpuResponse } from "../src/game/cpuContract.js";

const request: CpuRequest = { type: "search", version: 1, requestId: "request", gameId: "game", stateId: `sha256:${"a".repeat(64)}`, seat: 0,
  stateJson: "{}", difficulty: 1, budget: { maxDepth: 1, nodeBudget: 128, timeMs: 50 } };
const result: CpuResponse = { type: "result", version: 1, requestId: request.requestId, gameId: request.gameId, stateId: request.stateId, seat: 0,
  move: { from: 20, to: 34 }, diagnostics: { nodes: 20, completedDepth: 1, elapsedMs: 12, stopped: "depth", fallback: false } };
function port(): WorkerPort { return { onmessage: null, onerror: null, onmessageerror: null, postMessage: vi.fn(), terminate: vi.fn() }; }
const event = (data: unknown) => ({ data } as MessageEvent<unknown>);
afterEach(() => vi.useRealTimers());
describe("CPU request lifetime", () => {
  it("terminates after one response and ignores queued duplicates", () => {
    const worker = port(), done = vi.fn();
    requestCpu(request, done, () => worker);
    const receive = worker.onmessage!;
    receive(event(result)); receive(event(result));
    expect(done).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledWith(result, undefined);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("cancellation terminates busy computation and rejects an already queued response", () => {
    vi.useFakeTimers();
    const worker = port(), done = vi.fn();
    const cancel = requestCpu(request, done, () => worker);
    const receive = worker.onmessage!;
    cancel(); cancel(); receive(event(result)); vi.runAllTimers();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
  });
  it.each(["requestId", "gameId", "stateId", "seat"] as const)("rejects mismatched %s", field => {
    const worker = port(), done = vi.fn();
    const cancel = requestCpu(request, done, () => worker);
    worker.onmessage!(event({ ...result, [field]: field === "seat" ? 1 : field === "stateId" ? `sha256:${"b".repeat(64)}` : "old" }));
    expect(done).not.toHaveBeenCalled(); cancel();
  });
  it.each([null, {}, { ...result, move: { from: -1, to: 34 } }, { ...result, diagnostics: { ...result.diagnostics, nodes: 129 } }])("recovers malformed responses", data => {
    const worker = port(), done = vi.fn();
    requestCpu(request, done, () => worker);
    worker.onmessage!(event(data));
    expect(done).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledWith(null, "malformed");
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("recovers constructor and postMessage failures", () => {
    const done = vi.fn();
    requestCpu(request, done, () => { throw new Error("unavailable"); });
    expect(done).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledWith(null, "initialization");
    const worker = port(); worker.postMessage = () => { throw new Error("clone failed"); };
    const second = vi.fn(); requestCpu(request, second, () => worker);
    expect(second).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledWith(null, "initialization");
    expect(worker.terminate).toHaveBeenCalled();
  });
  it.each(["crash", "message", "watchdog"] as const)("recovers %s once", reason => {
    vi.useFakeTimers(); const worker = port(), done = vi.fn();
    requestCpu(request, done, () => worker, 10);
    if (reason === "crash") worker.onerror!({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    if (reason === "message") worker.onmessageerror!(event(null));
    vi.runAllTimers();
    expect(done).toHaveBeenCalledTimes(1); expect(done).toHaveBeenCalledWith(null, reason);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
describe("hybrid recovery",()=>{
  it("replaces a crashed adviser with native search exactly once",()=>{
    const hybrid=port(),native=port(),done=vi.fn();
    requestHybridCpu(request,done,()=>hybrid,10,()=>{},()=>native);
    hybrid.onerror!({preventDefault:vi.fn()} as unknown as ErrorEvent);
    expect(native.postMessage).toHaveBeenCalledWith({...request,engine:"native"});
    native.onmessage!(event(result));
    expect(done).toHaveBeenCalledTimes(1);
    expect(done.mock.calls[0][0].diagnostics).toMatchObject({engine:"native",fallbackReason:"worker-crash"});
  });
  it("cancels a recovery search and never retries a cancelled adviser",()=>{
    vi.useFakeTimers();const hybrid=port(),native=port(),done=vi.fn(),factory=vi.fn(()=>native);
    const cancel=requestHybridCpu(request,done,()=>hybrid,10,()=>{},factory);
    cancel();vi.runAllTimers();expect(factory).not.toHaveBeenCalled();
    const h=port();const stop=requestHybridCpu(request,done,()=>h,10,()=>{},factory);
    vi.advanceTimersByTime(11);expect(factory).toHaveBeenCalledTimes(1);
    const reply=native.onmessage!;stop();reply(event(result));vi.runAllTimers();
    expect(native.terminate).toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
  });
  it("rejects an adviser reply exceeding its tier or impersonating native recovery",()=>{
    for(const input of [request,{...request,engine:"native" as const}]){
      const worker=port(),done=vi.fn();requestCpu(input,done,()=>worker);
      worker.onmessage!(event({...result,diagnostics:{...result.diagnostics,engine:"tetrarch",nodes:1001}}));
      expect(done).toHaveBeenCalledWith(null,"malformed");
    }
  });
});
