import { ALL_COLORS, GameState, Move, PlayerColor, applyMove, advanceWalkingKing,selectWalkingMove,claimSecuresSoleWin,claimWin, assertLocalMigrationState, createInitialState, legalMoves, positionKey } from "@li4chess/engine";
import { equalCanonical, engineState, readReplay, recordReplay } from "@li4chess/protocol";
import type { ActionRequest, ReplayEnvelopeV2 } from "@li4chess/protocol";
import { assertBuildUnchanged, readBuildIdentity, runtimeEnvironment, validateEnvironment } from "@li4chess/protocol/node";

// Capture once while these implementations load; never relabel loaded code after disk edits.
const producerBuild = readBuildIdentity();

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
  source: "engine" | "walkingKing";
  color: PlayerColor; move: Move; elapsedMs: number; branching: number;
  keyAfter: string; stats?: Record<string, unknown>;
}
export interface GameRecord {
  claim?: { actor:PlayerColor;afterPly:number };
  version: 2; seed: number; engines: { id: string; config?: unknown }[];
  replay: ReplayEnvelopeV2;
  provenance: { maxPlies:number;environment:ReturnType<typeof runtimeEnvironment> };
  initial: GameState; moves: MoveRecord[]; result: GameState["result"];
  scores: number[]; statuses: string[]; eliminations: { color: PlayerColor; turn: number }[];
  termination: NonNullable<GameState["result"]>["reason"] | "max-ply" | "error";
  error?: string; errorSeat?: PlayerColor; plies: number; elapsedMs: number;
}
export async function runGame(seats: Seats, options: { seed: number; maxPlies: number; initial?: GameState }): Promise<GameRecord> {
  if (!Number.isInteger(options.maxPlies) || options.maxPlies < 0) throw new Error("Invalid maxPlies");
  const initial = structuredClone(options.initial ?? createInitialState());
  assertLocalMigrationState(initial);
  assertBuildUnchanged(producerBuild);
  const actions: ActionRequest[] = [];
  let state = initial;
  const started = performance.now();
  const random = ALL_COLORS.map(c => seededRandom(options.seed + c * 1000003));
  const moves: MoveRecord[] = [];
  let error: string | undefined;
  let errorSeat: PlayerColor | undefined;
  let claim:GameRecord["claim"];
  while (!state.result && moves.length < options.maxPlies) {
    const color = state.turn;
    try {
      if (claimSecuresSoleWin(state,color)) { claim={ actor:color,afterPly:moves.length };state=claimWin(state,color);actions.push({ type:"claimWin",actor:color });break; }
      const legal = legalMoves(state);
      const start = performance.now();
      // A plugin cannot mutate the oracle state used for legality/replay.
      const walking=state.players[color].kingStatus === "walking";
      const reply = walking ? { move:selectWalkingMove(state).move } : await seats[color].choose(structuredClone(state), random[color]);
      const elapsedMs = performance.now() - start;
      const move = legal.find(m => moveId(m) === moveId(reply.move));
      if (!move) throw new Error(`Illegal engine move ${moveId(reply.move)}`);
      state = walking ? advanceWalkingKing(state) : applyMove(state, move);
      actions.push(walking ? { type:"randomKingMove",actor:color } : { type:"move",actor:color,move });
      moves.push({ source:walking ? "walkingKing" : "engine", color, move:state.moveHistory.at(-1)!, elapsedMs, branching: legal.length, keyAfter: positionKey(state), stats: reply.stats });
    } catch (caught) {
      error = caught instanceof Error ? caught.stack ?? caught.message : String(caught);
      errorSeat = color;
      break;
    }
  }
  const recordedReplay = await recordReplay(initial,actions,producerBuild);
  assertBuildUnchanged(producerBuild);
  return {
    version: 2, seed: options.seed, engines: seats.map(({ id, config }) => ({ id, config })), initial, moves,
    replay:recordedReplay,provenance:{ maxPlies:options.maxPlies,environment:runtimeEnvironment() },
    result: state.result, scores: ALL_COLORS.map(c => state.players[c].score),
    statuses: ALL_COLORS.map(c => state.players[c].status),
    eliminations: ALL_COLORS.filter(c => state.players[c].status !== "active")
      .map(color => ({ color, turn: state.players[color].eliminatedOnTurn ?? -1 }))
      .sort((a, b) => a.turn - b.turn || a.color - b.color),
    termination: error ? "error" : state.result?.reason ?? "max-ply", error, errorSeat,claim,
    plies: moves.length, elapsedMs: performance.now() - started,
  };
}
export async function replay(game: GameRecord): Promise<GameState> {
  if (game?.version !== 2) throw new Error("Unsupported migration record: legacy-arena-v1 requires its producing reader and manifest");
  const checked = await readReplay(game.replay);
  const final = engineState(checked.state);
  if (!equalCanonical(engineState(game.replay.initialState),game.initial)) throw new Error("Replay initial metadata mismatch");
  if (!Array.isArray(game.engines) || game.engines.length !== 4 || game.engines.some(e=>typeof e.id !== "string" || !e.id) ||
    !Number.isSafeInteger(game.seed) || !game.provenance || !Number.isSafeInteger(game.provenance.maxPlies) || game.provenance.maxPlies<0 ||
    !game.provenance.environment || !Number.isFinite(game.elapsedMs) || game.elapsedMs<0) throw new Error("Invalid arena provenance");
  validateEnvironment(game.provenance.environment);
  assertLocalMigrationState(game.initial);
  let state = structuredClone(game.initial);
  for (const record of game.moves) {
    if (state.result || state.turn !== record.color) throw new Error("Replay turn mismatch");
    const generated = legalMoves(state);
    const move = generated.find(m => moveId(m) === moveId(record.move));
    if (!move) throw new Error("Replay illegal move");
    if (record.source !== (state.players[state.turn].kingStatus === "walking" ? "walkingKing" : "engine") ||
      record.branching !== generated.length) throw new Error("Replay move source/branching mismatch");
    if (state.players[state.turn].kingStatus === "walking") {
      if (moveId(selectWalkingMove(state).move)!==moveId(move)) throw new Error("Replay random move mismatch");
      state=advanceWalkingKing(state);
    } else state = applyMove(state, move);
    if (!equalCanonical(state.moveHistory.at(-1),record.move) || !Number.isFinite(record.elapsedMs) || record.elapsedMs<0 ||
      !Number.isSafeInteger(record.branching) || record.branching<1) throw new Error("Replay move metadata mismatch");
    if (positionKey(state) !== record.keyAfter) throw new Error("Replay position mismatch");
  }
  if (game.claim) {
    if (game.claim.afterPly!==game.moves.length) throw new Error("Replay claim boundary mismatch");
    state=claimWin(state,game.claim.actor);
  }
  if (JSON.stringify(state.result) !== JSON.stringify(game.result)) throw new Error("Replay result mismatch");
  if (JSON.stringify(ALL_COLORS.map(c => state.players[c].score)) !== JSON.stringify(game.scores)) throw new Error("Replay score mismatch");
  const eliminations = ALL_COLORS.filter(c=>state.players[c].status !== "active")
    .map(color=>({ color,turn:state.players[color].eliminatedOnTurn ?? -1 })).sort((a,b)=>a.turn-b.turn || a.color-b.color);
  if (!equalCanonical(state,final) || !equalCanonical(ALL_COLORS.map(c=>state.players[c].status),game.statuses) ||
    !equalCanonical(eliminations,game.eliminations) || game.plies !== game.moves.length || game.plies>game.provenance.maxPlies ||
    (game.termination === "error" ? !game.error || !ALL_COLORS.includes(game.errorSeat!) || state.result !== null :
      game.termination !== (state.result?.reason ?? "max-ply") || game.error !== undefined || game.errorSeat !== undefined ||
      !state.result && game.plies !== game.provenance.maxPlies)) throw new Error("Replay final metadata mismatch");
  return state;
}
/** Cyclic rotation preserves relative seat adjacency. Use all permutations for AABB geometry. */
export function rotateSeats(seats: Seats, rotation: number): Seats {
  return ALL_COLORS.map(c => seats[(c + rotation) % 4]) as unknown as Seats;
}
export async function tournament(seats: Seats, seeds: number[], maxPlies: number, initial?: GameState,
  onGame?: (game: GameRecord) => void | Promise<void>): Promise<GameRecord[]> {
  const games: GameRecord[] = [];
  for (const seed of seeds) for (let rotation = 0; rotation < 4; rotation++) {
    const game = await runGame(rotateSeats(seats, rotation), { seed, maxPlies, initial });
    games.push(game); await onGame?.(game);
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
export async function aggregate(games: GameRecord[]) {
  for (const game of games) await replay(game);
  const ids = [...new Set(games.flatMap(g => g.engines.map(e => e.id)))];
  const complete = games.filter(g => g.result !== null && g.result.reason !== "abort" && g.termination !== "error");
  const engines = ids.map(id => {
    const entries = complete.flatMap(g => g.engines.flatMap((e, c) => e.id === id ? [{ g, c, p: g.result!.placements.find(p => p.color === c)! }] : []));
    const times = games.flatMap(g => g.moves.filter(m => m.source === "engine" && g.engines[m.color].id === id).map(m => m.elapsedMs));
    const engineMoves=games.flatMap(g=>g.moves.filter(m=>m.source === "engine" && g.engines[m.color].id===id));
    const seeds=[...new Set(games.map(g=>g.seed))];
    const perSeat = ALL_COLORS.map(c => ({ seat: c, count: entries.filter(e => e.c === c).length,
      first: mean(entries.filter(e => e.c === c).map(e => +(e.p.place === 1))),
      placement: mean(entries.filter(e => e.c === c).map(e => e.p.meanRank)) }));
    return { id, completedSeatGames: entries.length, firstPlace: mean(entries.map(e => +(e.p.place === 1))),
      soleWin: mean(entries.map(e => +(e.g.result!.winner === e.c))), averagePlacement: mean(entries.map(e => e.p.meanRank)),
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
    automaticKingMoves:games.reduce((count,game)=>count+game.moves.filter(move=>move.source === "walkingKing").length,0),
    errors: games.filter(g => g.termination === "error").length,
    aborted: games.filter(g=>g.termination === "abort").length,
    repetitionRate: mean(games.map(g => +(g.termination === "repetition"))),
    plies: distribution(games.map(g => g.plies)), durationMs: distribution(games.map(g => g.elapsedMs)), engines, headToHead };
}
