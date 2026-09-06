import type { Page } from "@playwright/test";
import type { CpuRequest, CpuResponse } from "../src/game/cpuContract.js";

export interface Observation { url: string; created: number; posted?: number; started?: number; ended?: number; terminated?: number; request?: CpuRequest; response?: CpuResponse; error?: string }
export interface InputSample { requestId: string; milliseconds: number }
declare global { interface Window { m2: { jobs: Observation[]; inputs: InputSample[] } } }

/** Observe actual app-created Workers; preserve every native request and reply. */
export async function observeProduction(page: Page) {
  await page.addInitScript(() => {
    window.m2 = { jobs: [], inputs: [] };
    const Native = window.Worker;
    window.Worker = class extends Native {
      observation: Observation;
      constructor(url: string | URL, options?: WorkerOptions) {
        const created = performance.now(); super(url, options);
        this.observation = { url: String(url), created }; window.m2.jobs.push(this.observation);
        this.addEventListener("message", event => {
          if (event.data?.type === "started") this.observation.started = performance.now();
          if (event.data?.type === "result") { this.observation.ended = performance.now(); this.observation.response = event.data; }
        });
        this.addEventListener("error", event => { this.observation.error = event.message; });
        this.addEventListener("messageerror", () => { this.observation.error = "messageerror"; });
      }
      override postMessage(message: unknown, options: Transferable[] | StructuredSerializeOptions = []) {
        this.observation.posted = performance.now(); this.observation.request = message as CpuRequest;
        if (Array.isArray(options)) super.postMessage(message, options); else super.postMessage(message, options);
      }
      override terminate() { this.observation.terminated = performance.now(); super.terminate(); }
    };
    document.addEventListener("input", event => {
      if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") return;
      const job = window.m2.jobs.at(-1);
      if (!job?.started || job.ended || job.terminated || !job.request) return;
      const requestId = job.request.requestId, start = event.timeStamp;
      requestAnimationFrame(() => window.m2.inputs.push({ requestId, milliseconds: performance.now() - start }));
    }, true);
  });
}
