import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { aggregate, GameRecord, replay } from "./index.js";
const path=process.argv[2]; if (!path) throw new Error("Pass a JSONL or JSONL.gz replay log");
const bytes=readFileSync(path);
const games=(path.endsWith(".gz") ? gunzipSync(bytes) : bytes).toString("utf8").trim().split("\n").filter(Boolean).map(line=>JSON.parse(line) as GameRecord);
for (const game of games) replay(game);
console.log(JSON.stringify(aggregate(games),null,2));
