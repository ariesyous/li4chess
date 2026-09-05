import { GameState, Move, PlayerColor, PIECE_VALUES, applyMove, legalMoves } from "@li4chess/engine";
import { evaluateUtility, evaluateVector, terminalUtility, UtilityFn, UtilityVector } from "./utility.js";

export interface LabOptions {
  maxDepth: number;
  strategy?: "paranoid" | "maxn";
  iterative?: boolean;
  nodeBudget?: number;
  timeMs?: number;
  cancelled?: () => boolean;
  now?: () => number;
  evaluate?: UtilityFn;
  /** Exact root scores are required for score-distance personality sampling. */
  exactRootScores?: boolean;
}
export interface LabStats {
  nodes: number; leaves: number; legalMoves: number; moveGenerations: number;
  cutoffs: number; ttHits: number; qNodes: number; depthReached: number;
  elapsedMs: number; nodesPerSecond: number;
}
export interface RankedChoice { move: Move; value: number; exact: boolean; pv: Move[] }
export interface LabResult {
  move: Move; value: number | null; ranked: RankedChoice[]; pv: Move[];
  stats: LabStats; stopped: "depth" | "nodes" | "time" | "cancelled";
}
export const searchMoveId = (m: Move) => `${m.from}:${m.to}:${m.promotion ?? ""}:${m.castle ?? ""}:${m.enPassantCapture ?? ""}`;
const tacticalScore = (m: Move) => (m.captured ? PIECE_VALUES[m.captured.type] : 0) + .5 * m.isCheck.length;
const order = (moves: Move[], preferred?: Move) => [...moves].sort((a,b) =>
  +(searchMoveId(b) === (preferred && searchMoveId(preferred))) - +(searchMoveId(a) === (preferred && searchMoveId(preferred))) || tacticalScore(b) - tacticalScore(a));
const STOP = Symbol("search budget");

/** Experimental algorithms only. Classic sources and production selection are unchanged. */
export function searchPosition(state: GameState, options: LabOptions): LabResult {
  if (!Number.isInteger(options.maxDepth) || options.maxDepth < 1) throw new Error("maxDepth must be a positive integer");
  if (options.nodeBudget !== undefined && (!Number.isInteger(options.nodeBudget) || options.nodeBudget < 0)) throw new Error("Invalid nodeBudget");
  if (options.timeMs !== undefined && (!Number.isFinite(options.timeMs) || options.timeMs < 0)) throw new Error("Invalid timeMs");
  if (state.result || state.players[state.turn].status !== "active") throw new Error("Search requires an active turn");
  const now = options.now ?? (() => performance.now());
  const start = now();
  const root = state.turn;
  const evaluate: UtilityFn = (s,c) => terminalUtility(s,c) ?? (options.evaluate ?? evaluateUtility)(s,c);
  const stats: LabStats = { nodes: 0, leaves: 0, legalMoves: 0, moveGenerations: 0, cutoffs: 0,
    ttHits: 0, qNodes: 0, depthReached: 0, elapsedMs: 0, nodesPerSecond: 0 };
  let stopped: LabResult["stopped"] = "depth";
  function checkBudget() {
    if (options.cancelled?.()) stopped = "cancelled";
    else if (stats.nodes >= (options.nodeBudget ?? Infinity)) stopped = "nodes";
    else if (now() - start >= (options.timeMs ?? Infinity)) stopped = "time";
    else return;
    throw STOP;
  }
  function generate(s: GameState) {
    const moves = legalMoves(s); stats.moveGenerations++; stats.legalMoves += moves.length; return moves;
  }
  function paranoid(s: GameState, depth: number, alpha: number, beta: number): { value: number; pv: Move[] } {
    checkBudget(); stats.nodes++;
    if (depth === 0 || s.result) { stats.leaves++; return { value: evaluate(s,root), pv: [] }; }
    const moves = order(generate(s));
    if (!moves.length) throw new Error("Oracle supplied active turn without legal moves");
    const max = s.turn === root;
    let value = max ? -Infinity : Infinity;
    let pv: Move[] = [];
    for (const move of moves) {
      checkBudget();
      const child = paranoid(applyMove(s,move),depth-1,alpha,beta);
      if (max ? child.value > value : child.value < value) { value = child.value; pv = [move,...child.pv]; }
      if (max) alpha = Math.max(alpha,value); else beta = Math.min(beta,value);
      if (alpha >= beta) { stats.cutoffs++; break; }
    }
    return { value, pv };
  }
  function maxn(s: GameState, depth: number): { vector: UtilityVector; pv: Move[] } {
    checkBudget(); stats.nodes++;
    if (depth === 0 || s.result) { stats.leaves++; return { vector: evaluateVector(s,evaluate), pv: [] }; }
    const moves = order(generate(s));
    if (!moves.length) throw new Error("Oracle supplied active turn without legal moves");
    let best: { vector: UtilityVector; pv: Move[] } | undefined;
    for (const move of moves) {
      checkBudget(); const child = maxn(applyMove(s,move),depth-1);
      // Stable first-in-order tie policy; no invalid scalar alpha-beta pruning.
      if (!best || child.vector[s.turn] > best.vector[s.turn]) best = { vector: child.vector, pv: [move,...child.pv] };
    }
    return best!;
  }
  const rootMoves = order(generate(state));
  if (!rootMoves.length) throw new Error("No legal root moves");
  let ranked: RankedChoice[] = [];
  let pv: Move[] = [];
  try {
    for (let depth = options.iterative === false ? options.maxDepth : 1; depth <= options.maxDepth; depth++) {
      const iteration: RankedChoice[] = [];
      let alpha = -Infinity;
      for (const move of order(rootMoves,pv[0])) {
        checkBudget();
        const child = applyMove(state,move);
        const window = options.exactRootScores ? -Infinity : alpha;
        const found = options.strategy === "maxn" ? (() => { const r = maxn(child,depth-1); return {value: r.vector[root], pv:r.pv}; })()
          : paranoid(child,depth-1,window,Infinity);
        const exact = options.strategy === "maxn" || found.value > window;
        iteration.push({ move, value: found.value, exact, pv: [move,...found.pv] });
        alpha = Math.max(alpha,found.value);
      }
      iteration.sort((a,b) => b.value-a.value || +b.exact-+a.exact);
      ranked = iteration; pv = ranked[0].pv; stats.depthReached = depth;
    }
  } catch (error) { if (error !== STOP) throw error; }
  stats.elapsedMs = now()-start;
  stats.nodesPerSecond = stats.elapsedMs > 0 ? stats.nodes*1000/stats.elapsedMs : 0;
  return { move: ranked[0]?.move ?? rootMoves[0], value: ranked[0]?.value ?? null, ranked, pv, stats, stopped };
}

/** Sample only exact scores inside a defensible loss threshold, never arbitrary top K. */
export function chooseWithinDistance(result: LabResult, maxLoss: number, random: () => number): Move {
  if (!Number.isFinite(maxLoss) || maxLoss < 0) throw new Error("Invalid maxLoss");
  const pool = result.ranked.filter(r => r.exact && r.value >= (result.value ?? Infinity)-maxLoss);
  return pool.length ? pool[Math.min(pool.length-1, Math.max(0,Math.floor(random()*pool.length)))].move : result.move;
}
