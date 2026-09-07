import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { createInitialState, legalMoves, localSquare, PieceType } from "@li4chess/engine";
import { canonicalJson, createReplay, engineState, readReplay, stateHash } from "@li4chess/protocol";
import type { ActionRequest, ReplayEventV2 } from "@li4chess/protocol";
import { assertBuildUnchanged, readBuildIdentity, runtimeEnvironment } from "@li4chess/protocol/node";
import { creationBoundary, digest, exactReader, prepareCommand, LIMITS } from "../src/index.js";
import type { Boundary, GameHeader, Prepared, Receipt } from "../src/index.js";
import { root, run, signals, start } from "./runtime.js";

signals();
const same = (a: unknown, b: unknown) => assert.equal(canonicalJson(a), canonicalJson(b));
assert(Number(process.versions.node.split(".")[0]) >= 24);
const producer = readBuildIdentity(root);
const output = process.env.M3_03_OUTPUT ?? resolve(root, `arena-results/m3-03-${Date.now()}`);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // Reject existing evidence, even if empty.
const key = Buffer.from(randomBytes(32)).toString("hex");
const generated = resolve(root, "packages/persistence/.generated", `run-${Date.now()}`);
await mkdir(generated, { recursive: true });
const migrations = resolve(generated, "migrations"); await mkdir(migrations);
await cp(resolve(root, "packages/persistence/migrations/0001_canonical.sql"), resolve(migrations, "0001_canonical.sql"));
const config = resolve(generated, "wrangler.json"); const persistence = resolve(output, "runtime");
const configuration = { name: "li4chess-persistence-test", main: resolve(import.meta.dirname, "worker.ts"),
  compatibility_date: "2026-09-01", workers_dev: false, preview_urls: false,
  d1_databases: [{ binding: "DB", database_name: "m3-03-test", database_id: "00000000-0000-0000-0000-000000000003", migrations_dir: migrations }],
  vars: { TEST_KEY: key, PRODUCER: producer } };
await writeFile(config, JSON.stringify(configuration));
await writeFile(resolve(output, "configuration.json"), JSON.stringify({ ...configuration, vars: { ...configuration.vars, TEST_KEY: "[redacted]" } }, null, 2));
const sourceFiles: Record<string, string> = {};
for (const file of execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))
  sourceFiles[file] = Buffer.from(await readFile(resolve(root, file))).toString("base64");
await writeFile(resolve(output, "source.json.gz"), gzipSync(JSON.stringify({ producer, files: sourceFiles })));
const require = createRequire(import.meta.url);
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ producer, environment: runtimeEnvironment(), limits: LIMITS,
  command: "pnpm --filter @li4chess/persistence test:integration", pnpm: process.env.npm_config_user_agent,
  wrangler: require(resolve(root, "node_modules/wrangler/package.json")).version,
  workerd: require(require.resolve("workerd/package.json", { paths: [resolve(root, "node_modules/wrangler")] })).version }, null, 2));
let logs = ""; const log = (text: string) => { logs += text; };
const observations: unknown[] = []; const note = (message: string, details?: unknown) => {
  observations.push({ message, details }); process.stdout.write(`${message}\n`);
};
const migrationArgs = ["d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persistence];
await run(migrationArgs, log);
let runtime = await start(config, persistence, key, producer.buildFingerprint!, log);
let starts = 1;
const rpcSamples: { operation: string; elapsedMs: number; requestBytes: number; responseBytes: number; status: number }[] = [];
async function rpc<T = unknown>(body: unknown, status = 200): Promise<T> {
  const serialized = JSON.stringify(body); const started = performance.now();
  const response = await fetch(runtime.url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: serialized, signal: AbortSignal.timeout(120000) });
  const responseText = await response.text();
  rpcSamples.push({ operation: (body as { op: string }).op, elapsedMs: performance.now() - started,
    requestBytes: Buffer.byteLength(serialized), responseBytes: Buffer.byteLength(responseText), status: response.status });
  const value = JSON.parse(responseText) as { result: T; error?: string };
  assert.equal(response.status, status, JSON.stringify(value)); return (status === 200 ? value.result : value.error) as T;
}
async function sql(sql: string, values: (string | number | null)[] = []) {
  return rpc<{ results: Record<string, unknown>[]; meta: unknown }>({ op: "sql", sql, values });
}
const owner = { namespace: "test-room", generation: 1 };
const stable = (p: Prepared) => { const { admittedAt: _admission, ...request } = p.record.input; return request; };
async function create(id: string): Promise<Boundary> {
  const header: GameHeader = { format: "li4chess-d1-game-v1", gameId: id, replay: await createReplay(createInitialState(), producer) };
  const boundary = await creationBoundary(header, exactReader(producer));
  same(await rpc({ op: "create", header, owner }), boundary); return boundary;
}
async function prepare(boundary: Boundary, action?: ActionRequest, id = `c${boundary.head.command + 1}`) {
  const state = engineState(boundary.state); const move = legalMoves(state)[0];
  return prepareCommand(boundary, owner, { id, caller: { kind: "server", principal: "test-server" }, admittedAt: boundary.head.command * 1000, expectedCommand: boundary.head.command,
    action: action ?? { type: "move", actor: state.turn, move: { from: move.from, to: move.to } } }, producer);
}
async function accept(boundary: Boundary, action?: ActionRequest) {
  const next = await prepare(boundary, action); same(await rpc({ op: "commit", prepared: next.prepared }), next.prepared.receipt); return next;
}
async function counts(id: string) {
  return (await sql(`SELECT (SELECT count(*) FROM commands WHERE game_id=?) commands,
    (SELECT count(*) FROM events WHERE game_id=?) events,(SELECT count(*) FROM checkpoints WHERE game_id=?) checkpoints,
    (SELECT count(*) FROM results WHERE game_id=?) results,command_seq,event_seq,chain_hash FROM games WHERE id=?`, [id,id,id,id,id])).results;
}
let failed: unknown;
try {
  // Populate v1, then upgrade via actual Wrangler ledger; a second apply is a no-op.
  let baseline = await create("migration"); const first = await accept(baseline); baseline = first.next;
  await runtime.stop();
  await cp(resolve(root, "packages/persistence/migrations/0002_recovery_index.sql"), resolve(migrations, "0002_recovery_index.sql"));
  await run(migrationArgs, log); await run(migrationArgs, log);
  runtime = await start(config, persistence, key, producer.buildFingerprint!, log); starts++;
  same(await rpc({ op: "recover", gameId: "migration" }), baseline);
  same(await rpc({ op: "receipt", gameId: "migration", input: first.prepared.record.input }), first.prepared.receipt);
  same(await rpc({ op: "lookup", gameId: "migration", request: stable(first.prepared) }), { input: first.prepared.record.input, receipt: first.prepared.receipt });
  assert.equal(await rpc({ op: "lookup", gameId: "migration", request: { ...stable(first.prepared), id: "absent" } }), null);
  await rpc({ op: "lookup", gameId: "migration", request: { ...stable(first.prepared), admittedAt: 0 } }, 409);
  await sql("INSERT INTO users VALUES ('user-1', 1)"); await sql("INSERT INTO identities VALUES ('fixture','subject','user-1')");
  await rpc({ op: "sql", sql: "INSERT INTO identities VALUES ('fixture','other','missing')" }, 409);
  note("Version 1 populated, additive v2 applied, reapply no-op, rows/receipts and identity foreign keys verified");

  const terminalBase = await create("rollback"); const terminal = await prepare(terminalBase, { type: "resign", actor: 0 });
  const before = await counts("rollback");
  await rpc({ op: "commit", prepared: terminal.prepared, fault: true }, 409);
  same(await counts("rollback"), before);
  assert.equal(await rpc({ op: "reconcile", prepared: terminal.prepared }), "absent");
  await rpc({ op: "commit", prepared: terminal.prepared, lostAck: true }, 503);
  assert.equal(await rpc({ op: "reconcile", prepared: terminal.prepared }), "committed");
  same(await rpc({ op: "commit", prepared: terminal.prepared }), terminal.prepared.receipt);
  same(await rpc({ op: "recover", gameId: "rollback" }), terminal.next);
  same(await rpc({ op: "lookup", gameId: "rollback", request: stable(terminal.prepared) }), { input: terminal.prepared.record.input, receipt: terminal.prepared.receipt });
  note("Late SQL failure rolls back command, effects, checkpoint, result and head; lost acknowledgement reconciles exact bytes");

  const competing = await create("competing"); const a = await prepare(competing, undefined, "a"); const b = await prepare(competing, undefined, "b");
  const winners = await Promise.all([a,b].map(async p => {
    const response = await fetch(runtime.url, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: JSON.stringify({ op: "commit", prepared: p.prepared }) });
    return { status: response.status, body: await response.json() };
  }));
  same(winners.map(w => w.status).sort(), [200,409]);
  assert.equal((await counts("competing"))[0].commands, 1);
  const current = await rpc<Boundary>({ op: "recover", gameId: "competing" });
  const next = await accept(current);
  const winner = winners[0].status === 200 ? a : b;
  same(await rpc({ op: "lookup", gameId: "competing", request: stable(winner.prepared) }), { input: winner.prepared.record.input, receipt: winner.prepared.receipt });
  for (const request of [{ ...stable(winner.prepared), expectedCommand: 1 },
    { ...stable(winner.prepared), action: { type: "resign", actor: 0 } },
    { ...stable(winner.prepared), caller: { kind: "server", principal: "different" } }])
    await rpc({ op: "lookup", gameId: "competing", request }, 409);
  same(await rpc({ op: "receipt", gameId: "competing", input: winner.prepared.record.input }), winner.prepared.receipt);
  await rpc({ op: "receipt", gameId: "competing", input: { ...winner.prepared.record.input, admittedAt: 999 } }, 409);
  await rpc({ op: "receipt", gameId: "competing", input: { ...winner.prepared.record.input, expectedCommand: 1 } }, 409);
  await rpc({ op: "commit", prepared: (winners[0].status === 200 ? b : a).prepared }, 409);
  await rpc({ op: "owner", gameId: "competing", marker: next.next.head, from: owner, to: { namespace: "new-owner", generation: 2 } });
  const staleOwner = await prepare(next.next); const beforeFence = await counts("competing");
  await rpc({ op: "commit", prepared: staleOwner.prepared }, 409);
  same(await counts("competing"), beforeFence);
  note("Competing and stale writers, exact older receipts, conflicting IDs and owner generation fencing verified", winners);
  const wrongOwner = await prepareCommand(baseline, { namespace: "wrong-namespace", generation: 1 },
    (await prepare(baseline)).prepared.record.input, producer);
  const migrationCounts = await counts("migration");
  await rpc({ op: "commit", prepared: wrongOwner.prepared }, 409);
  same(await counts("migration"), migrationCounts);
  await rpc({ op: "sql", sql: `INSERT INTO commands SELECT 'missing-game',id,seq,first_event,last_event,before_hash,after_hash,
    previous_chain,owner_namespace,owner_generation,command_hash,commit_hash,record_json,receipt_json FROM commands WHERE game_id='migration'` }, 409);
  note("Wrong namespace at same generation and nonexistent-game SQL insertion fence reject without rows");
  const divergentBase = await create("divergent");
  const committedBranch = await prepare(divergentBase, undefined, "committed");
  const restoredBranch = await prepare(divergentBase, undefined, "restored");
  await rpc({ op: "commit", prepared: committedBranch.prepared });
  await rpc({ op: "restore", gameId: "divergent", marker: restoredBranch.next.head }, 409);
  await rpc({ op: "recover", gameId: "divergent" }, 409);

  // Legal Modern repetition includes four ordered awards plus terminal (six events).
  let repetition = await create("repetition"); const initial = repetition; const events: ReplayEventV2[] = [];
  const knightPaths: { from: number; to: number }[] = [];
  for (let index = 0; index < 16; index++) {
    const position = engineState(repetition.state); const seat = position.turn;
    if (index < 4) { const move = legalMoves(position).find(m => m.piece.type === PieceType.Knight)!; knightPaths[seat] = { from: move.from, to: move.to }; }
    const path = knightPaths[seat]; const move = Math.floor(index / 4) % 2 === 0 ? path : { from: path.to, to: path.from };
    const turn = await accept(repetition, { type: "move", actor: seat, move }); repetition = turn.next; events.push(...turn.prepared.events);
  }
  assert.equal(repetition.state.position.result?.reason, "repetition");
  assert.equal(events.length, 21); assert.equal(repetition.state.position.awardLedger.length, 4);
  const replay = { ...initial.header.replay, events, result: { stateSchemaId: repetition.state.stateSchemaId,
    rulesetId: repetition.state.rulesetId, result: repetition.state.position.result! }, finalStateHash: repetition.head.stateHash };
  same((await readReplay(replay)).state, repetition.state);
  await writeFile(resolve(output, "repetition.replay.json"), JSON.stringify(replay));
  let audit = initial; while (audit.head.command < repetition.head.command) audit = await rpc({ op: "page", boundary: audit, through: repetition.head.command });
  same(audit, repetition);
  const afterTerminal = await counts("repetition");
  await rpc({ op: "sql", sql: "UPDATE results SET result_json='{}' WHERE game_id='repetition'" }, 409);
  await rpc({ op: "sql", sql: "DELETE FROM commands WHERE game_id='repetition'" }, 409);
  await rpc({ op: "sql", sql: "DELETE FROM checkpoints WHERE game_id='repetition'" }, 409);
  same(await counts("repetition"), afterTerminal);
  note("Modern repetition has 16 commands/21 events, complete awards/result, genesis audit and immutable retention");

  let walking = await create("walking"); const walkingInitial = walking; const walkingEvents: ReplayEventV2[] = [];
  for (let i = 0; i < 12; i++) {
    const state = engineState(walking.state); const moves = legalMoves(state);
    const move = moves.find(m => m.from === localSquare(state.turn, 4, 1)) ?? moves.find(m => m.piece.type === PieceType.Pawn)!;
    const turn = await accept(walking, { type: "move", actor: state.turn, move: { from: move.from, to: move.to } });
    walking = turn.next; walkingEvents.push(...turn.prepared.events);
  }
  let turn = await accept(walking, { type: "resign", actor: 0 }); walking = turn.next; walkingEvents.push(...turn.prepared.events);
  const random = await prepare(walking, { type: "randomKingMove", actor: 0 });
  // Persist prepare bytes on the harness side; restart the entire real runtime.
  await writeFile(resolve(output, "prepared-random.json"), JSON.stringify(random.prepared));
  await runtime.stop(); runtime = await start(config, persistence, key, producer.buildFingerprint!, log); starts++;
  const retained = JSON.parse(await readFile(resolve(output, "prepared-random.json"), "utf8")) as Prepared;
  assert.equal(await rpc({ op: "reconcile", prepared: retained }), "absent");
  await rpc({ op: "commit", prepared: retained, lostAck: true }, 503);
  await runtime.stop(); runtime = await start(config, persistence, key, producer.buildFingerprint!, log); starts++;
  assert.equal(await rpc({ op: "reconcile", prepared: retained }), "committed");
  walking = random.next; walkingEvents.push(...random.prepared.events);
  for (const actor of [1,2] as const) { turn = await accept(walking, { type: "resign", actor }); walking = turn.next; walkingEvents.push(...turn.prepared.events); }
  same(await rpc({ op: "recover", gameId: "walking" }), walking);
  assert.equal(walking.state.position.randomActions.length, 1);
  const walkingReplay = { ...walkingInitial.header.replay, events: walkingEvents, result: { stateSchemaId: walking.state.stateSchemaId,
    rulesetId: walking.state.rulesetId, result: walking.state.position.result! }, finalStateHash: walking.head.stateHash };
  same((await readReplay(walkingReplay)).state, walking.state);
  await writeFile(resolve(output, "walking.replay.json"), JSON.stringify(walkingReplay));
  const imported = await createReplay(engineState(walking.state), producer);
  const importedHeader: GameHeader = { format: "li4chess-d1-game-v1", gameId: "imported-terminal",
    replay: { ...imported, game: { ...imported.game, sourceReplayHash: await digest(walkingReplay) } } };
  const importedBoundary = await rpc<Boundary>({ op: "create", header: importedHeader, owner });
  same(await rpc({ op: "recover", gameId: "imported-terminal" }), importedBoundary);
  assert.equal(importedBoundary.header.replay.game.sourceReplayHash, await digest(walkingReplay));
  note("Recorded random prepare survives whole-runtime restarts before and after canonical commit; survivor result matches full replay");

  let long = await create("long"); const longInitial = long; const longEvents: ReplayEventV2[] = [];
  let prunedPrepare: Prepared | undefined;
  let rng = 0x12345678; const sizes: { command: number; state: number; events: number; prepare: number; effects: number; batchStatements: number }[] = [];
  const batchStatements = (p: Prepared) => 2 + p.events.length + (p.checkpoint ? 2 : 0) + (p.result ? 1 : 0);
  const started = performance.now();
  for (let i = 0; i < 255 && !long.state.position.result; i++) {
    const state = engineState(long.state); const moves = legalMoves(state);
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
    const move = moves[(rng >>> 0) % moves.length];
    const p = await prepare(long, { type: "move", actor: state.turn, move: { from: move.from, to: move.to } });
    await rpc({ op: "commit", prepared: p.prepared }); long = p.next; longEvents.push(...p.prepared.events);
    if (long.head.command === 16) prunedPrepare = p.prepared;
    sizes.push({ command: long.head.command, state: Buffer.byteLength(canonicalJson(long.state)),
      events: Buffer.byteLength(canonicalJson(p.prepared.events)), prepare: Buffer.byteLength(canonicalJson(p.prepared)), effects: p.prepared.events.length,
      batchStatements: batchStatements(p.prepared) });
  }
  assert(long.head.command >= 128, "Realistic history must cross many checkpoint/page boundaries");
  same(await rpc({ op: "recover", gameId: "long" }), long);
  if (!long.state.position.result) {
    const next = await prepare(long);
    const [recovered] = await Promise.all([rpc<Boundary>({ op: "recover", gameId: "long" }), rpc({ op: "commit", prepared: next.prepared })]);
    same(recovered, recovered.head.command === long.head.command ? long : next.next);
    long = next.next; longEvents.push(...next.prepared.events);
    sizes.push({ command: long.head.command, state: Buffer.byteLength(canonicalJson(long.state)),
      events: Buffer.byteLength(canonicalJson(next.prepared.events)), prepare: Buffer.byteLength(canonicalJson(next.prepared)), effects: next.prepared.events.length,
      batchStatements: batchStatements(next.prepared) });
  }
  const retainedCheckpoints = (await sql("SELECT command_seq FROM checkpoints WHERE game_id='long' ORDER BY command_seq")).results;
  same(retainedCheckpoints.map(p => p.command_seq), [0, Math.floor(long.head.command / 16) * 16]);
  assert(prunedPrepare);
  same(await rpc({ op: "lookup", gameId: "long", request: stable(prunedPrepare) }), { input: prunedPrepare.record.input, receipt: prunedPrepare.receipt });
  let longAudit = longInitial; let pages = 0;
  while (longAudit.head.command < long.head.command) { longAudit = await rpc({ op: "page", boundary: longAudit, through: long.head.command }); pages++; }
  same(longAudit, long);
  const longReplay = { ...longInitial.header.replay, events: longEvents, result: long.state.position.result ? {
    stateSchemaId: long.state.stateSchemaId, rulesetId: long.state.rulesetId, result: long.state.position.result } : null, finalStateHash: long.head.stateHash };
  same((await readReplay(longReplay)).state, long.state);
  await writeFile(resolve(output, "long.replay.json"), JSON.stringify(longReplay));
  const storage = await sql(`SELECT 'commands' kind,count(*) rows,sum(length(CAST(record_json AS BLOB))+length(CAST(receipt_json AS BLOB))) bytes FROM commands WHERE game_id='long'
    UNION ALL SELECT 'events',count(*),sum(length(CAST(event_json AS BLOB))) FROM events WHERE game_id='long'
    UNION ALL SELECT 'checkpoints',count(*),sum(length(CAST(state_json AS BLOB))) FROM checkpoints WHERE game_id='long'`);
  await writeFile(resolve(output, "measurements.json"), JSON.stringify({ seed: "12345678", commands: long.head.command,
    eventCount: long.head.event, terminal: long.state.position.result, elapsedMs: performance.now() - started, auditPages: pages,
    maximumBoundParameters: 14, configuredMaxBatchStatements: 37, sizes, storage }, null, 2));
  note("Engine-generated long history, bounded reconstruction, paged full audit and checkpoint pruning measured", { commands: long.head.command, events: long.head.event, pages });

  await rpc({ op: "recover", gameId: "long", rejectProducer: true }, 409);
  await rpc({ op: "page", boundary: longInitial, through: long.head.command, rejectProducer: true }, 409);
  await rpc({ op: "receipt", gameId: "migration", input: first.prepared.record.input, rejectProducer: true }, 409);
  await rpc({ op: "lookup", gameId: "migration", request: stable(first.prepared), rejectProducer: true }, 409);
  await rpc({ op: "restore", gameId: "long", marker: longInitial.head, rejectProducer: true }, 409);
  await sql("UPDATE persistence_schema SET version=999 WHERE id=1"); await rpc({ op: "recover", gameId: "long" }, 409);
  await sql("UPDATE persistence_schema SET version=2 WHERE id=1");
  await rpc({ op: "restore", gameId: "long", marker: longInitial.head });
  await rpc({ op: "restore", gameId: "long", marker: { ...long.head, chainHash: `sha256:${"0".repeat(64)}` } }, 409);
  await rpc({ op: "recover", gameId: "long" }, 409);
  // Corruption requires deliberately bypassing immutable guards in test tooling.
  await sql("DROP TRIGGER immutable_checkpoints"); await sql("UPDATE checkpoints SET state_hash='tampered' WHERE game_id='walking' AND command_seq>0");
  await rpc({ op: "recover", gameId: "walking" }, 409);
  await sql("DROP TRIGGER immutable_commands");
  await sql("UPDATE commands SET record_json=json_set(record_json,'$.format','li4chess-d1-command-v2') WHERE game_id='rollback'");
  await rpc({ op: "recover", gameId: "rollback" }, 409);
  await sql("DROP TRIGGER retain_events"); await sql("DELETE FROM events WHERE game_id='repetition' AND seq=18");
  await rpc({ op: "page", boundary: audit.head.command === 16 ? initial : audit, through: 16 });
  let gapped = await rpc<Boundary>({ op: "page", boundary: initial, through: 16 });
  await rpc({ op: "page", boundary: gapped, through: 16 }, 409);
  note("Unknown producer/schema, divergent restore quarantine, tampered checkpoint and missing interior terminal effect rejected");
  assertBuildUnchanged(producer, root);
} catch (error) { failed = error; process.stderr.write(`${String(error)}\n`); }
finally {
  await runtime.stop();
  await writeFile(resolve(output, "runtime.log"), logs);
  await writeFile(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
  await writeFile(resolve(output, "rpc-samples.json"), JSON.stringify(rpcSamples, null, 2));
  await writeFile(resolve(output, "summary.json"), JSON.stringify({ passed: !failed, starts, groups: observations.length, error: failed ? String(failed) : null }, null, 2));
}
if (failed) throw failed;
process.stdout.write(`Evidence: ${output}\n`);
