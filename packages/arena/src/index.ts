import { ALL_COLORS, GameState, Move, PlayerColor, applyMove, createInitialState, legalMoves, positionKey } from "@li4chess/engine";

export interface EngineReply { move: Move; stats?: Record<string, unknown> }
export interface ArenaEngine {
  id: string;
  config?: unknown;
  choose(state: GameState, random: () => number): EngineReply | Promise<EngineReply>;
}
export type Seats = readonly [ArenaEngine, ArenaEngine, ArenaEngine, ArenaEngine];
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function moveId(move: Move): string {
  return `${move.from}:${move.to}:${move.promotion ?? ""}:${move.castle ?? ""}:${move.enPassantCapture ?? ""}`;
}
export interface MoveRecord {
  color: PlayerColor; move: Move; elapsedMs: number; branching: number;
  keyAfter: string; stats?: Record<string, unknown>;
}
export interface GameRecord {
  version: 1; seed: number; engines: { id: string; config?: unknown }[];
  initial: GameState; moves: MoveRecord[]; result: GameState["result"];
  scores: number[]; statuses: string[]; eliminations: { color: PlayerColor; turn: number }[];
  termination: "elimination" | "repetition" | "max-ply" | "error";
  error?: string; errorSeat?: PlayerColor; plies: number; elapsedMs: number;
}
export async function runGame(seats: Seats, options: { seed: number; maxPlies: number; initial?: GameState }): Promise<GameRecord> {
  if (!Number.isInteger(options.maxPlies) || options.maxPlies < 0) throw new Error("Invalid maxPlies");
  const initial = structuredClone(options.initial ?? createInitialState());
  let state = initial;
  const started = performance.now();
  const random = ALL_COLORS.map(c => seededRandom(options.seed + c * 1000003));
  const moves: MoveRecord[] = [];
  let error: string | undefined;
  let errorSeat: PlayerColor | undefined;
  while (!state.result && moves.length < options.maxPlies) {
    const color = state.turn;
    try {
      const legal = legalMoves(state);
      const start = performance.now();
      // A plugin cannot mutate the oracle state used for legality/replay.
      const reply = await seats[color].choose(structuredClone(state), random[color]);
      const elapsedMs = performance.now() - start;
      const move = legal.find(m => moveId(m) === moveId(reply.move));
      if (!move) throw new Error(`Illegal engine move ${moveId(reply.move)}`);
      state = applyMove(state, move);
      moves.push({ color, move, elapsedMs, branching: legal.length, keyAfter: positionKey(state), stats: reply.stats });
    } catch (caught) {
      error = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
      errorSeat = color;
      break;
    }
  }
  return {
    version: 1, seed: options.seed, engines: seats.map(({ id, config }) => ({ id, config })), initial, moves,
    result: state.result, scores: ALL_COLORS.map(c => state.players[c].score),
    statuses: ALL_COLORS.map(c => state.players[c].status),
    eliminations: ALL_COLORS.filter(c => state.players[c].status !== "active")
      .map(color => ({ color, turn: state.players[color].eliminatedOnTurn ?? -1 }))
      .sort((a, b) => a.turn - b.turn || a.color - b.color),
    termination: error ? "error" : state.result?.reason ?? "max-ply", error, errorSeat,
    plies: moves.length, elapsedMs: performance.now() - started,
  };
}
export function replay(game: GameRecord): GameState {
  let state = structuredClone(game.initial);
  for (const record of game.moves) {
    if (state.result || state.turn !== record.color) throw new Error("Replay turn mismatch");
    const move = legalMoves(state).find(m => moveId(m) === moveId(record.move));
    if (!move) throw new Error("Replay illegal move");
    state = applyMove(state, move);
    if (positionKey(state) !== record.keyAfter) throw new Error("Replay position mismatch");
  }
  if (JSON.stringify(state.result) !== JSON.stringify(game.result)) throw new Error("Replay result mismatch");
  if (JSON.stringify(ALL_COLORS.map(c => state.players[c].score)) !== JSON.stringify(game.scores)) throw new Error("Replay score mismatch");
  return state;
}
/** Cyclic rotation preserves relative seat adjacency. Use all permutations for AABB geometry. */
export function rotateSeats(seats: Seats, rotation: number): Seats {
  return ALL_COLORS.map(c => seats[(c + rotation) % 4]) as unknown as Seats;
}
export async function tournament(seats: Seats, seeds: number[], maxPlies: number, initial?: GameState,
  onGame?: (game: GameRecord) => void): Promise<GameRecord[]> {
  const games: GameRecord[] = [];
  for (const seed of seeds) for (let rotation = 0; rotation < 4; rotation++) {
    const game = await runGame(rotateSeats(seats, rotation), { seed, maxPlies, initial });
    games.push(game); onGame?.(game);
  }
  return games;
}
export function distribution(values: number[]) {
  if (!values.length) return { count: 0, mean: null, p50: null, p95: null, max: null };
  const sorted = [...values].sort((a, b) => a - b);
  return { count: values.length, mean: values.reduce((a,b) => a+b, 0) / values.length,
    p50: sorted[Math.floor((sorted.length - 1) * .5)], p95: sorted[Math.floor((sorted.length - 1) * .95)], max: sorted.at(-1)! };
}
const mean = (v: number[]) => v.length ? v.reduce((a,b) => a+b, 0) / v.length : null;
/** Resample whole seed blocks, preserving correlated seats/games. Tiny samples are explicitly unestimated. */
export function clusterInterval(blocks: number[][]): {low:number;high:number} | null {
  if (blocks.length < 5 || blocks.some(b=>!b.length)) return null;
  const random=seededRandom(91827), estimates:number[]=[];
  for (let i=0;i<1000;i++) {
    const sampled=Array.from({length:blocks.length},()=>blocks[Math.floor(random()*blocks.length)]).flat();
    estimates.push(mean(sampled)!);
  }
  estimates.sort((a,b)=>a-b);return {low:estimates[24],high:estimates[974]};
}
export function aggregate(games: GameRecord[]) {
  const ids = [...new Set(games.flatMap(g => g.engines.map(e => e.id)))];
  const complete = games.filter(g => g.result !== null && g.termination !== "error");
  const engines = ids.map(id => {
    const entries = complete.flatMap(g => g.engines.flatMap((e, c) => e.id === id ? [{ g, c, p: g.result!.placements.find(p => p.color === c)! }] : []));
    const times = games.flatMap(g => g.moves.filter(m => g.engines[m.color].id === id).map(m => m.elapsedMs));
    const engineMoves=games.flatMap(g=>g.moves.filter(m=>g.engines[m.color].id===id));
    const seeds=[...new Set(games.map(g=>g.seed))];
    const perSeat = ALL_COLORS.map(c => ({ seat: c, count: entries.filter(e => e.c === c).length,
      first: mean(entries.filter(e => e.c === c).map(e => +(e.p.place === 1))),
      placement: mean(entries.filter(e => e.c === c).map(e => e.p.place)) }));
    return { id, completedSeatGames: entries.length, firstPlace: mean(entries.map(e => +(e.p.place === 1))),
      soleWin: mean(entries.map(e => +(e.g.result!.winner === e.c))), averagePlacement: mean(entries.map(e => e.p.place)),
      averageScore: mean(entries.map(e => e.p.score)), survival: mean(entries.map(e => +(e.g.statuses[e.c] === "active"))),
      seatNormalizedFirst: perSeat.every(s => s.first !== null) ? mean(perSeat.map(s => s.first!)) : null,
      firstPlaceCluster95:clusterInterval(seeds.map(seed=>entries.filter(e=>e.g.seed===seed).map(e=>+(e.p.place===1)))),
      perSeat, moveMs: distribution(times), branching:distribution(engineMoves.map(m=>m.branching)),
      searchNodes:distribution(engineMoves.flatMap(m=>typeof m.stats?.nodes === "number" ? [m.stats.nodes] : [])),
      reachedDepth:distribution(engineMoves.flatMap(m=>typeof m.stats?.depthReached === "number" ? [m.stats.depthReached] : [])) };
  });
  const headToHead = ids.flatMap(a => ids.filter(b => a < b).map(b => {
    const bySeat = ALL_COLORS.map(c => complete.flatMap(g => g.engines[c].id !== a ? [] :
      g.engines.flatMap((e,d) => e.id !== b ? [] : [{ a: g.result!.placements.find(p => p.color === c)!.place,
        b: g.result!.placements.find(p => p.color === d)!.place }])));
    return { a, b, seatNormalizedPairScore: bySeat.every(s => s.length) ? mean(bySeat.map(s => mean(s.map(p => p.a < p.b ? 1 : p.a === p.b ? .5 : 0))!)) : null };
  }));
  return { games: games.length, completed: complete.length, censored: games.filter(g => g.termination === "max-ply").length,
    errors: games.filter(g => g.termination === "error").length,
    repetitionRate: mean(games.map(g => +(g.termination === "repetition"))),
    plies: distribution(games.map(g => g.plies)), durationMs: distribution(games.map(g => g.elapsedMs)), engines, headToHead };
}
