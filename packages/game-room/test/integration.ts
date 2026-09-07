import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, cp } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { createRequire } from "node:module";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";
import { createInitialState, legalMoves, localSquare, PieceType } from "@li4chess/engine";
import { canonicalJson, createReplay, engineState, readReplay } from "@li4chess/protocol";
import type { ActionRequest, ReplayEventV2 } from "@li4chess/protocol";
import { assertBuildUnchanged, readBuildIdentity, runtimeEnvironment } from "@li4chess/protocol/node";
import { LIMITS, type Boundary, type Prepared, type Receipt } from "@li4chess/persistence";
import { ROOM_LIMITS, type Creation, type Snapshot, type Publication } from "../src/room.js";
import { root, run, signals, start } from "../../persistence/test/runtime.js";

signals();
const same = (a: unknown, b: unknown) => assert.equal(canonicalJson(a), canonicalJson(b));
assert(Number(process.versions.node.split(".")[0]) >= 24);
const producer = readBuildIdentity(root);
const output = process.env.M3_04_OUTPUT ?? resolve(root, `arena-results/m3-04-${Date.now()}`);
await mkdir(dirname(output), { recursive: true }); await mkdir(output);
const secret = () => Buffer.from(randomBytes(32)).toString("hex");
const key = secret(); const playerKeys = [secret(), secret(), secret(), secret()];
const generated = resolve(root, "packages/game-room/.generated", `run-${Date.now()}`);
await mkdir(generated, { recursive: true });
const migrations = resolve(generated, "migrations"); await cp(resolve(root, "packages/persistence/migrations"), migrations, { recursive: true });
const config = resolve(generated, "wrangler.json"); const persistence = resolve(output, "runtime");
const configuration = { name: "li4chess-game-room-test", main: resolve(import.meta.dirname, "worker.ts"),
  compatibility_date: "2026-09-01", workers_dev: false, preview_urls: false,
  durable_objects: { bindings: [{ name: "ROOMS", class_name: "TestRoom" }, { name: "REAL_ROOMS", class_name: "FixtureGameRoom" }] },
  migrations: [{ tag: "v1", new_sqlite_classes: ["TestRoom", "FixtureGameRoom"] }],
  d1_databases: [{ binding: "DB", database_name: "m3-04-test", database_id: "00000000-0000-0000-0000-000000000004", migrations_dir: migrations }],
  vars: { TEST_KEY: key, PLAYER_KEYS: playerKeys, PRODUCER: producer } };
await writeFile(config, JSON.stringify(configuration));
await writeFile(resolve(output, "configuration.json"), JSON.stringify({ ...configuration, vars: { ...configuration.vars, TEST_KEY: "[redacted]", PLAYER_KEYS: "[redacted]" } }, null, 2));
const sourceFiles: Record<string, string> = {};
for (const file of execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root, encoding: "utf8" }).split("\0").filter(Boolean))
  sourceFiles[file] = Buffer.from(await readFile(resolve(root, file))).toString("base64");
await writeFile(resolve(output, "source.json.gz"), gzipSync(JSON.stringify({ producer, files: sourceFiles })));
const require = createRequire(import.meta.url);
const sockets = new Set<WebSocket>();
await writeFile(resolve(output, "manifest.json"), JSON.stringify({ producer, environment: runtimeEnvironment(), limits: { ...ROOM_LIMITS, canonical: LIMITS },
  command: "pnpm --filter @li4chess/game-room test:integration", pnpm: process.env.npm_config_user_agent,
  wrangler: require(resolve(root, "node_modules/wrangler/package.json")).version,
  workerd: require(require.resolve("workerd/package.json", { paths: [resolve(root, "node_modules/wrangler")] })).version,
  timing: "Injected future epoch for deterministic arithmetic; explicit wall-clock rooms for delivered alarms. Local measurements do not establish hosted guarantees." }, null, 2));
let logs = ""; const log = (text: string) => { logs += text; };
const observations: unknown[] = []; const note = (message: string, details?: unknown) => {
  observations.push({ message, details }); process.stdout.write(`${message}\n`);
};
await run(["d1", "migrations", "apply", "DB", "--local", "--config", config, "--persist-to", persistence], log).catch(async error => {
  await writeFile(resolve(output, "runtime.log"), logs);
  await writeFile(resolve(output, "summary.json"), JSON.stringify({ passed: false, starts: 0, groups: 0, stage: "migration", error: String(error) }, null, 2));
  throw error;
});
let runtime = await start(config, persistence, key, producer.buildFingerprint!, log).catch(async error => {
  await writeFile(resolve(output, "runtime.log"), logs);
  await writeFile(resolve(output, "summary.json"), JSON.stringify({ passed: false, starts: 0, groups: 0, stage: "readiness", error: String(error) }, null, 2));
  throw error;
});
let starts = 1;
const samples: { op: string; elapsedMs: number; requestBytes: number; responseBytes: number; status: number }[] = [];
type RequestBody = { op: string; room?: string; [key: string]: unknown };
async function raw(body: RequestBody, seat?: number) {
  const serialized = JSON.stringify(body); const begin = performance.now();
  const response = await fetch(runtime.url, { method: "POST", headers: { authorization: `Bearer ${seat === undefined ? key : playerKeys[seat]}`, "content-type": "application/json" },
    body: serialized, signal: AbortSignal.timeout(120000) });
  const text = await response.text(); samples.push({ op: body.op, elapsedMs: performance.now() - begin,
    requestBytes: Buffer.byteLength(serialized), responseBytes: Buffer.byteLength(text), status: response.status });
  return { status: response.status, value: JSON.parse(text) as { result: unknown; error?: string; code?: string } };
}
async function rpc<T = unknown>(body: RequestBody, seat?: number, status = 200): Promise<T> {
  const response = await raw(body, seat); assert.equal(response.status, status, JSON.stringify(response.value));
  return (status === 200 ? response.value.result : response.value) as T;
}
type Inspection = { records: { cache?: Boundary; marker?: Boundary["head"]; pending?: Prepared; timing?: { value: Snapshot["timing"] }; creating?: boolean; identity?: Creation }; hit: { stage: string } | null; publications: Publication[]; alarms: number; alarmAt: number | null };
const inspect = (room: string) => rpc<Inspection>({ op: "inspect", room });
const canonical = (room: string) => rpc<Boundary>({ op: "canonical", room });
const sql = (sql: string, values: (string | number | null)[] = []) => rpc<{ results: Record<string, unknown>[] }>({ op: "sql", sql, values });
const baseTime = Date.now() + 365 * 86400000;
async function time(room: string, now: number | null) { await rpc({ op: "time", room, now }); }
async function connect(room: string, seat: number, connection?: string, generation = 1) {
  return rpc<Snapshot>({ op: "connect", room, connection, generation }, seat);
}
async function connectAll(room: string) { for (let seat = 0; seat < 4; seat++) await connect(room, seat); }
async function creationFor(room: string, initialMs = 300000, incrementMs = 50): Promise<Creation> {
  return { header: { format: "li4chess-d1-game-v1", gameId: room, replay: await createReplay(createInitialState(), producer) },
    owner: { namespace: "m3-04-test", generation: 1 },
    seats: [0,1,2,3].map(seat => ({ principal: `fixture-player-${seat}`, generation: 1 })) as Creation["seats"],
    policy: { initialMs, incrementMs, increment: "after-move" } };
}
async function create(room: string, initialMs = 300000, incrementMs = 50, real = false): Promise<Snapshot> {
  await time(room, real ? null : baseTime);
  const creation = await creationFor(room, initialMs, incrementMs);
  const snapshot = await rpc<Snapshot>({ op: "create", room, creation });
  await connectAll(room); await rpc({ op: "clearPublications", room }); return snapshot;
}
function request(boundary: Boundary, action?: ActionRequest, id = `command-${boundary.head.command + 1}`) {
  const state = engineState(boundary.state); const move = legalMoves(state)[0];
  return { id, expectedCommand: boundary.head.command, action: action ?? { type: "move" as const, actor: state.turn, move: { from: move.from, to: move.to } } };
}
async function move(room: string, action?: ActionRequest, id?: string) {
  const before = await canonical(room); const input = request(before, action, id);
  const result = await rpc<{ receipt: Receipt; admittedAt: number }>({ op: "command", room, request: input }, input.action.actor);
  return { input, result, after: await canonical(room) };
}
async function fault(room: string, stage: string, mode = "pause", delayMs?: number) { await rpc({ op: "fault", room, fault: { stage, mode, delayMs } }); }
async function waitFor<T>(read: () => Promise<T>, ready: (value: T) => boolean, label: string, milliseconds = 15000): Promise<T> {
  const deadline = Date.now() + milliseconds;
  do { const value = await read(); if (ready(value)) return value; await sleep(30); } while (Date.now() < deadline);
  throw new Error(`Timed out awaiting observed event: ${label}`);
}
async function restart() { await runtime.stop(); runtime = await start(config, persistence, key, producer.buildFingerprint!, log); starts++; }
async function attachSocket(room: string, seat: number, connection: string): Promise<WebSocket> {
  const url = new URL(runtime.url); url.protocol = "ws:";
  url.search = new URLSearchParams({ op: "real-attach", room, connection }).toString();
  const socket = new WebSocket(url.toString(), { headers: { authorization: `Bearer ${playerKeys[seat]}` } }); sockets.add(socket);
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket initial publication timeout")), 10000);
    socket.addEventListener("message", event => { clearTimeout(timer); try {
      assert.equal(JSON.parse(String(event.data)).type, "committed"); done();
    } catch (error) { reject(error); } }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("WebSocket fixture connection error")); }, { once: true });
  });
  return socket;
}
async function closeSocket(socket: WebSocket): Promise<void> {
  await new Promise<void>((done, reject) => {
    if (socket.readyState === 3) { done(); return; }
    const timer = setTimeout(() => reject(new Error("WebSocket close timeout")), 10000);
    socket.addEventListener("close", () => { clearTimeout(timer); done(); }, { once: true }); socket.close();
  }); sockets.delete(socket);
}
async function restoreConnections(room: string) { await connectAll(room); }
let failed: unknown;
try {
  assert.equal((await fetch(runtime.url, { method: "POST", headers: { authorization: "Bearer fabricated" }, body: JSON.stringify({ op: "inspect", room: "auth" }) })).status, 403);
  await create("auth"); const initial = await canonical("auth"); const firstInput = request(initial);
  const untouched = (await inspect("auth")).records.timing;
  await rpc({ op: "command", room: "auth", request: firstInput }, 1, 409);
  await rpc({ op: "command", room: "auth", generation: 2, request: firstInput }, 0, 409);
  await rpc({ op: "command", room: "auth", request: { ...firstInput, action: { type: "timeout", actor: 0, clock: { remainingMs: 0 } } } }, 0, 409);
  await rpc({ op: "command", room: "auth", request: { ...firstInput, action: { type: "move", actor: 0, move: { from: 0, to: 1 } } } }, 0, 409);
  same((await inspect("auth")).records.timing, untouched);
  const accepted = await rpc({ op: "command", room: "auth", request: firstInput }, 0);
  await move("auth"); const beforeDuplicate = (await inspect("auth")).records.timing;
  same(await rpc({ op: "command", room: "auth", request: firstInput }, 0), accepted);
  await rpc({ op: "command", room: "auth", request: { ...firstInput, expectedCommand: 2 } }, 0, 409);
  same((await inspect("auth")).records.timing, beforeDuplicate);
  await connect("auth", 0, "new-controller");
  await rpc({ op: "command", room: "auth", request: firstInput, connection: "new-controller" }, 0, 409);
  await rpc({ op: "control", room: "auth", connection: "new-controller", nextGeneration: 2 }, 0);
  await rpc({ op: "command", room: "auth", request: firstInput }, 0, 409);
  await rpc({ op: "command", room: "auth", request: firstInput, connection: "new-controller", generation: 2 }, 0, 409);
  note("Fixture credentials precede caller mapping; wrong seat/control/server actions and illegal moves reject without clock change; historical duplicates preserve admission and conflicting IDs reject");
  await create("socket-close"); await rpc({ op: "control", room: "socket-close", nextGeneration: 2 }, 0);
  await rpc({ op: "socketClose", room: "socket-close", generation: 2 }, 0);
  assert.equal((await inspect("socket-close")).records.timing!.value.connected[0], false);
  await connect("socket-close", 0, undefined, 2);
  await rpc({ op: "socketClose", room: "socket-close", generation: 2, handle: 0 }, 0);
  assert.equal((await inspect("socket-close")).records.timing!.value.connected[0], true);
  await rpc({ op: "command", room: "socket-close", generation: 2, request: request(await canonical("socket-close")) }, 0);
  note("Room-owned transport close works across control takeover; late close of old instance preserves replacement connection");
  const socketCreation = await creationFor("actual-websocket");
  await rpc({ op: "real-create", room: "actual-websocket", creation: socketCreation });
  const redOne = await attachSocket("actual-websocket", 0, "red-one");
  const redTwo = await attachSocket("actual-websocket", 0, "red-two");
  const blue = await attachSocket("actual-websocket", 1, "blue");
  await rpc({ op: "real-control", room: "actual-websocket", connection: "red-two", nextGeneration: 2 }, 0);
  await closeSocket(redTwo); await closeSocket(redOne);
  await waitFor(() => rpc<Snapshot>({ op: "real-read", room: "actual-websocket", connection: "blue" }, 1),
    value => !value.timing.connected[0], "maintained WebSocket close presence");
  await sleep(30); const yellow = await attachSocket("actual-websocket", 2, "yellow");
  assert((await rpc<Snapshot>({ op: "real-read", room: "actual-websocket", connection: "blue" }, 1)).timing.disconnectRemainingMs[0] < 60000);
  await closeSocket(yellow); await closeSocket(blue);
  note("Actual maintained GameRoom.attach WebSockets publish initial state; real closes after controller takeover remove presence and start cumulative bank debit");

  await create("serialization"); const concurrentInput = request(await canonical("serialization"));
  await fault("serialization", "d1-delay", "pause", 1200);
  let completed = false;
  const pending = raw({ op: "command", room: "serialization", request: concurrentInput }, 0).then(value => { completed = true; return value; });
  await waitFor(() => inspect("serialization"), state => state.hit?.stage === "d1-delay", "D1 await");
  const inFlight = await inspect("serialization"); assert(inFlight.records.pending); assert.equal(inFlight.records.cache!.head.command, 0);
  assert.equal(inFlight.publications.length, 0); assert.equal(completed, false);
  let readDone = false; let presenceDone = false;
  const read = raw({ op: "read", room: "serialization" }, 1).then(value => { readDone = true; return value; });
  const presence = raw({ op: "disconnect", room: "serialization" }, 2).then(value => { presenceDone = true; return value; });
  const competing = raw({ op: "command", room: "serialization", request: { ...concurrentInput, id: "competitor" } }, 0);
  await sleep(100); assert.equal(readDone, false); assert.equal(presenceDone, false);
  assert.equal((await pending).status, 200); assert.equal((await read).status, 200); assert.equal((await presence).status, 200); assert.equal((await competing).status, 409);
  assert.equal((await canonical("serialization")).head.command, 1);
  note("Concurrent command/read/presence stay behind the Room queue during a real delayed D1 batch; no speculative publication or success");

  for (const stage of ["after-creation", "after-d1"]) {
    const room = `creation-${stage}`; await time(room, baseTime); const creation = await creationFor(room);
    await fault(room, stage); const interrupted = raw({ op: "create", room, creation }).catch(() => null);
    const saved = await waitFor(() => inspect(room), value => value.hit?.stage === stage, `creation ${stage}`);
    assert.equal(saved.records.creating, true); same(saved.records.identity?.header, creation.header);
    await restart(); await interrupted;
    const recovered = await rpc<Snapshot>({ op: "create", room, creation });
    same(recovered.boundary.header, creation.header); assert.equal(recovered.boundary.head.command, 0);
    await rpc({ op: "create", room, creation: { ...creation, header: { ...creation.header, gameId: `${room}-changed` } } }, undefined, 409);
    same((await canonical(room)).header, creation.header);
  }
  note("Uncertain creation before/after real D1 transaction recovers identical game/header/seed; recreation cannot change identity");

  // Every boundary kills the whole Wrangler/workerd tree, preserving SQLite and D1.
  for (const stage of ["before-prepare", "after-prepare", "after-d1", "after-finalize", "after-activation", "before-ack"]) {
    const room = `crash-${stage}`; await create(room); await time(room, baseTime + 100);
    const input = request(await canonical(room)); await fault(room, stage);
    const abandoned = raw({ op: "command", room, request: input }, 0).catch(() => null);
    const state = await waitFor(() => inspect(room), value => value.hit?.stage === stage, stage);
    const prepared = state.records.pending;
    if (["before-prepare", "after-prepare", "after-d1", "after-finalize", "after-activation"].includes(stage)) assert.equal(state.publications.length, 0);
    if (stage === "before-prepare") { assert.equal((await canonical(room)).head.command, 0); assert.equal(prepared, undefined); }
    if (stage === "after-prepare") assert.equal((await canonical(room)).head.command, 0);
    if (stage === "after-d1" || stage === "after-finalize") assert.equal(state.records.timing!.value.phase, "suspended");
    await restart(); await abandoned; await time(room, baseTime + 100000); await restoreConnections(room);
    const retried = await rpc<{ receipt: Receipt; admittedAt: number }>({ op: "command", room, request: input }, 0);
    const final = await canonical(room); assert.equal(final.head.command, 1);
    if (prepared) { same(retried.receipt, prepared.receipt); same(final.state, prepared.finalState); assert.equal(retried.admittedAt, prepared.record.input.admittedAt); }
    const finalTiming = (await inspect(room)).records.timing!.value;
    assert.equal(finalTiming.remainingMs[0], stage === "before-prepare" ? 300050 : 299950);
    await restart(); await restoreConnections(room);
    same(await rpc({ op: "command", room, request: input }, 0), retried);
    assert.equal((await inspect(room)).records.timing!.value.remainingMs[0], finalTiming.remainingMs[0]);
    note(`Whole-runtime interruption ${stage}: exact canonical outcome/receipt, no repeat debit/increment on repeated recovery`);
  }

  await create("cold-before-prepare"); const cold = (await inspect("cold-before-prepare")).records.timing!.value;
  await restart(); await time("cold-before-prepare", baseTime + 1000000); await restoreConnections("cold-before-prepare");
  same((await inspect("cold-before-prepare")).records.timing!.value.remainingMs, cold.remainingMs);
  same((await inspect("cold-before-prepare")).records.timing!.value.disconnectRemainingMs, cold.disconnectRemainingMs);
  note("Restart without prepare conservatively resumes durably accounted balances without charging unavailable time");
  await create("whole-local-loss"); const beforeLoss = await canonical("whole-local-loss");
  const retainedCreation = (await inspect("whole-local-loss")).records.identity!;
  const { header, owner, seats, policy } = retainedCreation;
  await rpc({ op: "clearRoom", room: "whole-local-loss" }); await restart();
  await rpc({ op: "create", room: "whole-local-loss", creation: { header, owner, seats, policy } }, undefined, 409);
  same(await canonical("whole-local-loss"), beforeLoss);
  assert.equal((await inspect("whole-local-loss")).records.timing, undefined);
  await rpc({ op: "create", room: "other-object", creation: { header, owner, seats, policy } }, undefined, 409);
  note("Complete local record loss cannot recreate fresh balances over existing canonical game; another object cannot bind the same game ID");

  await create("rollback", 300000, 50, true); const rollbackInput = request(await canonical("rollback"));
  const original = await canonical("rollback"); await fault("rollback", "d1-rollback", "throw");
  await rpc({ op: "command", room: "rollback", request: rollbackInput }, 0, 409);
  same(await canonical("rollback"), original);
  const suspended = await inspect("rollback"); assert(suspended.records.pending); assert.equal(suspended.records.timing!.value.phase, "suspended");
  assert.equal(suspended.publications.filter(p => p.type === "committed").length, 0);
  const recovered = await waitFor(() => inspect("rollback"), value => value.alarms > 0 && value.records.cache?.head.command === 1 && value.records.timing?.value.phase === "running", "autonomous recovery alarm", 20000);
  same((await canonical("rollback")).state, suspended.records.pending.finalState);
  await connectAll("rollback"); same((await rpc<{ receipt: Receipt }>({ op: "command", room: "rollback", request: rollbackInput }, 0)).receipt, suspended.records.pending.receipt);
  note("Actual late D1 SQL failure rolls back full batch; delivered alarm reconciles retained prepare without player traffic", { alarms: recovered.alarms });

  await create("repeated-recovery"); await rpc({ op: "disconnect", room: "repeated-recovery" }, 3); await time("repeated-recovery", baseTime + 100);
  await rpc({ op: "fault", room: "repeated-recovery", fault: { stage: "d1-rollback", mode: "throw", remaining: 7 } });
  const recoveryInput = request(await canonical("repeated-recovery"));
  await rpc({ op: "command", room: "repeated-recovery", request: recoveryInput }, 0, 409);
  const firstFailure = await inspect("repeated-recovery"); const originalPrepare = firstFailure.records.pending!;
  const intervals: number[] = []; let recoveryNow = baseTime + 100;
  for (let attempt = 1; attempt <= 7; attempt++) {
    const current = await inspect("repeated-recovery"); const timing = current.records.timing!.value;
    assert.equal(timing.incident!.attempts, attempt); same(current.records.pending, originalPrepare);
    same(timing.remainingMs, firstFailure.records.timing!.value.remainingMs);
    same(timing.disconnectRemainingMs, firstFailure.records.timing!.value.disconnectRemainingMs);
    const retryAt = timing.incident!.retryAt!;
    intervals.push(retryAt - recoveryNow); recoveryNow = retryAt;
    assert.equal(current.alarmAt, retryAt);
    await time("repeated-recovery", retryAt); await rpc({ op: "alarm", room: "repeated-recovery" });
  }
  const retryRecovered = await inspect("repeated-recovery"); assert.equal(retryRecovered.records.pending, undefined);
  same(intervals, [1000, 2000, 4000, 8000, 16000, 32000, 60000]);
  same(retryRecovered.records.cache!.state, originalPrepare.finalState);
  same(retryRecovered.records.timing!.value.remainingMs, firstFailure.records.timing!.value.remainingMs);
  same(retryRecovered.records.timing!.value.disconnectRemainingMs, firstFailure.records.timing!.value.disconnectRemainingMs);
  note("Seven actual rolled-back commits retain exact prepare and frozen clock/bank balances; durable fake-time alarms continue through capped backoff", { intervals });

  await create("edge", 1000, 10); await time("edge", baseTime + 999); const edge = await move("edge");
  assert.equal((await inspect("edge")).records.timing!.value.remainingMs[0], 11);
  await time("edge", baseTime + 1999); const late = request(await canonical("edge"));
  await rpc({ op: "command", room: "edge", request: late }, 1, 409);
  const ended = await canonical("edge"); assert(ended.state.position.result); assert.equal(ended.head.command, 2);
  same(await rpc({ op: "command", room: "edge", request: edge.input }, 0), edge.result);
  await rpc({ op: "alarm", room: "edge" }); await rpc({ op: "alarm", room: "edge" }); same(await canonical("edge"), ended);
  await rpc({ op: "command", room: "edge", request: { ...edge.input, expectedCommand: 2 } }, 0, 409);
  await create("backwards"); await time("backwards", baseTime - 100); await move("backwards");
  const backwards = (await inspect("backwards")).records.timing!.value; assert.equal(backwards.backwards, true); assert.equal(backwards.remainingMs[0], 300050);
  await create("real-deadline", 2500, 0, true);
  const realExpired = await waitFor(() => inspect("real-deadline"), value => !!value.records.cache?.state.position.result, "real delivered deadline", 15000);
  assert(realExpired.alarms > 0); assert.equal(realExpired.records.cache!.head.command, 1);
  note("Deadline-minus-one move, exact deadline rejection, terminal duplicate receipt, repeated/stale alarms, backwards time and actual delivered timeout verified");

  await create("banks"); await connect("banks", 0, "second-red");
  await rpc({ op: "disconnect", room: "banks" }, 0); await time("banks", baseTime + 10000);
  await rpc({ op: "disconnect", room: "banks", connection: "second-red" }, 0);
  assert.equal((await inspect("banks")).records.timing!.value.disconnectRemainingMs[0], 60000);
  await time("banks", baseTime + 30000); await connect("banks", 0);
  assert.equal((await inspect("banks")).records.timing!.value.disconnectRemainingMs[0], 40000);
  await rpc({ op: "disconnect", room: "banks" }, 0); await time("banks", baseTime + 70000); await rpc({ op: "alarm", room: "banks" });
  const bankRecord = (await sql("SELECT record_json FROM commands WHERE game_id=? AND seq=1", ["banks"])).results[0];
  assert.equal(JSON.parse(String(bankRecord.record_json)).input.action.type, "disconnectForfeit");
  assert((await canonical("banks")).state.position.result);
  await create("tie", 60000, 0); await rpc({ op: "disconnect", room: "tie" }, 0); await time("tie", baseTime + 60000); await rpc({ op: "alarm", room: "tie" });
  const tieRecord = JSON.parse(String((await sql("SELECT record_json FROM commands WHERE game_id=? AND seq=1", ["tie"])).results[0].record_json));
  assert.equal(tieRecord.input.action.type, "timeout"); assert.equal(tieRecord.input.action.actor, 0);
  note("Multiple connections avoid double bank debit; reconnect preserves cumulative bank; exhaustion carries disconnect fact; main-clock wins deterministic tie");

  for (const kind of ["cache", "timing", "marker"]) {
    const room = `restore-${kind}`; await create(room); await move(room); const expected = await canonical(room);
    await rpc({ op: "mutate", room, key: kind, value: kind === "marker" ? { ...expected.head, chainHash: `sha256:${"0".repeat(64)}` } : null });
    await restart();
    if (kind === "cache") { await connectAll(room); same(await canonical(room), expected); same((await inspect(room)).records.cache, expected); }
    else { await rpc({ op: "connect", room }, 0, 409); const restored = await inspect(room);
      if (kind === "timing") assert.equal(restored.records.timing, undefined); else assert.equal(restored.records.timing!.value.phase, "incident"); }
  }
  await create("owner-fence"); await sql("UPDATE games SET owner_generation=owner_generation+1 WHERE id=?", ["owner-fence"]);
  await rpc({ op: "read", room: "owner-fence" }, 0, 409);
  assert.equal((await inspect("owner-fence")).publications.filter(p => p.type === "committed").length, 0);
  const wrongNamespace = await creationFor("wrong-namespace"); wrongNamespace.owner.namespace = "different-namespace";
  await rpc({ op: "create", room: "wrong-namespace", creation: wrongNamespace }, undefined, 409);
  assert.equal((await inspect("wrong-namespace")).records.identity, undefined);
  note("Cache reconstructs from bounded canonical suffix; missing timing suspends; divergent marker quarantines; stale canonical owner cannot read or publish");

  await create("restored-old-prepare"); await fault("restored-old-prepare", "after-prepare");
  const oldInput = request(await canonical("restored-old-prepare"));
  const oldLost = raw({ op: "command", room: "restored-old-prepare", request: oldInput }, 0).catch(() => null);
  const oldLocal = await waitFor(() => inspect("restored-old-prepare"), value => value.hit?.stage === "after-prepare", "old prepare capture");
  await restart(); await oldLost; await connectAll("restored-old-prepare");
  await move("restored-old-prepare"); await move("restored-old-prepare");
  assert.equal((await canonical("restored-old-prepare")).head.command, 3);
  await rpc({ op: "clearPublications", room: "restored-old-prepare" });
  for (const key of ["cache", "marker", "pending", "timing"] as const)
    await rpc({ op: "mutate", room: "restored-old-prepare", key, value: oldLocal.records[key] });
  await restart(); await rpc({ op: "connect", room: "restored-old-prepare" }, 0, 409);
  const divergent = await inspect("restored-old-prepare"); assert.equal(divergent.publications.length, 0);
  assert(divergent.records.pending); assert.equal(divergent.records.timing!.value.phase, "incident");
  const quarantined = (await sql("SELECT command_seq,quarantine FROM games WHERE id=?", ["restored-old-prepare"])).results[0];
  assert.equal(quarantined.command_seq, 3); assert(quarantined.quarantine);
  note("Restoring valid old pending/timing/marker after canonical head advances quarantines without rolling back or publishing stale state");

  await create("walking"); const walkingInitial = await canonical("walking");
  for (let index = 0; index < 12; index++) {
    const state = engineState((await canonical("walking")).state); const moves = legalMoves(state);
    const selected = moves.find(m => m.from === localSquare(state.turn, 4, 1)) ?? moves.find(m => m.piece.type === PieceType.Pawn)!;
    await move("walking", { type: "move", actor: state.turn, move: { from: selected.from, to: selected.to } });
  }
  await move("walking", { type: "resign", actor: 0 }); await fault("walking", "after-prepare");
  const walkingAlarm = raw({ op: "alarm", room: "walking" }).catch(() => null);
  const walkingPrepare = (await waitFor(() => inspect("walking"), value => value.hit?.stage === "after-prepare", "walking prepare")).records.pending!;
  assert.equal(walkingPrepare.record.input.action.type, "randomKingMove");
  await restart(); await walkingAlarm; await connectAll("walking");
  same((await canonical("walking")).state, walkingPrepare.finalState);
  assert.equal((await canonical("walking")).state.position.randomActions.length, 1);
  await move("walking", { type: "resign", actor: 1 });
  // Seat 1's newly walking king is due before any new player admission.
  await rpc({ op: "alarm", room: "walking" });
  await fault("walking", "after-d1"); const terminalInput = request(await canonical("walking"), { type: "resign", actor: 2 });
  const terminalLost = raw({ op: "command", room: "walking", request: terminalInput }, 2).catch(() => null);
  const terminalPrepare = (await waitFor(() => inspect("walking"), value => value.hit?.stage === "after-d1", "terminal commit")).records.pending!;
  assert(terminalPrepare.finalState.position.result);
  await restart(); await terminalLost; await connectAll("walking");
  same((await canonical("walking")).state, terminalPrepare.finalState);
  same((await rpc<{ receipt: Receipt }>({ op: "command", room: "walking", request: terminalInput }, 2)).receipt, terminalPrepare.receipt);
  const terminalRows = (await sql("SELECT count(*) count FROM results WHERE game_id=?", ["walking"])).results[0]; assert.equal(terminalRows.count, 1);
  const walkingFinal = await canonical("walking");
  const walkingReplay = { ...walkingInitial.header.replay,
    events: (await sql("SELECT event_json FROM events WHERE game_id=? ORDER BY seq", ["walking"])).results.map(row => JSON.parse(String(row.event_json)) as ReplayEventV2),
    result: { stateSchemaId: walkingFinal.state.stateSchemaId, rulesetId: walkingFinal.state.rulesetId, result: walkingFinal.state.position.result! }, finalStateHash: walkingFinal.head.stateHash };
  same((await readReplay(walkingReplay)).state, walkingFinal.state);
  await writeFile(resolve(output, "walking.replay.json"), JSON.stringify(walkingReplay));
  note("Seeded walking prepare and terminal awards survive runtime interruption; exact random outcome, receipt, final state and unique result retained");

  await create("bounds"); for (let i = 4; i < ROOM_LIMITS.connections; i++) await connect("bounds", 0, `extra-${i}`);
  await rpc({ op: "connect", room: "bounds", connection: "overflow" }, 0, 409);
  await rpc({ op: "command", room: "bounds", request: request(await canonical("bounds"), undefined, "x".repeat(257)) }, 0, 409);
  assert.equal((await canonical("bounds")).head.command, 0);
  await rpc({ op: "mutate", room: "bounds", key: "oversized", value: "x".repeat(ROOM_LIMITS.recordBytes + 1) }, undefined, 409);
  await create("queue-bound"); await fault("queue-bound", "d1-delay", "pause", 2500);
  const queuedMove = raw({ op: "command", room: "queue-bound", request: request(await canonical("queue-bound")) }, 0);
  await waitFor(() => inspect("queue-bound"), value => value.hit?.stage === "d1-delay", "queue-bound D1 wait");
  const arrivals = await Promise.all(Array.from({ length: ROOM_LIMITS.queued + 8 }, () => raw({ op: "read", room: "queue-bound" }, 1)));
  assert.equal((await queuedMove).status, 200);
  assert(arrivals.some(value => value.status === 409 && value.value.code === "capacity"));
  assert(arrivals.every(value => value.status === 200 || value.value.code === "capacity"));
  note("Room queue saturation rejects excess arrivals during external await; oversized SQLite record and excess connections/command IDs reject");

  await create("long"); const longInitial = await canonical("long"); let long = longInitial; let rng = 0x12345678;
  const begin = performance.now(); const sizes: unknown[] = [];
  for (let i = 0; i < 256 && !long.state.position.result; i++) {
    const state = engineState(long.state); const moves = legalMoves(state);
    rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; const selected = moves[(rng >>> 0) % moves.length];
    const input = request(long, { type: "move", actor: state.turn, move: { from: selected.from, to: selected.to } });
    await rpc({ op: "command", room: "long", request: input }, state.turn); long = await canonical("long");
    sizes.push({ command: long.head.command, stateBytes: Buffer.byteLength(canonicalJson(long.state)), sqliteBytes: Buffer.byteLength(canonicalJson((await inspect("long")).records)) });
    if ((i + 1) % 64 === 0) process.stdout.write(`Engine history: ${i + 1}/256 commands\n`);
  }
  assert(long.head.command >= 128, "Engine-generated history must cross checkpoint boundaries");
  const events = (await sql("SELECT event_json FROM events WHERE game_id=? ORDER BY seq", ["long"])).results.map(row => JSON.parse(String(row.event_json)) as ReplayEventV2);
  const replay = { ...longInitial.header.replay, events, result: long.state.position.result ? { stateSchemaId: long.state.stateSchemaId, rulesetId: long.state.rulesetId, result: long.state.position.result } : null, finalStateHash: long.head.stateHash };
  same((await readReplay(replay)).state, long.state);
  await writeFile(resolve(output, "long.replay.json"), JSON.stringify(replay));
  await rpc({ op: "mutate", room: "long", key: "cache", value: null }); await restart(); await connectAll("long");
  same((await inspect("long")).records.cache, long);
  await writeFile(resolve(output, "measurements.json"), JSON.stringify({ seed: "12345678", requestedCommands: 256, commands: long.head.command, events: long.head.event,
    terminal: long.state.position.result, elapsedMs: performance.now() - begin, sizes,
    limits: ROOM_LIMITS, caveat: "Real local workerd/D1 HTTP/SQLite timings include fixture capture and full canonical verification; not hosted capacity or latency." }, null, 2));
  note("Admission/connection bounds enforced; seeded engine-generated history replay-validated and reconstructed with measured SQLite sizes", { commands: long.head.command, events: long.head.event });
  assertBuildUnchanged(producer, root);
} catch (error) { failed = error; process.stderr.write(`${String(error)}\n`); }
finally {
  for (const socket of sockets) { try { socket.close(); } catch { /* Runtime cleanup owns any remaining transport. */ } }
  await runtime.stop(); await writeFile(resolve(output, "runtime.log"), logs);
  await writeFile(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
  await writeFile(resolve(output, "rpc-samples.json"), JSON.stringify(samples, null, 2));
  await writeFile(resolve(output, "summary.json"), JSON.stringify({ passed: !failed, starts, groups: observations.length, error: failed ? String(failed) : null }, null, 2));
}
if (failed) throw failed;
process.stdout.write(`Evidence: ${output}\n`);
