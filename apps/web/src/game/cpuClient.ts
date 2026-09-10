import { sameIdentity, validResponse, validStarted } from "./cpuContract.js";
import type { CpuRequest, CpuResponse } from "./cpuContract.js";
import { HYBRID_POLICIES } from "./hybridPolicy.js";

export type CpuFailure = "initialization" | "crash" | "message" | "malformed" | "watchdog";
export interface WorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent<unknown>) => void) | null;
  postMessage: (request: CpuRequest) => void;
  terminate: () => void;
}
export type WorkerFactory = () => WorkerPort;

/** One request, one completion, one Worker lifetime. Cancellation never recovers. */
export function requestCpu(request: CpuRequest, complete: (result: CpuResponse | null, failure?: CpuFailure) => void,
  factory: WorkerFactory = () => new Worker(new URL("./cpu.worker.ts", import.meta.url), { type: "module" }),
  watchdogMs = (request.budget.timeMs ?? 1000) + 2000,
  started: () => void = () => {}): () => void {
  let worker: WorkerPort | undefined;
  let settled = false;
  let didStart = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    if (settled) return;
    settled = true; clearTimeout(timer);
    if (worker) { worker.onmessage = null; worker.onerror = null; worker.onmessageerror = null; worker.terminate(); }
  };
  const finish = (result: CpuResponse | null, failure?: CpuFailure) => {
    if (settled) return;
    cancel(); complete(result, failure);
  };
  try {
    worker = factory();
    worker.onmessage = event => {
      if (settled) return;
      if (validStarted(event.data)) {
        if (!didStart && sameIdentity(request, event.data)) { didStart = true; started(); }
        return;
      }
      if (!validResponse(event.data)) { finish(null, "malformed"); return; }
      // Wrong identity is stale work, not authority to advance this position.
      if (!sameIdentity(request, event.data)) return;
      const tetrarch = event.data.diagnostics.engine === "tetrarch";
      const limits = tetrarch ? HYBRID_POLICIES[request.difficulty] : request.budget;
      if (tetrarch && request.engine === "native" || event.data.diagnostics.nodes > limits.nodeBudget || event.data.diagnostics.completedDepth > limits.maxDepth) {
        finish(null, "malformed"); return;
      }
      finish(event.data);
    };
    worker.onerror = event => { event.preventDefault(); finish(null, "crash"); };
    worker.onmessageerror = () => finish(null, "message");
    timer = setTimeout(() => finish(null, "watchdog"), watchdogMs);
    worker.postMessage(request);
  } catch { finish(null, "initialization"); }
  return cancel;
}

/** Hybrid is the default. Retry a failed worker with isolated native search; cancellation never retries. */
export function requestHybridCpu(request: CpuRequest, complete: (result: CpuResponse | null, failure?: CpuFailure) => void,
  factory?: WorkerFactory, watchdogMs = (request.budget.timeMs ?? 1000) + 5000,
  started: () => void = () => {},
  nativeFactory: WorkerFactory = () => new Worker(new URL("./cpu.native.worker.ts", import.meta.url), { type: "module" })): () => void {
  let cancelled = false;
  const stops: (()=>void)[] = [];
  stops.push(requestCpu(request, (result, failure) => {
    if (cancelled) return;
    if (result) { complete(result); return; }
    stops.push(requestCpu({ ...request, engine: "native" }, (recovered, nativeFailure) => {
      if (cancelled) return;
      if (recovered) recovered = { ...recovered, diagnostics: { ...recovered.diagnostics,
        engine: "native", fallbackReason: `worker-${failure}` } };
      complete(recovered, recovered ? undefined : nativeFailure);
    }, nativeFactory));
  }, factory, watchdogMs, started));
  return () => { cancelled = true; for (const stop of stops) stop(); };
}
