import { createInitialState } from "@li4chess/engine";
import { appendReplay, canonicalJson, createReplay, readReplay, sha256 } from "@li4chess/protocol";
import type { EngineBuildIdentityV1, ReplayEnvelopeV2 } from "@li4chess/protocol";
import { fields, PROTOCOL, readCommand, Rejection } from "./command.js";
import { assertSuccessor } from "./persistence.js";
import type { Snapshot } from "./persistence.js";

interface Env { ROOMS: DurableObjectNamespace; DB: D1Database; ASSETS: Fetcher; SPIKE_KEY: string; ENGINE_BUILD: string }
interface Pending { snapshot: Snapshot; hash: string; previousHash: string | null }
type Fault = "none" | "before-prepare" | "after-prepare" | "d1-failure" | "after-d1" | "after-finalize" | "delay-d1";
const faults: Fault[] = ["none", "before-prepare", "after-prepare", "d1-failure", "after-d1", "after-finalize", "delay-d1"];
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function boundedBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = []; let length = 0;
  let oversized = Number(request.headers.get("content-length")) > 4096;
  if (reader) {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      if (!oversized) {
        length += part.value.length;
        if (length > 4096) oversized = true;
        else chunks.push(part.value);
      }
      // Drain but never retain excess bytes. In this local runtime, canceling
      // an unread inbound stream before responding can crash the stream pump.
    }
  }
  if (oversized) throw new Rejection(413, "Command too large");
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
  return bytes;
}

/** Local fixture capability only. Guest issuance/revocation is M3-02. */
export async function seatToken(key: string, room: string, seat: number): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(`${room}:${seat}`));
  return `${seat}.${Array.from(new Uint8Array(signed), n => n.toString(16).padStart(2, "0")).join("")}`;
}
function roomPath(request: Request) {
  const match = /^\/api\/rooms\/([a-zA-Z0-9_-]{1,64})\/(init|commands|automatic|snapshot|ws|fault|inspect|forget)$/.exec(new URL(request.url).pathname);
  if (!match) throw new Rejection(404, "Unknown route");
  return { room: match[1], operation: match[2] };
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // Even accidental deployment cannot expose fixture administration.
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/^[a-f0-9]{64}$/.test(env.SPIKE_KEY ?? "")) return json({ error: "Local probe only" }, 403);
    if (url.pathname === "/health") return json({ ok: true });
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      // Do not forward a live client stream across the Worker/DO boundary: an
      // early room response otherwise races workerd's deferred stream pump.
      const forwarded = request.body ? new Request(request, { body: await boundedBody(request) }) : request;
      const { room } = roomPath(request);
      return await env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(forwarded);
    } catch (error) { return json({ error: error instanceof Error ? error.message : "Unavailable" }, error instanceof Rejection ? error.status : 503); }
  },
};

export class GameRoom implements DurableObject {
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  constructor(private ctx: DurableObjectState, private env: Env) {}
  // DO input gates do not serialize across arbitrary external awaits. Every room
  // operation joins this queue, including handshake/resync and recovery.
  fetch(request: Request): Promise<Response> {
    if (this.queued >= 16) return (async () => {
      await boundedBody(request);
      return json({ error: "Probe queue limit" }, 429);
    })();
    this.queued++;
    const run = this.tail.then(() => this.handle(request)).finally(() => { this.queued--; });
    this.tail = run.catch(() => undefined);
    return run.catch(error => {
      if (!(error instanceof Rejection)) {
        // A committed response/broadcast may have been interrupted. Force every
        // observer to resync instead of leaving a healthy but stale connection.
        const sockets = this.ctx.getWebSockets();
        console.log(JSON.stringify({ event: "recovery_disconnect", sockets: sockets.length }));
        for (const socket of sockets) {
          if (socket.readyState !== WebSocket.OPEN) continue;
          try {
            const before = socket.readyState;
            socket.send(JSON.stringify({ protocol: PROTOCOL, type: "resyncRequired" }));
            socket.close(4001, "Persistence recovery; reconnect");
            console.log(JSON.stringify({ event: "recovery_socket_close", before, after: socket.readyState }));
          } catch (closeError) { console.error("Socket recovery close failed", String(closeError)); }
        }
      }
      console.log(JSON.stringify({ event: "room_rejection", status: error instanceof Rejection ? error.status : 503,
        message: error instanceof Error ? error.message : "Unavailable" }));
      return json({ error: error instanceof Rejection ? error.message : "Persistence unavailable; retry same command" }, error instanceof Rejection ? error.status : 503);
    });
  }
  private database() { return this.env.DB.withSession("first-primary"); }
  private async fault(): Promise<Fault> { return await this.ctx.storage.get<Fault>("fault") ?? "none"; }
  private async boundary(point: Fault) {
    if (await this.fault() === point) throw new Error(`injected ${point}`);
  }
  private async decode(text: string): Promise<Snapshot> {
    const value = JSON.parse(text) as Snapshot;
    if (value.protocol !== PROTOCOL || !Number.isSafeInteger(value.commandSequence) || value.commandSequence < 0) throw new Error("Invalid stored snapshot");
    const verified = await readReplay(value.replay);
    if (verified.state.pendingEffects.length) throw new Error("Incomplete canonical transaction");
    return value;
  }
  private async latest(room: string): Promise<Snapshot | null> {
    const row = await this.database().prepare("SELECT payload FROM commits WHERE room=? ORDER BY seq DESC LIMIT 1").bind(room).first<{ payload: string }>();
    return row ? this.decode(row.payload) : null;
  }
  private async recover(room: string): Promise<Snapshot> {
    const pending = await this.ctx.storage.get<Pending>("pending");
    if (pending) {
      const payload = canonicalJson(pending.snapshot);
      if (await sha256(payload) !== pending.hash) throw new Error("Prepared content corrupt");
      await this.decode(payload);
      await this.boundary("after-prepare");
      if (await this.fault() === "delay-d1") await new Promise(resolve => setTimeout(resolve, 500));
      const db = this.database();
      const prior = await this.latest(room);
      const seq = pending.snapshot.commandSequence;
      if (prior && prior.commandSequence === seq) {
        if (canonicalJson(prior) !== payload) throw new Error("Canonical/pending conflict");
      } else {
        await assertSuccessor(prior, pending.snapshot, pending.previousHash);
        const insert = db.prepare("INSERT INTO commits(room,seq,command_id,command_hash,payload) VALUES(?,?,?,?,?)")
          .bind(room, seq, pending.snapshot.receipt.id, pending.snapshot.receipt.commandHash, payload);
        // Real D1 transactional rollback fault, not a mocked binding.
        await db.batch(await this.fault() === "d1-failure" ? [insert, db.prepare("INSERT INTO nonexistent_spike_fault VALUES(1)")] : [insert]);
      }
      await this.boundary("after-d1");
      await this.ctx.storage.transaction(async txn => {
        await txn.put("snapshot", pending.snapshot);
        await txn.delete("pending");
      });
      await this.boundary("after-finalize");
      this.broadcast(pending.snapshot);
      return pending.snapshot;
    }
    // D1 is canonical even after the DO cache is lost. Never silently pick a
    // conflicting cache or append after an unverified durable prefix.
    const canonical = await this.latest(room);
    if (!canonical) throw new Rejection(404, "Room not initialized");
    const cache = await this.ctx.storage.get<Snapshot>("snapshot");
    if (cache && canonicalJson(cache) !== canonicalJson(canonical)) throw new Error("Cache/canonical conflict");
    await this.ctx.storage.put("snapshot", canonical);
    return canonical;
  }
  private broadcast(snapshot: Snapshot) {
    for (const socket of this.ctx.getWebSockets()) {
      try { socket.send(JSON.stringify(snapshot)); } catch { try { socket.close(4002, "Reconnect"); } catch { /* socket already closed */ } }
    }
  }
  private async authorize(request: Request, room: string, admin: boolean): Promise<number | null> {
    const protocols = request.headers.get("Sec-WebSocket-Protocol")?.split(",").map(p => p.trim()) ?? [];
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "") ?? protocols.find(p => p.startsWith("seat."))?.slice(5);
    if (admin) {
      if (token !== this.env.SPIKE_KEY) throw new Rejection(403, "Fixture authority required");
      return null;
    }
    const seat = Number(token?.split(".")[0]);
    if (!Number.isInteger(seat) || seat < 0 || seat > 3 || token !== await seatToken(this.env.SPIKE_KEY, room, seat)) throw new Rejection(403, "Invalid seat capability");
    return seat;
  }
  private async body(request: Request): Promise<unknown> {
    const text = new TextDecoder().decode(await boundedBody(request));
    try { return JSON.parse(text); } catch { throw new Rejection(400, "Invalid JSON"); }
  }
  private async handle(request: Request): Promise<Response> {
    const { room, operation } = roomPath(request);
    const readonly = ["snapshot", "inspect", "ws"].includes(operation);
    if (request.method !== (readonly ? "GET" : "POST")) {
      await boundedBody(request); throw new Rejection(405, "Invalid method");
    }
    // Consume the bounded body before early authorization responses. workerd
    // can otherwise retain a forwarded request stream after its response ends.
    const inputBody = readonly ? undefined : await this.body(request);
    const origin = request.headers.get("Origin");
    if (origin !== null && origin !== new URL(request.url).origin) throw new Rejection(403, "Invalid origin");
    const admin = ["init", "fault", "inspect", "forget", "automatic"].includes(operation);
    const seat = await this.authorize(request, room, admin);
    if (operation === "fault") {
      const input = fields(inputBody, ["point"]);
      if (!faults.includes(input.point as Fault)) throw new Rejection(400, "Unknown fault");
      await this.ctx.storage.put("fault", input.point); return json({ ok: true });
    }
    if (operation === "inspect") {
      const counts = await this.database().prepare("SELECT count(*) AS d1Rows,max(seq) AS d1MaxSequence FROM commits WHERE room=?").bind(room).first();
      return json({ pending: Boolean(await this.ctx.storage.get("pending")), commandSequence: (await this.ctx.storage.get<Snapshot>("snapshot"))?.commandSequence ?? null, ...counts });
    }
    if (operation === "forget") { await this.ctx.storage.delete("snapshot"); return json({ ok: true }); }
    if (operation === "init") {
      const input = fields(inputBody, ["seed"]);
      if (typeof input.seed !== "string" || !/^[a-f0-9]{8}$/.test(input.seed) || input.seed === "00000000") throw new Rejection(400, "Invalid seed");
      await this.env.DB.prepare("CREATE TABLE IF NOT EXISTS commits(room TEXT NOT NULL,seq INTEGER NOT NULL,command_id TEXT NOT NULL,command_hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(room,seq),UNIQUE(room,command_id))").run();
      if (await this.latest(room) || await this.ctx.storage.get("pending")) throw new Rejection(409, "Room exists");
      const initial = { ...createInitialState(), randomSeed: input.seed };
      const replay = await createReplay(initial, JSON.parse(this.env.ENGINE_BUILD) as EngineBuildIdentityV1);
      const snapshot: Snapshot = { protocol: PROTOCOL, commandSequence: 0, replay, receipt: { id: "init", commandHash: "init" } };
      await this.ctx.storage.put("pending", { snapshot, hash: await sha256(canonicalJson(snapshot)), previousHash: null } satisfies Pending);
      return json(await this.recover(room));
    }
    const snapshot = await this.recover(room);
    if (operation === "snapshot") return json(snapshot);
    if (operation === "ws") {
      const protocols = request.headers.get("Sec-WebSocket-Protocol")?.split(",").map(p => p.trim()) ?? [];
      const since = new URL(request.url).searchParams.get("since");
      if (!protocols.includes(PROTOCOL)) throw new Rejection(426, "Unsupported protocol");
      if (origin === null || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") throw new Rejection(400, "Expected same-origin WebSocket");
      if (since === null || !/^\d+$/.test(since) || !Number.isSafeInteger(Number(since)) || Number(since) > snapshot.commandSequence) throw new Rejection(409, "Invalid reconnect sequence");
      if (this.ctx.getWebSockets().length >= 8) throw new Rejection(429, "Probe socket limit");
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]); pair[1].send(JSON.stringify(snapshot));
      return new Response(null, { status: 101, webSocket: pair[0], headers: { "Sec-WebSocket-Protocol": PROTOCOL } });
    }
    const command = readCommand(inputBody, seat);
    const commandHash = await sha256(canonicalJson(command));
    const prior = await this.database().prepare("SELECT command_hash,payload FROM commits WHERE room=? AND command_id=?").bind(room,command.id)
      .first<{ command_hash: string; payload: string }>();
    if (prior) {
      if (prior.command_hash !== commandHash) throw new Rejection(409, "Command ID reused with different content");
      return json(await this.decode(prior.payload));
    }
    if (command.expectedSequence !== snapshot.commandSequence) throw new Rejection(409, "Stale command");
    if (snapshot.commandSequence >= 64) throw new Rejection(409, "Prototype command cap");
    // Preserve original producer; deployments changing this build must drain or
    // explicitly checkpoint into a new lineage, never relabel stored history.
    if (canonicalJson(snapshot.replay.engineBuild) !== canonicalJson(JSON.parse(this.env.ENGINE_BUILD))) throw new Rejection(409, "Producer changed; migration required");
    let replay: ReplayEnvelopeV2;
    try { replay = await appendReplay(snapshot.replay, command.action, snapshot.replay.engineBuild); }
    catch { throw new Rejection(409, "Illegal action or terminal game"); }
    const next: Snapshot = { protocol: PROTOCOL, commandSequence: snapshot.commandSequence + 1, replay, receipt: { id: command.id, commandHash } };
    const payload = canonicalJson(next);
    if (new TextEncoder().encode(payload).length > 1_000_000) throw new Rejection(413, "Prototype snapshot cap");
    await this.boundary("before-prepare");
    await this.ctx.storage.put("pending", { snapshot: next, hash: await sha256(payload), previousHash: await sha256(canonicalJson(snapshot)) } satisfies Pending);
    return json(await this.recover(room));
  }
  webSocketMessage(socket: WebSocket): void { socket.close(4003, "Use authenticated HTTP commands"); }
  webSocketClose(socket: WebSocket, code: number): void {
    socket.close(code === 1000 || (code >= 3000 && code <= 4999) ? code : 1000, "Closed");
  }
  webSocketError(socket: WebSocket): void { socket.close(4002, "Reconnect"); }
}
