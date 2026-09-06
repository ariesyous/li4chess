import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { cpus } from "node:os";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { chooseCpuMove, DIFFICULTY_PRESETS } from "@li4chess/bot";
import { aggregate, ArenaEngine, replay, tournament } from "./index.js";
import { classic } from "./engines.js";

// Four distinct adjacent AABB rotations per seed. This is a smoke comparison,
// not a strength estimate; opposite ABAB seating needs a separate experiment.
const [out, count = "1", cap = "250"] = process.argv.slice(2);
if (!out || !Number.isInteger(+count) || +count < 1 || !Number.isInteger(+cap) || +cap < 1) {
  throw new Error("Usage: vite-node src/compare-production.ts <new-output-directory> [seeds=1] [plies=250]");
}
mkdirSync(out, { recursive: true });
// Exclusive creation prevents a second process from appending into this run.
writeFileSync(resolve(out, "run.json"), JSON.stringify({
  started: new Date().toISOString(), pid: process.pid, node: process.version,
  cpu: cpus()[0]?.model, seeds: +count, maxPlies: +cap, geometry: "adjacent AABB, four cyclic rotations",
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  note: "Both bots use the post-PR-8 rules engine. One seed is not a strength estimate.",
}, null, 2), { flag: "wx" });
const production: ArenaEngine = {
  id: "production-v2-level3", config: DIFFICULTY_PRESETS[3],
  choose: (state, random) => ({ move: chooseCpuMove(state, state.turn, 3, random) }),
};
const baseline = classic(3);
console.log(`Started PID ${process.pid}: ${+count * 4} games, ${cap}-ply cap, output ${resolve(out)}`);
const games = await tournament([production, production, baseline, baseline],
  Array.from({ length: +count }, (_, i) => i + 1), +cap, undefined, game => {
    replay(game);
    appendFileSync(resolve(out, "games.jsonl.gz"), gzipSync(JSON.stringify(game) + "\n"));
    console.log(`seed ${game.seed}, seats ${game.engines.map(e => e.id).join(",")}: ${game.termination}, ${game.plies} plies, ${(game.elapsedMs / 1000).toFixed(1)}s; replay verified`);
  });
const summary = aggregate(games);
writeFileSync(resolve(out, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (summary.errors) process.exitCode = 1;
