import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cpus, platform, arch } from "node:os";
import { gzipSync } from "node:zlib";
import { ALL_COLORS, PieceType, createInitialState, legalMoves, applyMove, isPlayerInCheck } from "@li4chess/engine";
import { readReplay, engineState } from "@li4chess/protocol";
import type { GameState, Move } from "@li4chess/engine";
import { packResearchState, researchCapability, decodeMove, matchCandidate, fromMailbox, canUseTetrarch } from "../src/index.js";
import { ResearchWasm, type WasmModule } from "../src/wasm.js";

const root = resolve("../..");
const output = resolve(process.argv[2] ?? "../../arena-results/tetrarch-proof");
mkdirSync(output, { recursive: false }); // Never overwrite evidence.
const modulePath = resolve(".generated/tetrarch.mjs");
const factory = (await import(modulePath)).default as (options: unknown) => Promise<WasmModule>;
const wasmBytes = readFileSync(".generated/tetrarch.wasm");
const initStart = performance.now();
const wasm = new ResearchWasm(await factory({ wasmBinary: wasmBytes }), readFileSync("vendor/tetrarch/params.bin"), readFileSync("vendor/tetrarch/net-ffa1.nnue"));
const initializationMs = performance.now() - initStart;
const identity = (m: Pick<Move,"from"|"to"|"promotion">) => `${m.from}:${m.to}:${m.promotion ?? ""}`;
const reference = JSON.parse(readFileSync("vendor/tetrarch/reference.json", "utf8")) as { setup:string; squares:number[]; evaluation:number }[];
const nnue = reference.map(r => {
  const meta = new Int32Array(18); meta.fill(1,4,16);
  wasm.setPosition(new Uint8Array(r.squares), meta);
  const actual = wasm.evaluate(); assert.equal(actual, r.evaluation);
  return { setup: r.setup, expected: r.evaluation, actual, matched: true };
});

const stats = { positions:0, rootRepresentable:0, canonicalLegalMoves:0, externalLegalMoves:0, exactMatches:0,
  explainedMismatches:0, unexplainedMismatches:0, unsupported:0, productionSupported:0,
  coverage: { passiveArmy:0, promotionAvailable:0, castleAvailable:0, inCheck:0, noLegalMoves:0 },
  categories:{} as Record<string,number>, samples:[] as unknown[] };
function inspect(state: GameState, label: string) {
  stats.positions++;
  if (isPlayerInCheck(state,state.turn)) stats.coverage.inCheck++;
  if (ALL_COLORS.some(c => state.players[c].status !== "active")) stats.coverage.passiveArmy++;
  assert.equal(canUseTetrarch(state).supported,false);
  const reasons = researchCapability(state);
  if (reasons.length) {
    stats.unsupported++;
    for (const reason of reasons) stats.categories[reason] = (stats.categories[reason] ?? 0) + 1;
    return;
  }
  stats.rootRepresentable++;
  const packed = packResearchState(state); wasm.setPosition(packed.squares, packed.meta);
  const legal = legalMoves(state);
  if (legal.some(m => m.promotion)) stats.coverage.promotionAvailable++;
  if (legal.some(m => m.castle)) stats.coverage.castleAvailable++;
  if (!legal.length) stats.coverage.noLegalMoves++;
  const canonical = legal.map(identity).sort();
  const externalRaw = wasm.legal();
  const external = externalRaw.map(decodeMove).map(identity).sort();
  stats.canonicalLegalMoves += canonical.length; stats.externalLegalMoves += external.length;
  const missing = canonical.filter(m => !external.includes(m));
  const extra = external.filter(m => !canonical.includes(m));
  if (!missing.length && !extra.length) { stats.exactMatches++; return; }
  const activeKingOnly = missing.length === 0 && extra.every(id => {
    const target = state.board[Number(id.split(":")[1])];
    return target?.type === PieceType.King && state.players[target.owner].status === "active";
  });
  const category = activeKingOnly ? "active-king-capture" : "unexplained";
  stats.categories[category] = (stats.categories[category] ?? 0) + 1;
  if (activeKingOnly) stats.explainedMismatches++; else stats.unexplainedMismatches++;
  if (stats.samples.length < 12 || !activeKingOnly) stats.samples.push({ label, category, missing, extra, state });
}

// Existing checked-in tactical corpus, read as data (no historical timing claims).
const corpus=JSON.parse(readFileSync(join(root,"packages/bot/src/positions.json"),"utf8")) as {
  id:string;initial?:boolean;turn?:number;pieces?:[number,number,PieceType][];inactive?:number[]
}[];
for (const spec of corpus) {
  const base=createInitialState();
  if(spec.initial) { inspect(base,`existing-${spec.id}`); continue; }
  const board:GameState["board"][number][]=Array(196).fill(null);
  for(const [square,owner,type] of spec.pieces ?? []) board[square]={owner,type,hasMoved:true};
  const players={...base.players};
  for(const c of spec.inactive ?? []) players[c as 0|1|2|3]={...players[c as 0|1|2|3],status:"checkmated",eliminatedOnTurn:0};
  inspect({...base,board,players,turn:spec.turn ?? 0,castlingRights:Object.fromEntries(ALL_COLORS.map(c=>[c,{kingside:false,queenside:false}])) as GameState["castlingRights"]},`existing-${spec.id}`);
}
const replayPath=join(root,"packages/arena/fixtures/endgame/user-replay-v2.json");
const replay=await readReplay(JSON.parse(readFileSync(replayPath,"utf8")));
inspect(engineState(replay.state),"existing-validated-user-replay-checkpoint");

// All five upstream setups, with all four turns. These are analysis roots,
// not claims that li4chess has a user-facing setup selector.
for (const ref of reference) {
  const initial = createInitialState();
  const board = [...initial.board].map(() => null) as (GameState["board"][number])[];
  ref.squares.forEach((p,s) => { if (p) board[fromMailbox(s)] = { owner:Math.floor((p-1)/7), type:"PNBRQK"[(p-1)%7] as PieceType, hasMoved:false }; });
  for (const turn of ALL_COLORS) inspect({ ...initial, board, turn }, `${ref.setup}-turn-${turn}`);
}

// Independent rotated active-king capture witnesses and promotion/castling roots.
for (const turn of ALL_COLORS) {
  const base = createInitialState();
  const board = base.board.map(p => p?.type === PieceType.King ? p : null);
  let f=6,r=9;
  for (let i=0;i<turn;i++) [f,r]=[r,13-f];
  board[r*14+f] = {type:PieceType.Rook,owner:turn,hasMoved:true};
  const state = { ...base, board, turn, castlingRights:Object.fromEntries(ALL_COLORS.map(c => [c,{kingside:false,queenside:false}])) as GameState["castlingRights"] };
  inspect(state, `king-capture-${turn}`);
  const packed = packResearchState(state); wasm.setPosition(packed.squares,packed.meta);
  const illegal = wasm.legal().find(raw => !matchCandidate(state,raw).move);
  assert.notEqual(illegal,undefined, "Must reproduce active king capture in every orientation");
  assert.ok(matchCandidate(state,illegal!).diagnostic);
  const castleBoard=base.board.map(p => p?.type===PieceType.King || p?.type===PieceType.Rook ? p : null);
  inspect({...base,board:castleBoard,turn}, `castling-${turn}`);
  let pf=5,pr=6; for(let i=0;i<turn;i++) [pf,pr]=[pr,13-pf];
  const promotionBoard=base.board.map(p=>p?.type===PieceType.King?p:null);
  promotionBoard[pr*14+pf]={type:PieceType.Pawn,owner:turn,hasMoved:true};
  inspect({...state,board:promotionBoard},`promotion-${turn}`);
}

// Seeded canonical playouts: captures, checks, promotions and passive armies
// arise through the oracle. No external move is ever applied.
for (let seed=1;seed<=24;seed++) {
  let rng=seed, state=createInitialState();
  for(let ply=0;ply<180 && !state.result;ply++) {
    inspect(state,`seed-${seed}-ply-${ply}`);
    const moves=legalMoves(state); if(!moves.length) break;
    rng=(Math.imul(rng,1664525)+1013904223)>>>0;
    state=applyMove(state,moves[rng % moves.length]);
  }
  inspect(state,`seed-${seed}-final`);
}

const initial=createInitialState(); const packed=packResearchState(initial);
wasm.setPosition(packed.squares,packed.meta);
const deterministic=wasm.search({nodeBudget:10000,maxDepth:12});
assert.ok(matchCandidate(initial,deterministic.best!).move);
wasm.setPosition(packed.squares,packed.meta);
const repeat=wasm.search({nodeBudget:10000,maxDepth:12});
assert.equal(repeat.best,deterministic.best); assert.equal(repeat.nodes,deterministic.nodes); assert.equal(repeat.depth,deterministic.depth);
assert.ok(deterministic.nodes<=10000);
writeFileSync(join(output,"parity.json"),JSON.stringify(stats,null,2)+"\n");
const budgets=[];
for(const timeMs of [100,250,500,1000,3000,5000,10000,15000,30000]) {
  wasm.setPosition(packed.squares,packed.meta);
  const result=wasm.search({nodeBudget:1_000_000_000,maxDepth:32,timeMs});
  budgets.push({requestedMs:timeMs,...result,budgetOverrunMs:Math.max(0,result.elapsedMs-timeMs), canonicalLegal:!!matchCandidate(initial,result.best!).move});
  writeFileSync(join(output,"budgets.partial.json"),JSON.stringify(budgets,null,2)+"\n");
  console.log(JSON.stringify(budgets.at(-1)));
}
const hashes:Record<string,string>={};
function hashTree(dir:string) { for(const entry of readdirSync(dir,{withFileTypes:true})) {
  if(["node_modules","dist",".generated"].includes(entry.name)) continue;
  const path=join(dir,entry.name); if(entry.isDirectory()) hashTree(path); else hashes[path.slice(root.length+1).replaceAll("\\","/")]=createHash("sha256").update(readFileSync(path)).digest("hex");
} }
hashTree(resolve("src")); hashTree(resolve("scripts")); hashTree(resolve("native")); hashTree(resolve("vendor")); hashTree(join(root,"packages/engine/src"));
hashes["packages/bot/src/positions.json"]=createHash("sha256").update(readFileSync(join(root,"packages/bot/src/positions.json"))).digest("hex");
hashes["packages/arena/fixtures/endgame/user-replay-v2.json"]=createHash("sha256").update(readFileSync(replayPath)).digest("hex");
hashTree(join(root,"packages/protocol/src"));
const report={revision:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(), dirty:true,
  environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0].model},hashes,
  wasm:{bytes:wasmBytes.length,gzipBytes:gzipSync(wasmBytes).length,sha256:createHash("sha256").update(wasmBytes).digest("hex"),initializationMs,
    parameterAndNetInitializationMs:wasm.initializationMs,nnueLoadMs:wasm.nnueLoadMs,memoryBytes:wasm.memoryBytes()},
  nnue,stats,deterministic,budgets,decision:"NO-GO: unmodified v8 search semantics; no production supported subset"};
writeFileSync(join(output,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({...stats,samples:stats.samples.length}));
