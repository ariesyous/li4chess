import { readdirSync, readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { aggregate, GameRecord, replay } from "./index.js";

throw new Error("Historical archive utility is read-only in M1: use its producing revision. Never rewrite docs/engine/results with the current engine.");

const destination=resolve(process.argv[2] ?? "../../docs/engine/results");
mkdirSync(destination,{recursive:true});
const manifest:{file:string;sha256:string;bytes:number}[]=[];
function save(name:string,bytes:Uint8Array|string) {
  writeFileSync(resolve(destination,name),bytes);
  manifest.push({file:name,sha256:createHash("sha256").update(bytes).digest("hex"),bytes:Buffer.byteLength(bytes)});
}
const all:GameRecord[]=[];const summaries=[];
for (const directory of ["baseline-smoke","sparse-v1","opening-v1","relative-v1"]) {
  const root=resolve("arena-results",directory);
  const logs=readdirSync(root).filter(p=>p.endsWith(".jsonl"));
  for (const log of logs) {
    const bytes=readFileSync(resolve(root,log));
    const games=bytes.toString("utf8").trim().split("\n").map(l=>JSON.parse(l) as GameRecord);
    for (const game of games) await replay(game);
    all.push(...games);summaries.push({suite:directory,log,report:await aggregate(games)});
    save(`${directory}-${log}.gz`,gzipSync(bytes,{level:9}));
  }
  for (const file of ["manifest.json","ablation-bench.json","bench.json"]) {
    if (existsSync(resolve(root,file))) save(`${directory}-${file}`,readFileSync(resolve(root,file)));
  }
}
save("game-summaries.json",JSON.stringify(summaries,null,2));
save("totals.json",JSON.stringify({games:all.length,plies:all.reduce((n,g)=>n+g.plies,0),
  completed:all.filter(g=>g.result).length,soleWins:all.filter(g=>g.result?.winner!==null && g.result!==null).length,
  censored:all.filter(g=>g.termination==="max-ply").length,errors:all.filter(g=>g.termination==="error").length,
  durationMs:all.reduce((n,g)=>n+g.elapsedMs,0)},null,2));
for (const [source,name] of [["idle-bench/benchmark.json","benchmark.json"],["final-bench/benchmark.json","earlier-benchmark.json"],
  ["idle-ablation/ablation-bench.json","ablation-bench.json"],["classic-bench/timings.jsonl","classic-timings.jsonl"],
  ["classic-bench/timeout.json","classic-timeout.json"],["classic-watchdog/timings.jsonl","classic-watchdog.jsonl"]])
  save(name,readFileSync(resolve("arena-results",source)));
const profile=JSON.parse(readFileSync(resolve("arena-results/baseline.cpuprofile"),"utf8"));
const groups=new Map<string,number>();
for (const n of profile.nodes) {
  if (!n.callFrame.url.includes("/packages/engine/") && !n.callFrame.url.includes("/packages/bot/")) continue;
  const name=n.callFrame.functionName||"anonymous";groups.set(name,(groups.get(name)??0)+(n.hitCount??0));
}
const total=[...groups.values()].reduce((a,b)=>a+b,0);
save("profile-summary.json",JSON.stringify({kind:"V8 self samples in engine/bot source only",total,
  functions:[...groups].sort((a,b)=>b[1]-a[1]).map(([name,samples])=>({name,samples,fraction:samples/total}))},null,2));
save("manifest.json",JSON.stringify({schema:1,date:new Date().toISOString(),baseline:"867b4cb6e4599e9fd006cde1951309bb90b27718",
  note:"Curated experimental evidence; archives contain oracle-verified JSONL replays. Timing trials are descriptive, not strength evidence.",files:manifest},null,2));
console.log(readFileSync(resolve(destination,"totals.json"),"utf8"));
