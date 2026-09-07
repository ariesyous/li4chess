// Test-only entry. Never referenced by application Wrangler configuration.
import { D1Persistence, exactReader } from "../src/index.js";
import type { Boundary, CommandInput, GameHeader, Head, Owner, Prepared } from "../src/index.js";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
interface Env { DB: D1Database; TEST_KEY: string; PRODUCER: EngineBuildIdentityV1 }
export default { async fetch(request: Request, env: Env): Promise<Response> {
  if (new URL(request.url).hostname !== "127.0.0.1" || request.headers.get("authorization") !== `Bearer ${env.TEST_KEY}`)
    return new Response(null, { status: 403 });
  if (request.method === "GET") return Response.json({ fingerprint: env.PRODUCER.buildFingerprint });
  const body = await request.json() as { op: string; header: GameHeader; owner: Owner; prepared: Prepared;
    gameId: string; input: CommandInput; marker: Head; boundary: Boundary; through: number; from: Owner; to: Owner;
    sql: string; values?: (string | number | null)[]; fault?: boolean; lostAck?: boolean; rejectProducer?: boolean };
  let db = env.DB;
  // Append a real failing D1 statement after ALL commit writes, including prune.
  // This is not a mock database or fake rollback response.
  if (body.fault) db = new Proxy(env.DB, { get(target, property) {
    if (property === "batch") return (statements: D1PreparedStatement[]) => target.batch([
      ...statements, target.prepare("INSERT INTO nonexistent_fault_table VALUES (1)")]);
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
  const store = new D1Persistence(db, body.rejectProducer ? { accepts: () => false } : exactReader(env.PRODUCER));
  try {
    let result: unknown;
    switch (body.op) {
      case "create": result = await store.create(body.header, body.owner); break;
      case "commit": result = await store.commit(body.prepared); break;
      case "receipt": result = await store.receipt(body.gameId, body.input); break;
      case "reconcile": result = await store.reconcile(body.prepared); break;
      case "recover": result = await store.recover(body.gameId); break;
      case "page": result = await store.readPage(body.boundary, body.through); break;
      case "restore": result = await store.verifyRestore(body.gameId, body.marker); break;
      case "owner": result = await store.transferOwner(body.gameId, body.marker, body.from, body.to); break;
      case "sql": result = await env.DB.prepare(body.sql).bind(...(body.values ?? [])).all(); break;
      default: throw new Error("Unknown test operation");
    }
    if (body.lostAck) return Response.json({ error: "injected acknowledgement loss after real commit" }, { status: 503 });
    return Response.json({ result: result ?? null });
  } catch (error) { return Response.json({ error: String(error) }, { status: 409 }); }
} };
