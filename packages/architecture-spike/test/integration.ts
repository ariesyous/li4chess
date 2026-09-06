/** Actual local workerd/DO/D1 integration. No accounts or hosted resources. */
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHmac, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, copyFile, cp, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import WebSocket from "ws";
import { legalMoves, localSquare, PieceType, type PlayerColor } from "@li4chess/engine";
import { appendReplay, canonicalJson, engineState, readReplay, type ActionRequest,
  type ReplayEnvelopeV2 } from "@li4chess/protocol";
import { readBuildIdentity, assertBuildUnchanged, runtimeEnvironment } from "@li4chess/protocol/node";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(packageRoot, "../..");
const output = resolve(process.env.M3_OUTPUT ?? resolve(root, "arena-results", `m3-01-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`));
const base = "http://127.0.0.1:8799";
const protocol = "li4chess-room-spike-v1";
const key = Array.from(randomBytes(32), byte => byte.toString(16).padStart(2, "0")).join("");
const producer = readBuildIdentity(root);
const observations: Record<string, unknown>[] = [];
const checks: string[] = [];
const sockets = new Set<WebSocket>();
let child: ChildProcess | undefined;
let restartCount = 0;
let runtimeLog = "";
let outputCreated = false;

interface Snapshot { protocol: string; commandSequence: number; replay: ReplayEnvelopeV2 }
interface ResyncRequired { protocol: string; type: "resyncRequired" }
interface Command { protocol: string; id: string; expectedSequence: number; action: ActionRequest }
function token(room: string, seat: PlayerColor): string {
  return `${seat}.${createHmac("sha256", key).update(`${room}:${seat}`).digest("hex")}`;
}
function command(snapshot: Snapshot, action: ActionRequest, id = `command-${snapshot.commandSequence + 1}`): Command {
  return { protocol, id, expectedSequence: snapshot.commandSequence, action };
}
function redact(text: string): string {
  return text.replaceAll(key, "[SPIKE_KEY redacted]").replace(/env\.SPIKE_KEY[^\r\n]*/g, "env.SPIKE_KEY [redacted]");
}
function note(name: string): void { checks.push(name); process.stdout.write(`PASS ${name}\n`); }
async function request(room: string, path: string, body?: unknown, auth: string = key,
  expectedStatus = 200): Promise<unknown> {
  const started = performance.now();
  const response = await fetch(`${base}/api/rooms/${room}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  observations.push({ room, path, method: body === undefined ? "GET" : "POST", status: response.status,
    durationMs: Math.round(performance.now() - started), ...(body === undefined ? {} : { request: body }), response: data });
  assert.equal(response.status, expectedStatus, `${path}: ${text}`);
  return data;
}
async function snapshot(room: string): Promise<Snapshot> {
  return await request(room, "snapshot", undefined, token(room, 0)) as Snapshot;
}
async function init(room: string): Promise<Snapshot> {
  const state = await request(room, "init", { seed: "00000001" }) as Snapshot;
  assert.equal(state.protocol, protocol); assert.equal(state.commandSequence, 0);
  await readReplay(state.replay);
  return state;
}
async function fault(room: string, point: string): Promise<void> { await request(room, "fault", { point }); }
async function submit(room: string, body: Command, status = 200, automatic = false): Promise<Snapshot> {
  return await request(room, automatic ? "automatic" : "commands", body,
    automatic ? key : token(room, body.action.actor), status) as Snapshot;
}
async function verify(before: Snapshot, after: Snapshot, action: ActionRequest): Promise<void> {
  assert.equal(after.protocol, protocol);
  assert.equal(after.commandSequence, before.commandSequence + 1);
  const expected = await appendReplay(before.replay, action, producer);
  assert.equal(canonicalJson(after.replay), canonicalJson(expected), "exact independent replay reconstruction");
  const checked = await readReplay(after.replay);
  assert.equal(checked.state.pendingEffects.length, 0, "no partially committed effects exposed");
}
async function move(snapshot: Snapshot, pawn = false): Promise<ActionRequest> {
  const state = engineState((await readReplay(snapshot.replay)).state);
  const candidates = legalMoves(state);
  const selected = pawn ? state.completedMoves[state.turn] === 0
    ? candidates.find(m => m.from === localSquare(state.turn, 4, 1))
    : candidates.find(m => m.piece.type === PieceType.Pawn && !m.piece.hasMoved) : candidates[0];
  assert.ok(selected, "legal test move exists");
  return { type: "move", actor: state.turn, move: { from: selected.from, to: selected.to,
    ...(selected.promotion ? { promotion: selected.promotion } : {}) } };
}
async function accept(room: string, before: Snapshot, action: ActionRequest): Promise<Snapshot> {
  const after = await submit(room, command(before, action)); await verify(before, after, action); return after;
}
async function start(): Promise<void> {
  const config = resolve(packageRoot, ".generated", "wrangler.integration.json");
  restartCount++;
  child = spawn(process.execPath, [resolve(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--local",
    "--ip", "127.0.0.1", "--port", "8799", "--persist-to", resolve(output, "runtime"), "--config", config], {
    cwd: packageRoot, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, CI: "true", WRANGLER_SEND_METRICS: "false", CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_API_KEY: "",
      CLOUDFLARE_EMAIL: "", CLOUDFLARE_ACCOUNT_ID: "" },
  });
  const current = child;
  current.stdout!.on("data", (data: Buffer) => { runtimeLog += redact(data.toString()); });
  current.stderr!.on("data", (data: Buffer) => { runtimeLog += redact(data.toString()); });
  let startupError: Error | undefined;
  current.once("error", error => { startupError = error; });
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (startupError) throw startupError;
    if (current.exitCode !== null) throw new Error(`Wrangler exited ${current.exitCode}: ${runtimeLog.slice(-8000)}`);
    try {
      const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok && (await response.json() as { ok?: boolean }).ok === true) return;
    } catch { /* Startup readiness polling only; assertions are never retried. */ }
    await sleep(150);
  }
  throw new Error(`Wrangler readiness timeout: ${runtimeLog.slice(-8000)}`);
}
async function stop(): Promise<void> {
  for (const socket of sockets) socket.terminate();
  sockets.clear();
  if (!child?.pid) return;
  const current = child; child = undefined;
  if (current.exitCode !== null) return;
  const exited = new Promise<void>(resolveExit => current.once("exit", () => resolveExit()));
  if (process.platform === "win32") {
    execFileSync("taskkill", ["/PID", String(current.pid), "/T", "/F"], { windowsHide: true, stdio: "pipe" });
  } else {
    process.kill(-current.pid!, "SIGKILL");
  }
  await Promise.race([exited, sleep(5000).then(() => { throw new Error("Wrangler process tree did not exit"); })]);
}
async function restart(): Promise<void> { await stop(); await start(); }
async function connect(room: string, since: number): Promise<{ socket: WebSocket; messages: Snapshot[]; controls: ResyncRequired[] }> {
  const socket = new WebSocket(`${base.replace("http:", "ws:")}/api/rooms/${room}/ws?since=${since}`,
    [protocol, `seat.${token(room, 0)}`], { origin: base });
  const messages: Snapshot[] = []; const controls: ResyncRequired[] = []; sockets.add(socket);
  socket.on("close", (code, reason) => {
    sockets.delete(socket); observations.push({ transport: "websocket", room, event: "close", code, reason: reason.toString() });
  });
  socket.on("message", data => {
    const message = JSON.parse(data.toString()) as Snapshot | ResyncRequired;
    if ("type" in message && message.type === "resyncRequired") controls.push(message);
    else messages.push(message as Snapshot);
    observations.push({ transport: "websocket", room, since, message });
  });
  await new Promise<void>((resolveOpen, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket open timeout")), 10000);
    socket.once("open", () => { clearTimeout(timeout); resolveOpen(); });
    socket.once("error", error => { clearTimeout(timeout); reject(error); });
  });
  await until(() => messages.length === 1, "initial WebSocket snapshot");
  return { socket, messages, controls };
}
async function until(predicate: () => boolean, description: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (!predicate() && Date.now() < deadline) await sleep(10);
  assert.ok(predicate(), description);
}
async function rejectSocket(room: string, protocols: string[], origin: string, expectedStatus: number, since = 0): Promise<void> {
  const socket = new WebSocket(`${base.replace("http:", "ws:")}/api/rooms/${room}/ws?since=${since}`, protocols, { origin });
  await new Promise<void>((resolveRejected, reject) => {
    const timeout = setTimeout(() => { socket.terminate(); reject(new Error("WebSocket rejection timeout")); }, 5000);
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout); response.resume(); socket.terminate();
      try { assert.equal(response.statusCode, expectedStatus); resolveRejected(); } catch (error) { reject(error); }
    });
    socket.once("open", () => { clearTimeout(timeout); socket.terminate(); reject(new Error("Unauthorized WebSocket opened")); });
    socket.on("error", () => { /* Expected termination after rejected upgrade. */ });
  });
}

async function basicCommands(): Promise<void> {
  const room = "commands"; const initial = await init(room);
  assert.match(await (await fetch(`${base}/`)).text(), /<!doctype html/i);
  const viteHtml = await (await fetch(`${base}/li4chess/`)).text();
  const moduleUrl = /src="(\/li4chess\/assets\/[^" ]+\.js)"/.exec(viteHtml)?.[1];
  assert.ok(moduleUrl, "shipped Vite application is served by Workers Static Assets at its project base");
  const moduleResponse = await fetch(`${base}${moduleUrl}`);
  assert.equal(moduleResponse.status, 200); assert.match(moduleResponse.headers.get("content-type") ?? "", /javascript/);
  const badRoute = await fetch(`${base}/api/bad`); assert.equal(badRoute.status, 404);
  assert.match(badRoute.headers.get("content-type") ?? "", /json/);
  const action = await move(initial);
  const body = command(initial, action);
  const unauthenticated = await fetch(`${base}/api/rooms/${room}/snapshot`);
  assert.equal(unauthenticated.status, 403); await unauthenticated.text();
  observations.push({ name: "missing-authorization-header", status: unauthenticated.status });
  await request(room, "commands", body, "invalid", 403);
  await request(room, "commands", body, token(room, 1), 403);
  await request(room, "commands", { ...body, protocol: "legacy" }, token(room, 0), 426);
  await request(room, "commands", { ...body, injected: true }, token(room, 0), 400);
  await request(room, "commands", { ...body, action: { ...action, injected: true } }, token(room, 0), 400);
  await request(room, "commands", { ...body, action: { type: "randomKingMove", actor: 0 } }, token(room, 0), 403);
  await request(room, "commands", { ...body, action: { type: "timeout", actor: 0, clock: { remainingMs: 0 } } }, token(room, 0), 400);
  await request(room, "commands", { ...body, action: { ...action, actor: 1 } }, token(room, 1), 409);
  await request(room, "snapshot", {}, token(room, 0), 405);
  await request(room, "commands", { oversized: "x".repeat(5000) }, token(room, 0), 413);
  const oversized = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode(" ".repeat(3000)));
    controller.enqueue(new TextEncoder().encode(" ".repeat(3000))); controller.close();
  } });
  const oversizedResponse = await fetch(`${base}/api/rooms/${room}/commands`, {
    method: "POST", headers: { Authorization: `Bearer ${token(room, 0)}` }, body: oversized,
    duplex: "half", signal: AbortSignal.timeout(5000),
  } as RequestInit & { duplex: "half" });
  const oversizedText = await oversizedResponse.text();
  observations.push({ name: "oversized-chunked-body", bodyBytes: 6000, status: oversizedResponse.status, response: oversizedText });
  assert.equal(oversizedResponse.status, 413, oversizedText);
  assert.deepEqual(await snapshot(room), initial);
  note("static Worker asset, seat authorization, strict versions/fields, server-only actions, rejected methods and bounded bodies");
  const observer = await connect(room, 0); assert.deepEqual(observer.messages[0], initial);
  const accepted = await submit(room, body); await verify(initial, accepted, action);
  await until(() => observer.messages.length === 2, "one accepted broadcast");
  assert.deepEqual(observer.messages[1], await snapshot(room));
  assert.deepEqual(await submit(room, body), accepted, "lost response retry returns original receipt");
  await submit(room, { ...body, action: { type: "resign", actor: 0 } }, 409);
  await submit(room, { ...body, id: "stale" }, 409);
  assert.equal(observer.messages.length, 2, "duplicate/stale/collision cannot broadcast");
  const nextAction = await move(accepted);
  const concurrent = await Promise.all([
    fetch(`${base}/api/rooms/${room}/commands`, { method: "POST", headers: { Authorization: `Bearer ${token(room, 1)}`, "Content-Type": "application/json" }, body: JSON.stringify(command(accepted, nextAction, "concurrent-a")) }),
    fetch(`${base}/api/rooms/${room}/commands`, { method: "POST", headers: { Authorization: `Bearer ${token(room, 1)}`, "Content-Type": "application/json" }, body: JSON.stringify(command(accepted, nextAction, "concurrent-b")) }),
  ]);
  assert.deepEqual(concurrent.map(r => r.status).sort(), [200, 409]);
  const concurrentBodies = await Promise.all(concurrent.map(r => r.json()));
  observations.push({ name: "concurrent-arrivals", statuses: concurrent.map(r => r.status), responses: concurrentBodies });
  const afterConcurrent = await snapshot(room); await verify(accepted, afterConcurrent, nextAction);
  assert.deepEqual(await submit(room, body), accepted, "old duplicate retains original receipt after later commands");
  observer.socket.close();
  const reconnected = await connect(room, 0);
  assert.deepEqual(reconnected.messages[0], afterConcurrent); reconnected.socket.close();
  note("duplicate/lost response, key collision, stale command, concurrent serialization and reconnect full resync");
  await rejectSocket(room, ["legacy", `seat.${token(room, 0)}`], base, 426);
  await rejectSocket(room, [protocol, `seat.${token(room, 0)}`], "https://untrusted.example", 403);
  await rejectSocket(room, [protocol, "seat.invalid"], base, 403);
  await rejectSocket(room, [protocol, `seat.${token(room, 0)}`], base, 409, afterConcurrent.commandSequence + 1);
  await request(room, "snapshot", undefined, token("different-room", 0), 403);
  note("WebSocket version/origin/seat checks and room-bound tokens");
}

async function boundaries(): Promise<void> {
  for (const point of ["before-prepare", "after-prepare", "after-d1", "after-finalize"] as const) {
    const room = `restart-${point}`; const initial = await init(room);
    const beforeRestartSocket = await connect(room, 0);
    assert.deepEqual(beforeRestartSocket.messages[0], initial);
    const action = await move(initial); const body = command(initial, action);
    await fault(room, point); await submit(room, body, 503);
    const inspected = await request(room, "inspect") as { pending: boolean; commandSequence: number; d1Rows: number; d1MaxSequence: number };
    assert.equal(inspected.pending, point === "after-prepare" || point === "after-d1");
    assert.equal(inspected.commandSequence, point === "after-finalize" ? 1 : 0);
    assert.equal(inspected.d1Rows, point === "after-d1" || point === "after-finalize" ? 2 : 1);
    await restart(); await fault(room, "none");
    const recovered = await snapshot(room);
    if (point === "before-prepare") assert.deepEqual(recovered, initial);
    else await verify(initial, recovered, action);
    const afterRestartSocket = await connect(room, 0);
    assert.deepEqual(afterRestartSocket.messages[0], recovered, "WebSocket reconnect after actual runtime restart resynchronizes canonical history");
    afterRestartSocket.socket.close();
    const retry = await submit(room, body); await verify(initial, retry, action);
    assert.deepEqual(await submit(room, body), retry);
    const beforeForget = await snapshot(room);
    await request(room, "forget", {});
    assert.deepEqual(await snapshot(room), beforeForget, "canonical D1 reconstructs the forgotten DO cache");
    const canonical = await request(room, "inspect") as { d1Rows: number; d1MaxSequence: number };
    assert.equal(canonical.d1Rows, 2); assert.equal(canonical.d1MaxSequence, 1);
    note(`actual runtime restart at ${point}, deterministic recovery and duplicate retry`);
  }
  const room = "persistence-failure"; const initial = await init(room);
  const action = await move(initial); const body = command(initial, action);
  const observer = await connect(room, 0);
  await fault(room, "d1-failure"); await submit(room, body, 503);
  await request(room, "snapshot", undefined, token(room, 0), 503);
  await submit(room, { ...body, id: "blocked-command" }, 503);
  await until(() => observer.controls.length > 0, "D1 failure sends explicit resync control");
  assert.equal(observer.messages.length, 1, "D1 failure never broadcasts candidate");
  assert.deepEqual(observer.controls[0], { protocol, type: "resyncRequired" }, "failed persistence explicitly invalidates the observer");
  const rolledBack = await request(room, "inspect") as { d1Rows: number; pending: boolean };
  assert.equal(rolledBack.d1Rows, 1, "real D1 failed batch rolls back attempted insert"); assert.equal(rolledBack.pending, true);
  await fault(room, "none"); const recovered = await snapshot(room); await verify(initial, recovered, action);
  assert.deepEqual(await submit(room, body), recovered);
  observer.socket.close();
  note("injected D1 failure freezes reads/commands and prevents unpersisted broadcast; repair recovers exact command");
  const delayedRoom = "persistence-delay"; const delayedInitial = await init(delayedRoom);
  const delayedObserver = await connect(delayedRoom, 0); const delayedAction = await move(delayedInitial);
  await fault(delayedRoom, "delay-d1");
  let acknowledgement = false;
  const pending = submit(delayedRoom, command(delayedInitial, delayedAction)).then(result => { acknowledgement = true; return result; });
  await sleep(100); assert.equal(delayedObserver.messages.length, 1, "no broadcast while D1 delayed");
  assert.equal(acknowledgement, false, "no acknowledgement while D1 delayed");
  const concurrent = submit(delayedRoom, command(delayedInitial, delayedAction, "during-d1-delay"), 409);
  const burst = Promise.all(Array.from({ length: 24 }, async (_, index) => {
    const response = await fetch(`${base}/api/rooms/${delayedRoom}/commands`, { method: "POST",
      headers: { Authorization: `Bearer ${token(delayedRoom, delayedAction.actor)}`, "Content-Type": "application/json" },
      body: JSON.stringify(command(delayedInitial, delayedAction, `bounded-burst-${index}`)), signal: AbortSignal.timeout(15000) });
    await response.text(); return response.status;
  }));
  const delayedAccepted = await pending; await verify(delayedInitial, delayedAccepted, delayedAction);
  await concurrent;
  const burstStatuses = await burst;
  assert.ok(burstStatuses.includes(429), "bounded room queue rejects excess concurrent arrivals");
  assert.ok(burstStatuses.every(status => status === 409 || status === 429), "burst never appends after delayed commit");
  observations.push({ name: "bounded-queue-burst-during-D1-delay", statuses: burstStatuses });
  await until(() => delayedObserver.messages.length === 2, "broadcast after delayed commit");
  delayedObserver.socket.close(); await fault(delayedRoom, "none");
  note("injected delayed D1 persistence holds acknowledgement/broadcast and serializes a concurrent stale command across the await");

  const lostRoom = "lost-finalize-response"; const lostInitial = await init(lostRoom);
  const lostObserver = await connect(lostRoom, 0); const lostAction = await move(lostInitial);
  const lostCommand = command(lostInitial, lostAction);
  await fault(lostRoom, "after-finalize"); await submit(lostRoom, lostCommand, 503);
  await until(() => lostObserver.controls.length === 1, "uncertain persistence promptly signals explicit resync");
  assert.deepEqual(lostObserver.controls[0], { protocol, type: "resyncRequired" });
  observations.push({ name: "explicit-resync-before-TCP-close", readyState: lostObserver.socket.readyState,
    interpretation: "Client discards this connection on resyncRequired and reconnects without waiting for local proxy TCP close completion." });
  lostObserver.socket.close(); // Retire this connection; resync never waits for its close event.
  assert.equal(lostObserver.messages.length, 1, "lost finalize response does not falsely broadcast success");
  await fault(lostRoom, "none");
  const lostReconnect = await connect(lostRoom, 0);
  await verify(lostInitial, lostReconnect.messages[0], lostAction);
  assert.deepEqual(await submit(lostRoom, lostCommand), lostReconnect.messages[0]);
  lostReconnect.socket.close();
  note("lost after-finalize response explicitly invalidates stale socket; immediate reconnect and retry recover canonical success");
}

async function terminalAndRandom(): Promise<void> {
  const room = "repetition"; let state = await init(room);
  const outbound = new Map<PlayerColor, { from: number; to: number }>();
  for (let index = 0; index < 16; index++) {
    const position = engineState((await readReplay(state.replay)).state);
    const actor = position.turn;
    if (index < 4) {
      const knight = legalMoves(position).find(m => m.piece.type === PieceType.Knight);
      assert.ok(knight); outbound.set(actor, { from: knight.from, to: knight.to });
    }
    const selected = outbound.get(actor)!;
    const action: ActionRequest = { type: "move", actor, move: Math.floor(index / 4) % 2 === 0 ? selected : { from: selected.to, to: selected.from } };
    if (index === 15) {
      const before = state; const body = command(before, action);
      await fault(room, "after-d1"); await submit(room, body, 503);
      await restart(); await fault(room, "none"); state = await snapshot(room);
      await verify(before, state, action); assert.deepEqual(await submit(room, body), state);
    } else state = await accept(room, state, action);
  }
  const final = engineState((await readReplay(state.replay)).state);
  assert.equal(final.result?.reason, "repetition");
  assert.deepEqual(final.awardLedger.map(award => [award.rule, award.recipient, award.delta]),
    [0, 1, 2, 3].map(seat => ["repetition", seat, 10]));
  assert.equal(final.eventSequence, 21); assert.equal(state.commandSequence, 16);
  await submit(room, command(state, { type: "resign", actor: 0 }), 409);
  assert.deepEqual(await snapshot(room), state);
  await writeFile(resolve(output, "repetition.replay.json"), JSON.stringify(state.replay, null, 2));
  note("Modern 16-move repetition completes exact terminal result/ordered awards across after-D1 restart");

  const walkingRoom = "walking"; let walking = await init(walkingRoom);
  for (let index = 0; index < 12; index++) walking = await accept(walkingRoom, walking, await move(walking, true));
  walking = await accept(walkingRoom, walking, { type: "resign", actor: 0 });
  const beforeRandom = walking;
  const random: ActionRequest = { type: "randomKingMove", actor: 0 };
  const randomCommand = command(walking, random);
  await fault(walkingRoom, "after-prepare"); await submit(walkingRoom, randomCommand, 503, true);
  await restart(); await fault(walkingRoom, "none"); walking = await snapshot(walkingRoom);
  await verify(beforeRandom, walking, random);
  assert.deepEqual(await submit(walkingRoom, randomCommand, 200, true), walking);
  const randomState = engineState((await readReplay(walking.replay)).state);
  assert.equal(randomState.randomActions.length, 1);
  assert.equal(randomState.randomActions[0].selection.seed, "00000001");
  assert.ok(randomState.randomDrawIndex > 0);
  walking = await accept(walkingRoom, walking, { type: "resign", actor: 1 });
  const beforeTerminal = walking; const terminal: ActionRequest = { type: "resign", actor: 2 };
  const terminalCommand = command(walking, terminal);
  await fault(walkingRoom, "after-finalize"); await submit(walkingRoom, terminalCommand, 503);
  await restart(); await fault(walkingRoom, "none"); walking = await snapshot(walkingRoom);
  await verify(beforeTerminal, walking, terminal);
  assert.deepEqual(await submit(walkingRoom, terminalCommand), walking);
  const complete = engineState((await readReplay(walking.replay)).state);
  assert.equal(complete.result?.reason, "elimination"); assert.equal(complete.result.winner, 3);
  assert.deepEqual(complete.awardLedger.map(award => [award.rule, award.recipient, award.delta]),
    [["survivor", 3, 20], ["survivor", 3, 20], ["survivor", 3, 20]]);
  assert.equal(complete.randomActions.length, 1);
  await writeFile(resolve(output, "walking.replay.json"), JSON.stringify(walking.replay, null, 2));
  note("post-opening walking action and third-forfeit terminal survive restart with exact PRNG and survivor awards");
}

async function prepare(): Promise<void> {
  assert.ok(Number(process.versions.node.split(".")[0]) >= 24, "Node 24+ required");
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { recursive: false });
  outputCreated = true;
  const preexisting = await fetch(`${base}/health`, { signal: AbortSignal.timeout(500) }).then(() => true, () => false);
  assert.equal(preexisting, false, "port 8799 must be unused; never attach tests to an existing server");
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8", windowsHide: true }).split("\0").filter(Boolean);
  for (const file of new Set(files)) {
    const destination = resolve(output, "source", file); await mkdir(dirname(destination), { recursive: true });
    try { await copyFile(resolve(root, file), destination); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const sourceConfig = JSON.parse(await readFile(resolve(packageRoot, "wrangler.jsonc"), "utf8")) as Record<string, unknown>;
  const assets = sourceConfig.assets as { directory: string } | undefined;
  const assetRoot = resolve(packageRoot, ".generated", `site-${Date.now()}`);
  const viteOutput = resolve(root, "apps/web/dist");
  await readFile(resolve(viteOutput, "index.html")); // pnpm build is an explicit prerequisite.
  await mkdir(assetRoot, { recursive: true });
  await cp(viteOutput, resolve(assetRoot, "li4chess"), { recursive: true });
  await copyFile(resolve(packageRoot, "public/index.html"), resolve(assetRoot, "index.html"));
  const assetHashes: Record<string, string> = {};
  async function hashAssets(directory: string, prefix = ""): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`; const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await hashAssets(path, `${name}/`);
      else assetHashes[name] = `sha256:${createHash("sha256").update(await readFile(path)).digest("hex")}`;
    }
  }
  await hashAssets(assetRoot);
  await cp(assetRoot, resolve(output, "assets"), { recursive: true });
  const config = { ...sourceConfig, main: resolve(packageRoot, sourceConfig.main as string),
    ...(assets ? { assets: { ...assets, directory: assetRoot } } : {}),
    vars: { ...(sourceConfig.vars as object ?? {}), SPIKE_KEY: key, ENGINE_BUILD: JSON.stringify(producer) },
    d1_databases: (sourceConfig.d1_databases as Record<string, unknown>[]).map(db => ({ ...db,
      ...(db.migrations_dir ? { migrations_dir: resolve(packageRoot, db.migrations_dir as string) } : {}) })),
  };
  await mkdir(resolve(packageRoot, ".generated"), { recursive: true });
  await writeFile(resolve(packageRoot, ".generated", "wrangler.integration.json"), JSON.stringify(config, null, 2));
  await writeFile(resolve(output, "configuration.json"), redact(JSON.stringify(config, null, 2)));
  const pnpmVersion = process.env.npm_config_user_agent?.match(/pnpm\/([^ ]+)/)?.[1];
  assert.equal(pnpmVersion, "10.33.0", "Run through pinned pnpm 10.33.0");
  const versions = { wrangler: JSON.parse(await readFile(resolve(root, "node_modules/wrangler/package.json"), "utf8")).version,
    pnpm: pnpmVersion, workerd: (await readdir(resolve(root, "node_modules/.pnpm"))).filter(name => /^workerd@/.test(name)) };
  await writeFile(resolve(output, "manifest.json"), JSON.stringify({ createdAt: new Date().toISOString(), producer,
    environment: runtimeEnvironment(), versions, command: "pnpm --filter @li4chess/architecture-spike test:integration",
    scope: "Actual local Wrangler/workerd, SQLite Durable Objects and D1 emulation; explicitly injected application failures; no hosted guarantees",
    sourceSnapshot: "source/", assetHashes, seed: "00000001", port: 8799, persistentRuntimeDirectory: "runtime/" }, null, 2));
}

let failure: unknown;
try {
  await prepare(); await start(); await basicCommands(); await boundaries(); await terminalAndRandom();
  await sleep(250); // Include late WebSocket-close diagnostics in the validation.
  assert.doesNotMatch(runtimeLog, /\[ERROR\].*Uncaught|Can't read from request stream|Invalid WebSocket close code/,
    "runtime must not emit unhandled request-stream or WebSocket errors");
  note("runtime log contains no unhandled request-stream or WebSocket errors");
  assertBuildUnchanged(producer, root); note("source/build identity unchanged throughout integration");
} catch (error) {
  failure = error; process.exitCode = 1; process.stderr.write(`${String(error)}\n`);
  await sleep(250); // Drain runtime diagnostic pipes before stopping its process tree.
}
finally {
  try { await stop(); } catch (error) { failure ??= error; process.exitCode = 1; }
  if (outputCreated) {
    await writeFile(resolve(output, "runtime.log"), redact(runtimeLog));
    await writeFile(resolve(output, "observations.json"), JSON.stringify(observations, null, 2));
    await writeFile(resolve(output, "summary.json"), JSON.stringify({ passed: !failure, checks, runtimeStarts: restartCount,
      ...(failure ? { failure: String(failure), stack: failure instanceof Error ? failure.stack : undefined } : {}) }, null, 2));
    process.stdout.write(`Evidence: ${output}\n`);
  }
}
