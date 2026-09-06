import { appendFileSync, writeFileSync } from "node:fs";
import { createRunDirectory } from "@li4chess/protocol/node";
import { resolve } from "node:path";
import { aggregate, replay, Seats, tournament } from "./index.js";
import { classic, randomEngine } from "./engines.js";

// Positional arguments: output directory, seed count, ply cap, four comma-separated engine IDs.
const [out = "arena-results/run", count = "1", cap = "160", names = "random-v1,random-v1,random-v1,classic-v1-level1"] = process.argv.slice(2);
const registry = [randomEngine, ...([1,2,3,4,5] as const).map(classic)];
const seats = names.split(",").map(id => {
  const engine = registry.find(e => e.id === id); if (!engine) throw new Error(`Unknown engine ${id}`); return engine;
});
if (seats.length !== 4 || !Number.isInteger(+count) || +count < 1) throw new Error("Require four engines and positive seed count");
createRunDirectory(out);
const log = resolve(out, "games.jsonl");
writeFileSync(log, "", { flag: "wx" }); // Never silently overwrite experimental evidence.
const games = await tournament(seats as unknown as Seats, Array.from({length: +count}, (_,i) => i+1), +cap, undefined,
  async game => { await replay(game); appendFileSync(log, JSON.stringify(game) + "\n"); console.log(`seed ${game.seed} ${game.termination} ${game.plies} plies; replay-v2 verified`); });
const report = await aggregate(games);
writeFileSync(resolve(out, "summary.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
