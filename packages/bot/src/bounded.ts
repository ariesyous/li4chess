import { applyMove, legalMoves, positionKey } from "@li4chess/engine";
import type { GameState, Move } from "@li4chess/engine";
import { DIFFICULTY_PRESETS } from "./difficulty.js";
import { evaluateFull } from "./evaluate.js";
import { scoreMovesExactly } from "./search.js";

export type CpuLevel = 1 | 2 | 3 | 4 | 5;
export interface CpuBudget { maxDepth: number; nodeBudget: number; timeMs: number | null }
export const CPU_POLICIES: Readonly<Record<CpuLevel, Readonly<CpuBudget & { label: string }>>> = {
  1: { label: "Beginner", maxDepth: 1, nodeBudget: 128, timeMs: 50 },
  2: { label: "Casual", maxDepth: 2, nodeBudget: 512, timeMs: 100 },
  3: { label: "Thoughtful", maxDepth: 3, nodeBudget: 2048, timeMs: 250 },
  4: { label: "Challenging", maxDepth: 4, nodeBudget: 8192, timeMs: 500 },
  5: { label: "Patient", maxDepth: 5, nodeBudget: 32768, timeMs: 1000 },
};
export interface CpuDiagnostics {
  nodes: number; completedDepth: number; elapsedMs: number;
  stopped: "depth" | "nodes" | "time"; fallback: boolean;
}

export function validateCpuBudget(value: CpuBudget): void {
  if (!value || !Number.isInteger(value.maxDepth) || value.maxDepth < 1 || value.maxDepth > 5 ||
      !Number.isInteger(value.nodeBudget) || value.nodeBudget < 0 || value.nodeBudget > 32768 ||
      (value.timeMs !== null && (!Number.isFinite(value.timeMs) || value.timeMs < 0 || value.timeMs > 1000))) {
    throw new Error("Invalid CPU budget");
  }
}

/** Production evaluation, exact root scores and one budget for all search work.
 * Individual engine operations are indivisible; the host must enforce a watchdog.
 * Node-only mode is deterministic when supplied the same random function. */
export function chooseBoundedCpuMove(state: GameState, level: CpuLevel,
  limits: CpuBudget = CPU_POLICIES[level], random: () => number = Math.random,
  now: () => number = () => performance.now()): { move: Move; diagnostics: CpuDiagnostics } {
  validateCpuBudget(limits);
  if (!CPU_POLICIES[level] || state.result || state.players[state.turn].status !== "active") {
    throw new Error("CPU search requires an active turn and a valid level");
  }
  const start = now();
  const diagnostics: CpuDiagnostics = { nodes: 0, completedDepth: 0, elapsedMs: 0, stopped: "depth", fallback: true };
  const stop = Symbol("budget");
  const check = () => {
    if (diagnostics.nodes >= limits.nodeBudget) { diagnostics.stopped = "nodes"; throw stop; }
    if (limits.timeMs !== null && now() - start >= limits.timeMs) { diagnostics.stopped = "time"; throw stop; }
  };
  const budget = { check, visit: () => { check(); diagnostics.nodes++; } };
  const moves = legalMoves(state);
  if (!moves.length) throw new Error("CPU turn has no legal moves");
  let chosen = moves[0];
  const config = DIFFICULTY_PRESETS[level];
  try {
    for (let depth = 1; depth <= limits.maxDepth; depth++) {
      check();
      const ranked = scoreMovesExactly(state, state.turn, moves, {
        maxDepth: depth, budget, evaluate: (s, c) => evaluateFull(s, c, config.evalWeights),
      });
      // Publish only a complete iteration. Refinement may exhaust the remaining
      // budget without invalidating this exact best move.
      chosen = ranked[0].move;
      diagnostics.completedDepth = depth; diagnostics.fallback = false;
      const pool = ranked.filter(entry => entry.value >= ranked[0].value - 0.5).slice(0, 8);
      const fresh: Move[] = [];
      for (const entry of pool) {
        check();
        const after = applyMove(state, entry.move);
        if (!(state.positionCounts[positionKey(after)] > 0)) fresh.push(entry.move);
      }
      const preferred = fresh.length ? fresh : pool.map(entry => entry.move);
      const count = Math.min(config.topK, preferred.length);
      chosen = random() < config.randomness ? preferred[Math.min(count - 1, Math.max(0, Math.floor(random() * count)))] : preferred[0];
    }
  } catch (error) { if (error !== stop) throw error; }
  diagnostics.elapsedMs = now() - start;
  return { move: chosen, diagnostics };
}
