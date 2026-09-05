import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { chooseClassicMove, loadPosition, positions } from "@li4chess/bot";

const [out="arena-results/classic-bench", budget="30000", levelArg] = process.argv.slice(2);
if (out==="worker") {
  const state=loadPosition(positions.find(p=>p.id===budget)!);const start=performance.now();
  const level=+levelArg as 1|2|3|4|5;
  const move=chooseClassicMove(state,state.turn,level,()=>1);
  console.log(JSON.stringify({id:budget,level,elapsedMs:performance.now()-start,move}));
} else {
  if (!Number.isFinite(+budget) || +budget<=0) throw new Error("Positive process timeout required");
  mkdirSync(out,{recursive:true}); const log=resolve(out,"timings.jsonl");writeFileSync(log,"",{flag:"wx"});
  for (const id of ["king-endgame","opening"]) for (const level of [1,2,3,4,5] as const) {
    const started=performance.now();
    let row:unknown;
    try {
      const output=execFileSync(process.execPath,["node_modules/vite-node/vite-node.mjs","src/classic-bench.ts","worker",id,String(level)],
        {timeout:+budget,encoding:"utf8",windowsHide:true});
      row=JSON.parse(output.trim());
    } catch (error) {
      const e=error as Error & {code?:string};
      row={id,level,termination:e.code==="ETIMEDOUT" ? "process-timeout" : "error",processElapsedMs:performance.now()-started,error:e.message};
    }
    appendFileSync(log,JSON.stringify(row)+"\n"); console.log(JSON.stringify(row));
  }
}
