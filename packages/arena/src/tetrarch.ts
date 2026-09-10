import { chooseBoundedCpuMove, CPU_POLICIES } from "@li4chess/bot";
import { chooseHybrid, HYBRID_MODEL_LIMITATIONS } from "@li4chess/tetrarch-engine/hybrid";
import { NodeAdvisoryClient } from "@li4chess/tetrarch-engine/node";
import { TETRARCH_REVISION } from "@li4chess/tetrarch-engine";
import type { ArenaEngine } from "./index.js";

export function boundedProduction(): ArenaEngine {
  return {
    id: "production-bounded-level3", config: CPU_POLICIES[3],
    choose(state, random) {
      const { move, diagnostics } = chooseBoundedCpuMove(state, 3, CPU_POLICIES[3], random);
      return { move, stats: { ...diagnostics, depthReached: diagnostics.completedDepth } };
    },
  };
}

/** Opt-in research only. Assets load lazily; callers must close the worker. */
export function tetrarchHybrid(): ArenaEngine & { close(): void } {
  const client = new NodeAdvisoryClient();
  const native = boundedProduction();
  const budget = { nodeBudget: 20_000, maxDepth: 32 };
  return {
    id: "tetrarch-v8-hybrid-20k",
    config: { revision: TETRARCH_REVISION, budget, watchdogMs: 30_000,
      fallback: native.config, modelLimitations: HYBRID_MODEL_LIMITATIONS },
    choose: (state, random) => chooseHybrid(state, client, s => {
      const { move, diagnostics } = chooseBoundedCpuMove(s, 3, CPU_POLICIES[3], random);
      return { move, stats: { ...diagnostics, depthReached: diagnostics.completedDepth } };
    }, budget),
    close: () => client.close(),
  };
}
