import { GameState, Move, PlayerColor, PIECE_VALUES, applyMove, legalMoves, isPlayerInCheck } from "@li4chess/engine";
import { evaluateUtility, evaluateVector, terminalUtility, UtilityFn, UtilityVector } from "./utility.js";
import { positionHash, searchSignature, TranspositionTable } from "./hash.js";

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
  ttCapacity?: number;
  ordering?: "classic" | "enhanced";
  quiescenceDepth?: number;
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
  if (options.quiescenceDepth !== undefined && (!Number.isInteger(options.quiescenceDepth) || options.quiescenceDepth < 0)) throw new Error("Invalid quiescenceDepth");
  if (options.strategy === "maxn" && options.quiescenceDepth) throw new Error("Vector quiescence is not implemented; compare Maxn against non-quiescent paranoid");
  if (state.result || state.players[state.turn].status !== "active") throw new Error("Search requires an active turn");
  const now = options.now ?? (() => performance.now());
  const start = now();
  const root = state.turn;
  const evaluate: UtilityFn = (s,c) => terminalUtility(s,c) ?? (options.evaluate ?? evaluateUtility)(s,c);
  const stats: LabStats = { nodes: 0, leaves: 0, legalMoves: 0, moveGenerations: 0, cutoffs: 0,
    ttHits: 0, qNodes: 0, depthReached: 0, elapsedMs: 0, nodesPerSecond: 0 };
  let stopped: LabResult["stopped"] = "depth";
  const table = new TranspositionTable(options.ttCapacity ?? 0);
  const killers = new Map<string,string>();
  const history = new Map<string,number>();
  function ordered(moves: Move[], turn: PlayerColor, depth: number, preferred?: Move) {
    if (options.ordering !== "enhanced") return order(moves,preferred);
    const score = (m: Move) => {
      const id=searchMoveId(m);
      // Priority bands reflect ordering only, never evaluation units.
      if (preferred && id===searchMoveId(preferred)) return 1e9;
      if (m.promotion || m.captured) return 1e6 + 100*(m.promotion ? PIECE_VALUES[m.promotion]-1 : 0)
        + 10*(m.captured ? PIECE_VALUES[m.captured.type] : 0)-PIECE_VALUES[m.piece.type];
      if (m.isCheck.length) return 1e5+m.isCheck.length;
      if (killers.get(`${turn}:${depth}`)===id) return 1e4;
      return Math.min(9999,history.get(`${turn}:${id}`) ?? 0);
    };
    return [...moves].sort((a,b)=>score(b)-score(a));
  }
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
  function quiescence(s: GameState, depth: number, alpha: number, beta: number): {value:number;pv:Move[]} {
    checkBudget(); stats.nodes++; stats.qNodes++;
    const stand=evaluate(s,root); stats.leaves++;
    if (!depth || s.result) return {value:stand,pv:[]};
    const inCheck=isPlayerInCheck(s,s.turn), max=s.turn===root;
    let value=inCheck ? (max ? -Infinity : Infinity) : stand;
    let pv:Move[]=[];
    if (!inCheck) {
      if (max) alpha=Math.max(alpha,value); else beta=Math.min(beta,value);
      if (alpha>=beta) {stats.cutoffs++;return {value,pv};}
    }
    const moves=ordered(generate(s).filter(m=>inCheck || !!m.captured || !!m.promotion || m.isCheck.length>0),s.turn,depth);
    for (const move of moves) {
      checkBudget(); const child=quiescence(applyMove(s,move),depth-1,alpha,beta);
      if (max ? child.value>value : child.value<value) {value=child.value;pv=[move,...child.pv];}
      if (max) alpha=Math.max(alpha,value); else beta=Math.min(beta,value);
      if (alpha>=beta) {stats.cutoffs++;break;}
    }
    return {value,pv};
  }
  function paranoid(s: GameState, depth: number, alpha: number, beta: number): { value: number; pv: Move[] } {
    if (depth === 0 && options.quiescenceDepth && !s.result) return quiescence(s,options.quiescenceDepth,alpha,beta);
    checkBudget(); stats.nodes++;
    if (depth === 0 || s.result) { stats.leaves++; return { value: evaluate(s,root), pv: [] }; }
    const originalAlpha = alpha, originalBeta = beta;
    const hash = options.ttCapacity ? positionHash(s) : 0n;
    const signature = options.ttCapacity ? searchSignature(s) : "";
    const entry = table.get(hash,signature);
    // Reuse only equal horizons: deeper heuristic values need not equal shallow values.
    if (entry && entry.depth === depth) {
      stats.ttHits++;
      if (entry.bound === "exact") return {value:entry.value,pv:[]};
      if (entry.bound === "lower") alpha = Math.max(alpha,entry.value);
      else beta = Math.min(beta,entry.value);
      if (alpha >= beta) return {value:entry.value,pv:[]};
    }
    const generated = generate(s);
    const moves = ordered(generated,s.turn,depth,generated.find(m=>searchMoveId(m) === entry?.bestMove));
    if (!moves.length) throw new Error("Oracle supplied active turn without legal moves");
    const max = s.turn === root;
    let value = max ? -Infinity : Infinity;
    let pv: Move[] = [];
    for (const move of moves) {
      checkBudget();
      const child = paranoid(applyMove(s,move),depth-1,alpha,beta);
      if (max ? child.value > value : child.value < value) { value = child.value; pv = [move,...child.pv]; }
      if (max) alpha = Math.max(alpha,value); else beta = Math.min(beta,value);
      if (alpha >= beta) {
        stats.cutoffs++;
        if (options.ordering === "enhanced" && !move.captured && !move.promotion) {
          const id=searchMoveId(move); killers.set(`${s.turn}:${depth}`,id);
          const key=`${s.turn}:${id}`;history.set(key,(history.get(key) ?? 0)+depth*depth);
        }
        break;
      }
    }
    table.set(hash,{signature,depth,value,bound:value <= originalAlpha ? "upper" : value >= originalBeta ? "lower" : "exact",bestMove:pv[0] && searchMoveId(pv[0])});
    return { value, pv };
  }
  function maxn(s: GameState, depth: number): { vector: UtilityVector; pv: Move[] } {
    checkBudget(); stats.nodes++;
    if (depth === 0 || s.result) { stats.leaves++; return { vector: evaluateVector(s,evaluate), pv: [] }; }
    const moves = ordered(generate(s),s.turn,depth);
    if (!moves.length) throw new Error("Oracle supplied active turn without legal moves");
    let best: { vector: UtilityVector; pv: Move[] } | undefined;
    for (const move of moves) {
      checkBudget(); const child = maxn(applyMove(s,move),depth-1);
      // Stable first-in-order tie policy; no invalid scalar alpha-beta pruning.
      if (!best || child.vector[s.turn] > best.vector[s.turn]) best = { vector: child.vector, pv: [move,...child.pv] };
    }
    return best!;
  }
  const rootMoves = ordered(generate(state),root,options.maxDepth);
  if (!rootMoves.length) throw new Error("No legal root moves");
  let ranked: RankedChoice[] = [];
  let pv: Move[] = [];
  try {
    for (let depth = options.iterative === false ? options.maxDepth : 1; depth <= options.maxDepth; depth++) {
      const iteration: RankedChoice[] = [];
      let alpha = -Infinity;
      for (const move of ordered(rootMoves,root,depth,pv[0])) {
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
