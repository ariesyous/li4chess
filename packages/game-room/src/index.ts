import { DurableObject } from "cloudflare:workers";
import { D1Persistence, exactReader } from "@li4chess/persistence";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import { Room, commandFailure } from "./room.js";
import type { ConnectionContext, Creation } from "./room.js";
import { SQLiteRoomStorage } from "./storage.js";

export interface GameRoomEnvironment { GAME_DB: D1Database; GAME_ROOMS: DurableObjectNamespace; ROOM_NAMESPACE: string; ROOM_PRODUCER: EngineBuildIdentityV1 }
/** Binding-only internal API. The binding holder must verify credentials before
 * calling; principal fields arriving over public HTTP never authenticate anyone.
 * Application fetch routes do not expose this class in M3-04. */
export class GameRoom extends DurableObject<GameRoomEnvironment> {
  private readonly room: Room;
  constructor(ctx: DurableObjectState, env: GameRoomEnvironment) {
    super(ctx, env);
    this.room = new Room({ storage: new SQLiteRoomStorage(ctx.storage), canonical: new D1Persistence(env.GAME_DB, exactReader(env.ROOM_PRODUCER)),
      objectId: ctx.id.toString(), namespace: env.ROOM_NAMESPACE, producer: env.ROOM_PRODUCER,
      ownsGame: gameId => env.GAME_ROOMS.idFromName(gameId).toString() === ctx.id.toString(), now: () => Date.now() });
  }
  create(creation: Creation) { return this.room.create(creation); }
  command(context: ConnectionContext, request: Parameters<Room["command"]>[1]) { return this.room.command(context, request); }
  async commandOutcome(context: ConnectionContext, request: Parameters<Room["command"]>[1]) {
    try { return { ok: true as const, ...await this.room.command(context,request) }; }
    catch(error) { return commandFailure(error); }
  }
  read(context: ConnectionContext, expectedCommand = 0) { return this.room.read(context, expectedCommand); }
  takeControl(context: ConnectionContext, nextGeneration: number) { return this.room.takeControl(context, nextGeneration); }
  controlStatus(context: ConnectionContext) { return this.room.controlStatus(context); }
  detach(context: ConnectionContext) { return this.room.disconnect(context); }
  /** Binding-only upgrade transport. Public routers must never forward arbitrary
   * requests here: GuestService authenticates then constructs this context. Unlike
   * RPC return serialization, DO fetch supports a WebSocket response. */
  async fetch(request:Request):Promise<Response> {
    if(request.url!=="https://room.internal/attach"||request.method!=="GET"||request.headers.get("Upgrade")!=="websocket")return new Response(null,{status:404});
    const encoded=request.headers.get("X-Li4chess-Internal-Context");
    if(!encoded||encoded.length>1024)return new Response(null,{status:400});
    try{return await this.attach(JSON.parse(encoded) as ConnectionContext);}catch{return new Response(null,{status:503});}
  }
  /** Authenticated service hands over a socket; gameplay frames are output only.
   * Public ticket/cookie/subprotocol choices remain M3-05. */
  async attach(context: ConnectionContext): Promise<Response> {
    const pair = new WebSocketPair(); const [client, server] = Object.values(pair);
    server.accept();
    const channel = { send: (message: import("./room.js").Publication) => server.send(JSON.stringify(message)), close: () => server.close(1012, "resync required") };
    const disconnect = () => { void this.room.disconnect(context, channel).catch(() => undefined); };
    server.addEventListener("close", disconnect); server.addEventListener("error", disconnect);
    server.addEventListener("message", () => { server.close(1008, "commands require authenticated service"); disconnect(); });
    try {
      await this.room.connect(context, channel);
      return new Response(null, { status: 101, webSocket: client });
    } catch (error) { server.close(1008, "room unavailable"); throw error; }
  }
  alarm() { return this.room.alarm(); }
}
