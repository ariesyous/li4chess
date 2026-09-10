import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { abortError } from "./hybrid.js";
import type { AdvisoryRequest, AdvisoryResult, AdvisorySearch } from "./hybrid.js";

export interface WorkerPort {
  on(event: "message", listener: (message: unknown) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
  on(event: "exit", listener: (code: number) => void): unknown;
  postMessage(value: unknown): void;
  terminate(): unknown;
}
function validResult(value: unknown, request: AdvisoryRequest): value is AdvisoryResult {
  if (!value || typeof value !== "object") return false;
  const r = value as AdvisoryResult;
  return Number.isSafeInteger(r.nodes) && r.nodes >= 0 && r.nodes <= request.budget.nodeBudget &&
    Number.isInteger(r.depth) && r.depth >= 0 && r.depth <= request.budget.maxDepth &&
    Number.isFinite(r.elapsedMs) && r.elapsedMs >= 0 && typeof r.nnueLoaded === "boolean" &&
    (r.best === undefined || Number.isInteger(r.best) && r.best >= 0 && r.best <= 0x7fffff) &&
    (r.score === null || Number.isFinite(r.score)) && Array.isArray(r.pv) && r.pv.length <= 32 &&
    r.pv.every(m => Number.isInteger(m) && m >= 0 && m <= 0x7fffff);
}

/** Lazy reusable Node Worker. One outstanding request; cancel/crash/watchdog replaces the instance. */
export class NodeAdvisoryClient implements AdvisorySearch {
  private worker?: WorkerPort;
  private sequence = 0;
  private pending?: { id: number; stateId: string; request: AdvisoryRequest; finish: (result?: AdvisoryResult, error?: Error) => void };
  constructor(private readonly watchdogMs = 30_000,
    private readonly factory: () => WorkerPort = () => new Worker(fileURLToPath(new URL("../scripts/node-worker.mjs", import.meta.url)))) {
    if (!Number.isFinite(watchdogMs) || watchdogMs <= 0) throw new Error("Invalid watchdog");
  }
  private reset(): void {
    const worker = this.worker; this.worker = undefined;
    if (worker) void worker.terminate();
  }
  close(): void {
    const pending = this.pending; this.reset();
    pending?.finish(undefined, abortError());
  }
  search(request: AdvisoryRequest, signal?: AbortSignal): Promise<AdvisoryResult> {
    if (signal?.aborted) return Promise.reject(abortError());
    if (this.pending) return Promise.reject(new Error("worker-busy"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const cancel = () => { this.reset(); finish(undefined, abortError()); };
      const timer = setTimeout(() => { this.reset(); finish(undefined, new Error("worker-watchdog")); }, this.watchdogMs);
      const finish = (result?: AdvisoryResult, error?: Error) => {
        if (this.pending?.id !== id) return;
        this.pending = undefined;
        clearTimeout(timer); signal?.removeEventListener("abort", cancel);
        if (error) reject(error); else resolve(result!);
      };
      this.pending = { id, stateId: request.stateId, request, finish };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        if (!this.worker) {
          const worker = this.factory(); this.worker = worker;
          worker.on("message", message => {
            if (this.worker !== worker || !this.pending) return;
            const response = message as { id?: unknown; stateId?: unknown; result?: unknown; error?: unknown } | null;
            if (!response || typeof response !== "object") {
              const active = this.pending; this.reset(); active.finish(undefined,new Error("worker-malformed")); return;
            }
            if (response.id !== this.pending.id || response.stateId !== this.pending.stateId) return;
            const active = this.pending;
            if (response.error !== undefined) {
              this.reset(); active.finish(undefined,new Error("worker-initialization-or-search")); return;
            }
            if (!validResult(response.result, active.request)) {
              this.reset(); active.finish(undefined,new Error("worker-malformed")); return;
            }
            active.finish(response.result);
          });
          worker.on("error", () => {
            if (this.worker !== worker) return;
            const active = this.pending; this.reset(); active?.finish(undefined,new Error("worker-crash"));
          });
          worker.on("exit", () => {
            if (this.worker !== worker) return;
            this.worker = undefined; this.pending?.finish(undefined,new Error("worker-exit"));
          });
        }
        this.worker.postMessage({ id, ...request });
      } catch {
        this.reset(); finish(undefined, new Error("worker-initialization"));
      }
    });
  }
}
