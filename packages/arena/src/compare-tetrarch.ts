import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { applyMove, createInitialState, legalMoves, positionKey } from "@li4chess/engine";
import { createRunDirectory, readBuildIdentity, runtimeEnvironment } from "@li4chess/protocol/node";
import { aggregate, distribution, replay, runGame, seededRandom, tournament } from "./index.js";
import type { GameRecord } from "./index.js";
import { boundedProduction, tetrarchHybrid } from "./tetrarch.js";

const [out, count = "4", cap = "400"] = process.argv.slice(2);
if (!out || !Number.isInteger(+count) || +count < 1 || !Number.isInteger(+cap) || +cap < 1)
  throw new Error("Usage: compare-tetrarch <new-output-directory> [seeds=4] [plies=400]");
createRunDirectory(out);
const native = boundedProduction(), hybrid = tetrarchHybrid();
const root = fileURLToPath(new URL("../../../", import.meta.url));
const assets = [".generated/tetrarch.wasm", ".generated/tetrarch.mjs", "vendor/tetrarch/params.bin", "vendor/tetrarch/net-ffa1.nnue"]
  .map(path => { const bytes = readFileSync(resolve(root,"packages/tetrarch-engine",path));
    return { path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }; });
writeFileSync(resolve(out,"run.json"), JSON.stringify({ started: new Date().toISOString(), pid: process.pid,
  engineBuild: readBuildIdentity(), environment: runtimeEnvironment(), assets,
  seeds: Array.from({ length: +count }, (_, i) => i + 1), maxPlies: +cap, openingPlies: 8,
  geometry: "one hybrid / three bounded production, four rotations; one all-native control per opening",
  configurations: [hybrid.config, native.config],
  limitation: "Small configuration comparison; unequal nodes, wall-limited native search, no Elo or full-strength claim. Capped games are censored.",
}, null, 2), { flag: "wx" });
const mixed: GameRecord[] = [], controls: GameRecord[] = [];
async function save(game: GameRecord, group: string) {
  await replay(game);
  appendFileSync(resolve(out,`${group}.jsonl.gz`), gzipSync(JSON.stringify(game)+"\n"));
  console.log(`${group} seed ${game.seed} hybrid seat ${game.engines.findIndex(e=>e.id===hybrid.id)}: ${game.termination}, ${game.plies} plies, ${(game.elapsedMs/1000).toFixed(1)}s; replay verified`);
}
function routing(games: GameRecord[]) {
  const turns = games.flatMap(g=>g.moves.filter(m=>g.engines[m.color].id===hybrid.id && m.source==="engine"));
  const reasons: Record<string,number> = {}, unsupported: Record<string,number> = {};
  for (const m of turns) if (m.stats?.fallback) {
    const reason = String(m.stats.fallbackReason); reasons[reason]=(reasons[reason]??0)+1;
    const capability = m.stats.capability as { reasons: string[] };
    for (const r of capability.reasons) unsupported[r]=(unsupported[r]??0)+1;
  }
  const accepted=turns.filter(m=>m.stats?.fallback===false);
  return { turns:turns.length, accepted:accepted.length, fallback:turns.length-accepted.length, reasons, unsupported,
    acceptedMs:distribution(accepted.map(m=>m.elapsedMs)),
    fallbackMs:distribution(turns.filter(m=>m.stats?.fallback).map(m=>m.elapsedMs)) };
}
// Descriptive movement statistics, not a proxy for strength. Canonical history determines repeats.
function movement(games: GameRecord[]) {
  return [...new Set(games.flatMap(g=>g.engines.map(e=>e.id)))].map(id=>{
    let moves=0, reversedPreviousOwnMove=0, revisitedPosition=0;
    for (const g of games) {
      let state=g.initial;
      const previous=new Map<number,{from:number;to:number}>();
      for (const record of g.moves) {
        const next=applyMove(state,record.move);
        if (g.engines[record.color].id===id) {
          moves++;
          const old=previous.get(record.color);
          if(old?.from===record.move.to && old.to===record.move.from) reversedPreviousOwnMove++;
          if((state.positionCounts[positionKey(next)]??0)>0) revisitedPosition++;
        }
        previous.set(record.color,record.move); state=next;
      }
    }
    return {id,moves,reversedPreviousOwnMove,revisitedPosition};
  });
}
try {
  for(let seed=1;seed<=+count;seed++) {
    let initial=createInitialState(); const random=seededRandom(seed);
    for(let ply=0;ply<8;ply++) { const moves=legalMoves(initial); initial=applyMove(initial,moves[Math.floor(random()*moves.length)]); }
    mixed.push(...await tournament([hybrid,native,native,native],[seed],+cap,initial,g=>save(g,"mixed")));
    const control=await runGame([native,native,native,native],{seed,maxPlies:+cap,initial});
    controls.push(control); await save(control,"controls");
  }
  const summary={mixed:await aggregate(mixed),controls:await aggregate(controls),routing:routing(mixed),
    movement:{mixed:movement(mixed),controls:movement(controls)}};
  writeFileSync(resolve(out,"summary.json"),JSON.stringify(summary,null,2),{flag:"wx"});
  console.log(JSON.stringify(summary,null,2));
  if(summary.mixed.errors || summary.controls.errors) process.exitCode=1;
} finally { hybrid.close(); }
