// Isolated fixture transport. No application configuration references this entry.
import { DurableObject } from "cloudflare:workers";
import { D1Persistence, exactReader } from "@li4chess/persistence";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import type { PlayerColor } from "@li4chess/engine";
import { Room, type Connection, type ConnectionContext, type Creation, type Publication } from "../src/room.js";
import { SQLiteRoomStorage, type RoomStorage } from "../src/storage.js";
import type { Timing } from "../src/timing.js";
import { GameRoom } from "../src/index.js";
interface Env { DB: D1Database; ROOMS: DurableObjectNamespace; REAL_ROOMS: DurableObjectNamespace; TEST_KEY: string; PLAYER_KEYS: string[]; PRODUCER: EngineBuildIdentityV1 }
type Body = { op: string; room: string; creation: Creation; now: number | null; connection?: string; generation?: number;
  nextGeneration: number; request: Parameters<Room["command"]>[1]; fault: { stage: string; mode: "pause" | "throw"; delayMs?: number; remaining?: number };
  key: string; value: unknown; sql: string; values?: (string | number | null)[]; namespace?: string; handle?: number };
export class TestRoom extends DurableObject<Env> {
  private room: Room;
  private base: SQLiteRoomStorage;
  private handles = new Map<string, { context: ConnectionContext; channel: Connection }[]>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS fixture (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    this.base = new SQLiteRoomStorage(ctx.storage);
    const storage: RoomStorage = { read: key => this.base.read(key), write: async (values, alarm) => {
      const timing = (values.timing as { value: Timing } | undefined)?.value;
      const stage = values.creating === true ? "creation" : values.pending ? "prepare" : values.pending === null ? "finalize"
        : timing?.phase === "running" && this.base.read<{ value: Timing }>("timing")?.value.phase === "suspended" ? "activation" : "other";
      await this.hit(`before-${stage}`);
      await this.base.write(values, alarm);
      await this.hit(`after-${stage}`);
    } };
    const database = new Proxy(env.DB, { get: (target, property) => {
      if (property === "batch") return async (statements: D1PreparedStatement[]) => {
        const fault = this.fixture<Body["fault"]>("fault");
        if (fault?.stage === "d1-delay") { this.put("hit", { stage: fault.stage }); await new Promise(resolve => setTimeout(resolve, fault.delayMs ?? 1000)); }
        if (fault?.stage === "d1-rollback") {
          this.put("fault", (fault.remaining ?? 1) > 1 ? { ...fault, remaining: fault.remaining! - 1 } : null);
          this.put("hit", { stage: fault.stage });
          return target.batch([...statements, target.prepare("INSERT INTO nonexistent_fixture_rollback VALUES (1)")]);
        }
        const result = await target.batch(statements);
        await this.hit("after-d1"); return result;
      };
      const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
    } });
    this.room = new Room({ storage, canonical: new D1Persistence(database, exactReader(env.PRODUCER)),
      objectId: ctx.id.toString(), namespace: "m3-04-test", producer: env.PRODUCER,
      ownsGame: gameId => env.ROOMS.idFromName(gameId).toString() === ctx.id.toString(),
      now: () => this.fixture<number>("now") ?? Date.now() });
  }
  private fixture<T>(key: string): T | null {
    const row = this.ctx.storage.sql.exec<{ value: string }>("SELECT value FROM fixture WHERE key=?", key).toArray()[0];
    return row ? JSON.parse(row.value) as T : null;
  }
  private put(key: string, value: unknown): void {
    this.ctx.storage.sql.exec("INSERT INTO fixture VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, JSON.stringify(value));
  }
  private async hit(stage: string): Promise<void> {
    const fault = this.fixture<Body["fault"]>("fault"); if (fault?.stage !== stage) return;
    this.put("fault", null); this.put("hit", { stage }); await this.ctx.storage.sync();
    if (fault.mode === "throw") throw new Error(`fixture interruption ${stage}`);
    // Keep an actual external await open until the whole owned runtime is killed.
    await new Promise<void>(resolve => setTimeout(resolve, 120000));
    throw new Error(`fixture pause watchdog ${stage}`);
  }
  async alarm(): Promise<void> {
    this.put("alarms", (this.fixture<number>("alarms") ?? 0) + 1);
    await this.room.alarm(); await this.ctx.storage.sync();
  }
  async fetch(request: Request): Promise<Response> {
    const token = request.headers.get("authorization"); const admin = token === `Bearer ${this.env.TEST_KEY}`;
    const seat = this.env.PLAYER_KEYS.findIndex(key => token === `Bearer ${key}`);
    if (!admin && seat < 0) return new Response(null, { status: 403 });
    const body = await request.json() as Body;
    try {
      let result: unknown;
      if (admin) {
        switch (body.op) {
          case "create": result = await this.room.create(body.creation); break;
          case "time": this.put("now", body.now); break;
          case "fault": this.put("fault", body.fault); this.put("hit", null); break;
          case "clearPublications": this.put("publications", []); break;
          case "clearRoom": await this.base.write(Object.fromEntries(this.ctx.storage.sql.exec<{ key: string }>("SELECT key FROM room_records").toArray().map(row => [row.key, null])), null); break;
          case "inspect": result = { records: Object.fromEntries(this.ctx.storage.sql.exec<{ key: string; value: string }>("SELECT * FROM room_records").toArray().map(r => [r.key, JSON.parse(r.value)])),
            hit: this.fixture("hit"), publications: this.fixture("publications") ?? [], alarms: this.fixture("alarms") ?? 0, alarmAt: await this.ctx.storage.getAlarm() }; break;
          case "mutate": await this.base.write({ [body.key]: body.value }, await this.ctx.storage.getAlarm()); break;
          case "alarm": await this.room.alarm(); break;
          default: throw new Error("Unknown administrative fixture operation");
        }
      } else {
        // The credential is verified before body parsing contributes any context.
        const context: ConnectionContext = { gameId: body.room, principal: `fixture-player-${seat}`, seat: seat as PlayerColor,
          connectionId: body.connection ?? `connection-${seat}`, generation: body.generation ?? 1 };
        switch (body.op) {
          case "connect": {
            const channel: Connection = { send: (message: Publication) => {
            const values = this.fixture<unknown[]>("publications") ?? [];
            values.push(message.type === "committed" ? { type: message.type, head: message.snapshot.boundary.head,
              timing: message.snapshot.timing, receipt: message.receipt } : message);
            this.put("publications", values.slice(-64));
            }, close: () => undefined };
            result = await this.room.connect(context, channel);
            const handles = this.handles.get(context.connectionId) ?? [];
            handles.push({ context, channel }); this.handles.set(context.connectionId, handles); break;
          }
          case "socketClose": {
            const handles = this.handles.get(context.connectionId) ?? [];
            const handle = handles[body.handle ?? handles.length - 1];
            if (!handle || handle.context.principal !== context.principal) throw new Error("Unknown fixture transport handle");
            await this.room.disconnect(handle.context, handle.channel); break;
          }
          case "read": result = await this.room.read(context); break;
          case "disconnect": await this.room.disconnect(context); break;
          case "control": await this.room.takeControl(context, body.nextGeneration); break;
          case "command": result = await this.room.command(context, body.request); await this.hit("before-ack"); break;
          default: throw new Error("Unknown player fixture operation");
        }
      }
      await this.ctx.storage.sync(); return Response.json({ result: result ?? null });
    } catch (error) { return Response.json({ error: String(error), code: (error as { code?: string }).code }, { status: 409 }); }
  }
}
/** Exercise the actual maintained WebSocket adapter, with fixture auth outside it. */
export class FixtureGameRoom extends GameRoom {
  constructor(ctx: DurableObjectState, private readonly fixtureEnv: Env) {
    super(ctx, { GAME_DB: fixtureEnv.DB, GAME_ROOMS: fixtureEnv.REAL_ROOMS,
      ROOM_NAMESPACE: "m3-04-test", ROOM_PRODUCER: fixtureEnv.PRODUCER });
  }
  async fetch(request: Request): Promise<Response> {
    const token = request.headers.get("authorization"); const admin = token === `Bearer ${this.fixtureEnv.TEST_KEY}`;
    const seat = this.fixtureEnv.PLAYER_KEYS.findIndex(key => token === `Bearer ${key}`);
    if (!admin && seat < 0) return new Response(null, { status: 403 });
    const url = new URL(request.url);
    const body = request.method === "GET" ? Object.fromEntries(url.searchParams) as unknown as Body : await request.json() as Body;
    try {
      let result: unknown;
      if (admin && body.op === "real-create") result = await super.create(body.creation);
      else {
        if (seat < 0) return new Response(null, { status: 403 });
        const context: ConnectionContext = { gameId: body.room, principal: `fixture-player-${seat}`, seat: seat as PlayerColor,
          connectionId: body.connection ?? `connection-${seat}`, generation: Number(body.generation ?? 1) };
        switch (body.op) {
          case "real-attach": return super.attach(context);
          case "real-read": result = await super.read(context); break;
          case "real-control": result = await super.takeControl(context, body.nextGeneration); break;
          default: throw new Error("Unknown maintained-adapter fixture operation");
        }
      }
      return Response.json({ result: result ?? null });
    } catch (error) { return Response.json({ error: String(error) }, { status: 409 }); }
  }
}
export default { async fetch(request: Request, env: Env): Promise<Response> {
  const token = request.headers.get("authorization");
  if (new URL(request.url).hostname !== "127.0.0.1" || ![env.TEST_KEY, ...env.PLAYER_KEYS].some(key => token === `Bearer ${key}`))
    return new Response(null, { status: 403 });
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (url.searchParams.get("op") === "real-attach") return env.REAL_ROOMS.get(env.REAL_ROOMS.idFromName(url.searchParams.get("room")!)).fetch(request);
    return Response.json({ fingerprint: env.PRODUCER.buildFingerprint });
  }
  const body = await request.clone().json() as Body;
  if (body.op.startsWith("real-")) return env.REAL_ROOMS.get(env.REAL_ROOMS.idFromName(body.room)).fetch(request);
  if (body.op === "sql" || body.op === "canonical") {
    if (token !== `Bearer ${env.TEST_KEY}`) return new Response(null, { status: 403 });
    try {
      const result = body.op === "sql" ? await env.DB.prepare(body.sql).bind(...(body.values ?? [])).all()
        : await new D1Persistence(env.DB, exactReader(env.PRODUCER)).recover(body.room);
      return Response.json({ result });
    } catch (error) { return Response.json({ error: String(error) }, { status: 409 }); }
  }
  return env.ROOMS.get(env.ROOMS.idFromName(body.room)).fetch(request);
} };
