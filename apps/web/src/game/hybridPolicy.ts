import type { CpuLevel } from "@li4chess/bot";
// Resource tiers, not calibrated ratings. Levels 1–5 retain their original budgets.
export const HYBRID_POLICIES = {
  1: { nodeBudget: 1_000, maxDepth: 2 },
  2: { nodeBudget: 5_000, maxDepth: 3 },
  3: { nodeBudget: 20_000, maxDepth: 8 },
  4: { nodeBudget: 40_000, maxDepth: 10 },
  5: { nodeBudget: 80_000, maxDepth: 12 },
  6: { nodeBudget: 160_000, maxDepth: 14 },
  7: { nodeBudget: 320_000, maxDepth: 16 },
  8: { nodeBudget: 500_000, maxDepth: 18 },
  9: { nodeBudget: 800_000, maxDepth: 20 },
  10: { nodeBudget: 1_200_000, maxDepth: 24 },
} satisfies Record<CpuLevel, { nodeBudget: number; maxDepth: number }>;
