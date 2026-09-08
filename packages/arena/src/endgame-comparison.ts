import { appendFileSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createRunDirectory, readBuildIdentity, runtimeEnvironment } from "@li4chess/protocol/node";
import { ALL_COLORS, GameState, Move, PieceType, PlayerColor, applyMove, assertLocalMigrationState, legalMoves, localSquare, positionKey } from "@li4chess/engine";
import { chooseBoundedCpuMove, CpuDiagnostics, CPU_POLICIES, loadPosition, positions, pawnEndgameScore } from "@li4chess/bot";
import { chooseBoundedCpuMove as baselineChoose } from "./endgame-baseline/bounded.js";
import { reconstructEndgameReplay } from "./endgame-replay.js";
import { aggregate, ArenaEngine, distribution, GameRecord, replay, runGame, seededRandom, Seats } from "./index.js";

const [out, assignment = "primary"] = process.argv.slice(2);
if (!out || !["primary", "reverse"].includes(assignment)) throw new Error("Usage: vite-node src/endgame-comparison.ts <fresh-output-directory> [primary|reverse]");
const reverse = assignment === "reverse";
createRunDirectory(out);
const limits = { maxDepth: 3, nodeBudget: 2048, timeMs: 250 };
const root = resolve("../..");
const build = readBuildIdentity();
const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0").filter(f => /^(packages\/(bot|engine|protocol|arena)\/|pnpm-lock.yaml$|package.json$|tsconfig.base.json$)/.test(f));
const hashes: Record<string, string> = {};
for (const file of files) {
  const bytes = readFileSync(resolve(root, file));
  hashes[file] = createHash("sha256").update(bytes).digest("hex");
  const dest = resolve(out, "source", file); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(resolve(root, file), dest);
}
writeFileSync(resolve(out, "source-hashes.json"), JSON.stringify(hashes, null, 2));
writeFileSync(resolve(out, "working-tree.patch"), execFileSync("git", ["diff", "--binary"], { cwd: root, windowsHide: true }));
writeFileSync(resolve(out, "run.json"), JSON.stringify({ date: new Date().toISOString(), build, environment: runtimeEnvironment(),
  pnpm: "10.33.0", limits, cap: 160, validationSeeds: [701, 1709], assignment,
  protocol: "24 games per assignment: three held-out positions, four spatial/owner rotations, adjacent AABB and opposite ABAB. Four seeded legal jitter plies precede each game. Combine primary and reverse to balance pawn ownership. Primary also runs two replay continuations, 160-ply cap, Red modeled by baseline CPU (not human prediction). No evaluator tuning after validation starts; reverse assignments added to correct ownership confounding.",
  metrics: "Completed placements only; capped games unfinished. Quiet king run and own-king returns are descriptive, not automatically mistakes. Plan-miss proxy: quiet king move failing to improve the fixed route/escort score when a legal pawn move improves it and survives the immediately following opponent's legal captures. This does not prove long-term safety or winning play.",
}, null, 2));

function rotated(state: GameState, rotation: PlayerColor): GameState {
  const board: GameState["board"][number][] = Array(196).fill(null);
  for (let s = 0; s < 196; s++) {
    const p = state.board[s]; if (!p) continue;
    board[localSquare(rotation, s % 14 - 3, Math.floor(s / 14))] = { ...p, owner: (p.owner + rotation) % 4 };
  }
  const players = { ...state.players };
  for (const c of ALL_COLORS) players[(c + rotation) % 4 as PlayerColor] = { ...state.players[c], color: (c + rotation) % 4 };
  const next = { ...state, board, players, turn: (state.turn + rotation) % 4 as PlayerColor, positionCounts: {} };
  return { ...next, positionCounts: { [positionKey(next)]: 1 } };
}

// Held out from the development fixtures and original replay. Different pawn
// files/ranks, interception distances and two mutually blocking pawn pairs.
const validation = [
  loadPosition({ id: "runner", tags: [], pieces: [[7,0,"K"],[98,1,"K"],[185,2,"K"],[153,3,"K"],[79,0,"P"],[117,2,"P"]] }),
  loadPosition({ id: "blockade", tags: [], pieces: [[48,0,"K"],[99,1,"K"],[148,2,"K"],[124,3,"K"],[90,0,"P"],[104,2,"P"],[118,1,"P"],[119,3,"P"]] }),
  loadPosition({ id: "interception", tags: [], pieces: [[35,0,"K"],[108,1,"K"],[185,2,"K"],[153,3,"K"],[79,0,"P"],[119,2,"P"]] }),
];
for (const state of validation) for (const rotation of ALL_COLORS) assertLocalMigrationState(rotated(state, rotation));
const adapter = (id: string, choose: typeof chooseBoundedCpuMove): ArenaEngine => ({ id, config: limits,
  choose: (state, random) => { const r = choose(state, 3, limits, random); return { move: r.move, stats: { ...r.diagnostics, depthReached: r.diagnostics.completedDepth } }; } });
const a = adapter("baseline-9a49a80", baselineChoose), b = adapter("pawn-plans-v1", chooseBoundedCpuMove);

function shuffleMetrics(game: GameRecord) {
  let state = game.initial, quietRun = 0, maxQuietRun = 0, planMisses = 0, returns = 0, progress = 0;
  const lastKing = new Map<number, number>();
  for (const record of game.moves) {
    const m = record.move, next = applyMove(state, m);
    if (m.piece.type === PieceType.Pawn || m.captured) progress++;
    if (m.piece.type === PieceType.King && !m.captured) {
      maxQuietRun = Math.max(maxQuietRun, ++quietRun);
      if (lastKing.get(m.piece.owner) === m.to) returns++;
      lastKing.set(m.piece.owner, m.from);
      const before = pawnEndgameScore(state, state.turn);
      if (pawnEndgameScore(next, state.turn) <= before && legalMoves(state).some(p => {
        if (p.piece.type !== PieceType.Pawn) return false;
        const after = applyMove(state, p);
        return !after.result && pawnEndgameScore(after, state.turn) > before && !legalMoves(after).some(reply => reply.to === p.to && reply.captured);
      })) planMisses++;
    } else quietRun = 0;
    state = next;
  }
  return { maxQuietRun, kingReturns: returns, planMissProxy: planMisses, progressMoves: progress };
}
const games: GameRecord[] = [], observations: unknown[] = [];
async function record(label: string, seats: Seats, initial: GameState, seed: number) {
  const game = await runGame(seats, { initial, seed, maxPlies: 160 }); await replay(game);
  if (game.termination === "error") throw new Error(game.error);
  appendFileSync(resolve(out, "games.jsonl.gz"), gzipSync(JSON.stringify({ label, ...game }) + "\n"));
  const metrics = shuffleMetrics(game);
  observations.push({ label, seed, termination: game.termination, plies: game.plies, result: game.result, ...metrics });
  console.log(JSON.stringify({ label, seed, termination: game.termination, plies: game.plies, ...metrics }));
  return game;
}
const original = await reconstructEndgameReplay();
writeFileSync(resolve(out, "reproduction.json"), JSON.stringify({ hash: original.sourceReplayHash, producer: original.producer, moves: 240, reversible: 77, maxRepetition: 2 }, null, 2));
if (!reverse) {
  await record("replay-baseline", [a,a,a,a], original.state, 41);
  await record("replay-candidate-cpus", [a,b,b,b], original.state, 41);
}
for (let i = 0; i < validation.length; i++) for (const rotation of ALL_COLORS) for (const seed of [701, 1709]) {
  let initial = rotated(validation[i], rotation);
  const random = seededRandom(seed);
  for (let p = 0; p < 4 && !initial.result; p++) { const moves = legalMoves(initial); initial = applyMove(initial, moves[Math.floor(random() * moves.length)]); }
  const seats = (seed === 701 ? [a,a,b,b] : [a,b,a,b]).map((_, c, arr) => {
    const engine = arr[(c + rotation) % 4]; return reverse ? engine === a ? b : a : engine;
  }) as unknown as Seats;
  games.push(await record(`validation-${i}-rotation-${rotation}`, seats, initial, seed));
}
const tactics: { position: string; rotation: number; id: string; matches: boolean; move: Move; diagnostics: CpuDiagnostics }[] = [];
const timing: (CpuDiagnostics & { id: string; level: number; sample: number })[] = [];
for (const spec of reverse ? [] : positions) for (const rotation of ALL_COLORS) {
  const state = rotated(loadPosition(spec), rotation);
  // These are evaluation/legality probes, not opening perft evidence.
  for (const [id, choose] of [[a.id, baselineChoose], [b.id, chooseBoundedCpuMove]] as const) {
    const result = choose(state, 3, { ...limits, timeMs: null }, seededRandom(9001));
    const originalMove = legalMoves(loadPosition(spec)).find(m =>
      localSquare(rotation, m.from % 14 - 3, Math.floor(m.from / 14)) === result.move.from &&
      localSquare(rotation, m.to % 14 - 3, Math.floor(m.to / 14)) === result.move.to);
    const matches = !!originalMove && (!spec.expect || Object.entries(spec.expect).every(([k,v]) => originalMove[k as keyof typeof originalMove] === v)) &&
      (!spec.avoid || originalMove.from !== spec.avoid.from || originalMove.to !== spec.avoid.to);
    tactics.push({ position: spec.id, rotation, id, matches, move: result.move, diagnostics: result.diagnostics });
  }
}
for (const state of reverse ? [] : [original.state, ...validation]) for (const level of [3,4,5] as const) for (let sample = 0; sample < 3; sample++) {
  const order = sample % 2 ? [[b.id, chooseBoundedCpuMove], [a.id, baselineChoose]] as const : [[a.id, baselineChoose], [b.id, chooseBoundedCpuMove]] as const;
  for (const [id, choose] of order) timing.push({ id, level, sample, ...choose(state, level, CPU_POLICIES[level], seededRandom(8000 + sample)).diagnostics });
}
writeFileSync(resolve(out, "observations.json"), JSON.stringify({ observations, tactics, timing }, null, 2));
writeFileSync(resolve(out, "summary.json"), JSON.stringify({ validation: await aggregate(games),
  tactics: [a,b].map(e => ({ id: e.id, passed: tactics.filter(t => t.id === e.id && t.matches).length, total: tactics.filter(t => t.id === e.id).length })),
  timing: [a,b].map(e => ({ id: e.id, elapsed: distribution(timing.filter(t => t.id === e.id).map(t => t.elapsedMs)), fallbacks: timing.filter(t => t.id === e.id && t.fallback).length })),
}, null, 2));
