import type { CpuLevel } from "@li4chess/bot";
// Initial browser resource tiers, not calibrated ratings. Level 3 retains the arena node budget.
export const HYBRID_POLICIES = {
  1: { nodeBudget: 1_000, maxDepth: 2 },
  2: { nodeBudget: 5_000, maxDepth: 3 },
  3: { nodeBudget: 20_000, maxDepth: 8 },
  4: { nodeBudget: 40_000, maxDepth: 10 },
  5: { nodeBudget: 80_000, maxDepth: 12 },
} satisfies Record<CpuLevel, { nodeBudget: number; maxDepth: number }>;
