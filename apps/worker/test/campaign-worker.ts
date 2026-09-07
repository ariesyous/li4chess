// Isolated campaign entry. No deployable Wrangler configuration references it.
import { GameRoom as MaintainedGameRoom, type GameRoomEnvironment } from "@li4chess/game-room";
import { SQLiteRoomStorage, type RoomStorage } from "@li4chess/game-room/storage";
import type { Creation } from "@li4chess/game-room/room";
import { D1Persistence, digest, exactReader } from "@li4chess/persistence";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import application, { GuestService } from "../src/multiplayer-local.js";
import build from "../.generated/build.json";
import { fixtureReplay, type Scenario } from "./campaign-fixtures.js";
export { GuestService };
const producer=build.producer as EngineBuildIdentityV1;
type Fault={stage:string;mode:"pause"|"throw";remaining?:number};
export interface FixtureBody {op:string;room:string;now?:number|null;fault?:Fault;key?:string;value?:unknown;sql?:string;values?:(string|number|null)[]}
type Environment=Parameters<typeof application.fetch>[1] & GameRoomEnvironment & {M3_06_KEY:string;M3_06_SCENARIO?:Scenario;M3_07_READER_BUILD?:string};
export class GameRoom extends MaintainedGameRoom {
  private readonly base:SQLiteRoomStorage;
  private readonly readFixture:<T>(key:string)=>T|null;
  private readonly putFixture:(key:string,value:unknown)=>void;
  constructor(ctx:DurableObjectState,private readonly fixtureEnv:Environment) {
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS campaign_fixture (key TEXT PRIMARY KEY,value TEXT NOT NULL)");
    const read=<T>(key:string):T|null=>{
      const row=ctx.storage.sql.exec<{value:string}>("SELECT value FROM campaign_fixture WHERE key=?",key).toArray()[0];
      return row ? JSON.parse(row.value) as T : null;
    };
    const put=(key:string,value:unknown)=>{ctx.storage.sql.exec("INSERT INTO campaign_fixture VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key,JSON.stringify(value));};
    const hit=async(stage:string)=>{
      const fault=read<Fault>("fault"); if(fault?.stage!==stage)return;
      put("fault",(fault.remaining??1)>1?{...fault,remaining:fault.remaining!-1}:null);put("hit",{stage});await ctx.storage.sync();
      if(fault.mode === "pause")await new Promise(resolve=>setTimeout(resolve,120000));
      throw new Error(`campaign interruption ${stage}`);
    };
    const base=new SQLiteRoomStorage(ctx.storage);
    const storage:RoomStorage={read:key=>base.read(key),write:async(values,alarm)=>{
      const timing=(values.timing as {value:{phase:string}}|undefined)?.value;
      const stage=values.creating===true?"creation":values.pending?"prepare":values.pending===null?"finalize":
        timing?.phase==="running"&&base.read<{value:{phase:string}}>("timing")?.value.phase==="suspended"?"activation":"other";
      await hit(`before-${stage}`);await base.write(values,alarm);await hit(`after-${stage}`);
    }};
    const database=new Proxy(fixtureEnv.GAME_DB,{get(target,property){
      if(property==="batch")return async(statements:D1PreparedStatement[])=>{
        await hit("before-d1");
        const result=await target.batch(statements);await hit("after-d1");return result;
      };
      const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;
    }});
    const replayDatabase=new Proxy(database,{get(target,property){
      if(property==="prepare")return (sql:string)=>{if(read<boolean>("replay-outage"))throw new Error("isolated replay persistence outage");return target.prepare(sql);};
      const value=Reflect.get(target,property);return typeof value==="function"?value.bind(target):value;
    }});
    const serving=fixtureEnv.M3_07_READER_BUILD?{...producer,sourceRevision:fixtureEnv.M3_07_READER_BUILD}:producer;
    super(ctx,{...fixtureEnv,GAME_DB:replayDatabase,ROOM_PRODUCER:serving},{storage,canonical:new D1Persistence(database,exactReader(serving)),
      objectId:ctx.id.toString(),namespace:fixtureEnv.ROOM_NAMESPACE,producer:serving,
      ownsGame:gameId=>fixtureEnv.GAME_ROOMS.idFromName(gameId).toString()===ctx.id.toString(),now:()=>read<number>("now")??Date.now()});
    this.base=base;this.readFixture=read;this.putFixture=put;
  }
  override async create(creation:Creation) {
    const scenario=this.fixtureEnv.M3_06_SCENARIO??"ordinary";
    if(scenario!=="ordinary") {
      const source=await fixtureReplay(scenario,producer);
      this.putFixture("sourceReplay",source);
      const replay={...source,game:{...source.game,sourceReplayHash:await digest(source)}};
      creation={...creation,header:{...creation.header,replay}};
    }
    return super.create(creation);
  }
  async fixture(body:FixtureBody) {
    switch(body.op) {
      case "replay-outage":this.putFixture("replay-outage",body.value===true);break;
      case "time":this.putFixture("now",body.now??null);break;
      case "fault":this.putFixture("fault",body.fault??null);this.putFixture("hit",null);break;
      case "mutate":if(!body.key)throw new Error("missing key");await this.base.write({[body.key]:body.value??null},await this.ctx.storage.getAlarm());break;
      case "alarm":await super.alarm();break;
      case "inspect":return {records:Object.fromEntries(this.ctx.storage.sql.exec<{key:string;value:string}>("SELECT * FROM room_records").toArray().map(r=>[r.key,JSON.parse(r.value)])),
        hit:this.readFixture("hit"),sourceReplay:this.readFixture("sourceReplay"),alarmAt:await this.ctx.storage.getAlarm()};
      default:throw new Error("unknown fixture operation");
    }
    await this.ctx.storage.sync();return null;
  }
}
export default {async fetch(request:Request,env:Environment):Promise<Response>{
  if(new URL(request.url).pathname!=="/__m3-06")return application.fetch(request,env);
  if(new URL(request.url).hostname!=="127.0.0.1"||request.method!=="POST"||!env.M3_06_KEY||request.headers.get("X-M3-06-Key")!==env.M3_06_KEY)
    return new Response(null,{status:403});
  const body=await request.json() as FixtureBody;
  try {
    const result=body.op==="canonical"?await new D1Persistence(env.GAME_DB,exactReader(producer)).recover(body.room):
      body.op==="sql"?await env.GAME_DB.prepare(body.sql!).bind(...(body.values??[])).all():
        await (env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(body.room)) as unknown as {fixture(body:FixtureBody):Promise<unknown>}).fixture(body);
    return Response.json({result});
  } catch(error) {return Response.json({error:String(error)},{status:409});}
}};
