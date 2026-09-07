import { afterEach,describe,expect,it,vi } from "vitest";
import { createInitialState,applyMoveRequest,resignPlayer } from "@li4chess/engine";
import { projectState,stateHash,ONLINE_VERSION } from "@li4chess/protocol";
import type { OnlineSnapshot,OnlineResponse,EngineBuildIdentityV1 } from "@li4chess/protocol";
import { OnlineConnection,type Session } from "../src/online/connection.js";
class MemoryStorage implements Storage {private data=new Map<string,string>();get length(){return this.data.size;}clear(){this.data.clear();}getItem(k:string){return this.data.get(k)??null;}key(i:number){return [...this.data.keys()][i]??null;}removeItem(k:string){this.data.delete(k);}setItem(k:string,v:string){this.data.set(k,v);}}
class Socket {
  static all:Socket[]=[];onopen:(()=>void)|null=null;onmessage:((e:MessageEvent<string>)=>void)|null=null;onerror:(()=>void)|null=null;onclose:(()=>void)|null=null;
  send=vi.fn();close=vi.fn();constructor(){Socket.all.push(this);}receive(value:OnlineResponse){this.onmessage?.({data:JSON.stringify(value)} as MessageEvent<string>);}
}
const producer:EngineBuildIdentityV1={format:"li4chess-engine-build-v1",sourceRevision:"1".repeat(40),packageVersions:{"@li4chess/engine":"0.0.0","@li4chess/protocol":"0.0.0"},workingTree:{status:"clean"}};
const session:Session={version:ONLINE_VERSION,type:"session",principal:"guest",generation:1,expiresAt:Date.now()+100000};
const hash=`sha256:${"b".repeat(64)}`;
const clients:OnlineConnection[]=[];
async function snapshots(){const initial=createInitialState(),one=applyMoveRequest(initial,{from:17,to:31}),two=applyMoveRequest(one,{from:141,to:142}),terminal=resignPlayer(two,0);
  return Promise.all([initial,one,two,terminal].map(async(state,i):Promise<OnlineSnapshot>=>{const projected={...projectState(state),sequence:state.eventSequence};return {
    gameId:"room",command:i,event:projected.sequence,state:projected,stateHash:await stateHash(projected),chainHash:hash,producer,sourceReplayHash:null,serverTime:1000,
    timing:{format:"li4chess-room-clock-v1",revision:i,phase:state.result?"terminal":"running",remainingMs:[100000,100000,100000,100000],disconnectRemainingMs:[60000,60000,60000,60000],connected:[true,true,true,true],
      activeSeat:state.result?null:state.turn,activatedAt:state.result?null:1000,deadline:state.result?null:101000,accountedAt:1000,policy:{initialMs:100000,incrementMs:0,increment:"after-move"},previousResume:null,suspendedAt:null,backwards:false,command:i,incident:null}};}));}
type Handler=(body:{type:string;id?:string})=>Promise<OnlineResponse>;
async function fixture(handler?:Handler){Socket.all=[];const storage=new MemoryStorage();
  const events=new EventTarget();Object.assign(events,{location:{href:"http://localhost/"}});vi.stubGlobal("window",events);vi.stubGlobal("WebSocket",Socket);
  vi.stubGlobal("navigator",{locks:{request:async(_name:string,_options:unknown,callback:(lock:object)=>Promise<void>)=>callback({})}});
  const states=await snapshots();
  const fetcher=vi.fn(async(_url:string,options:RequestInit)=>{const body=JSON.parse(options.body as string) as {type:string};
    const response=handler?await handler(body):body.type==="session"?session:body.type==="connection"?{version:ONLINE_VERSION,type:"connection" as const,proof:"a".repeat(64),control:{seat:0,generation:1,controller:true}}:
      {version:ONLINE_VERSION,type:"snapshot" as const,snapshot:states[0]};return Response.json(response);});vi.stubGlobal("fetch",fetcher);
  const client=new OnlineConnection("room",session,storage);clients.push(client);client.start();return {client,states,fetcher,storage};
}
async function attach(client:OnlineConnection,snapshot:OnlineSnapshot){await vi.waitFor(()=>expect(Socket.all.length).toBeGreaterThan(0));const socket=Socket.all.at(-1)!;socket.onopen?.();
  socket.receive({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:1,controller:true}});socket.receive({version:ONLINE_VERSION,type:"snapshot",snapshot});
  await vi.waitFor(()=>expect(client.view.phase).toBe("connected"));return socket;}
afterEach(()=>{for(const c of clients)c.stop();clients.length=0;vi.unstubAllGlobals();});
describe("online browser ordering and recovery",()=>{
  it("keeps transient authentication outages recoverable",async()=>{const f=await fixture(async()=>({version:ONLINE_VERSION,type:"error",code:"unavailable",ambiguous:true}));
    await vi.waitFor(()=>expect(f.client.view.phase).toBe("recovering"));expect(f.client.view.notice).not.toContain("identity changed");});
  it("preserves unresolved storage across refreshed session changes until deliberate abandonment",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);f.fetcher.mockRejectedValue(new Error("lost"));await f.client.command({type:"move",from:17,to:31});f.client.stop();
    const bytes=f.storage.getItem("li4chess.online.connection.v1"),calls=f.fetcher.mock.calls.length;
    const replacement=new OnlineConnection("room",{...session,generation:2},f.storage);clients.push(replacement);replacement.start();
    expect(replacement.view.identityConflict).toBe(true);expect(f.storage.getItem("li4chess.online.connection.v1")).toBe(bytes);expect(f.fetcher.mock.calls.length).toBe(calls);
    replacement.abandonPreviousIdentity();expect(replacement.view.identityConflict).toBe(false);expect(f.storage.getItem("li4chess.online.connection.v1")).toBeNull();
  });
  it("does not roll back newer snapshots when an old receipt and resync arrive",async()=>{
    const states=await snapshots();let resolve!:(r:OnlineResponse)=>void;let id="";
    const f=await fixture(async body=>{if(body.type==="session")return session;if(body.type==="connection")return {version:ONLINE_VERSION,type:"connection",proof:"a".repeat(64),control:{seat:0,generation:1,controller:true}};
      if(body.type==="command"){id=body.id!;return new Promise<OnlineResponse>(done=>{resolve=done;});}return {version:ONLINE_VERSION,type:"snapshot",snapshot:states[1]};});
    const socket=await attach(f.client,states[0]);const pending=f.client.command({type:"move",from:17,to:31});await vi.waitFor(()=>expect(id).not.toBe(""));
    socket.receive({version:ONLINE_VERSION,type:"snapshot",snapshot:states[1]});socket.receive({version:ONLINE_VERSION,type:"snapshot",snapshot:states[2]});await vi.waitFor(()=>expect(f.client.view.snapshot?.command).toBe(2));
    resolve({version:ONLINE_VERSION,type:"receipt",admittedAt:1010,receipt:{id,sequence:1,firstEvent:1,lastEvent:1,commandHash:hash,stateHash:states[1].stateHash,commitHash:hash}});await pending;
    expect(f.client.view.snapshot?.command).toBe(2);expect(f.client.view.pending).toBeNull();
  });
  it("cannot clear an in-flight intention or replace it before its receipt arrives",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);let resolve!:(r:Response)=>void;
    f.fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));
    const pending=f.client.command({type:"move",from:17,to:31});const id=f.client.view.pending!.request.id;
    await f.client.clearPending();await f.client.command({type:"resign"});expect(f.client.view.pending?.request.id).toBe(id);
    resolve(Response.json({version:ONLINE_VERSION,type:"receipt",admittedAt:1010,receipt:{id,sequence:1,firstEvent:1,lastEvent:1,commandHash:hash,stateHash:f.states[1].stateHash,commitHash:hash}}));
    await pending;expect(f.client.view.pending).toBeNull();
  });
  it("blocks a game intention until the pending takeover response is resolved",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);let resolve!:(r:Response)=>void;
    f.fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));const takeover=f.client.takeControl();
    await f.client.command({type:"move",from:17,to:31});expect(f.client.view.pending).toBeNull();expect(f.client.view.notice).toContain("takeover response");
    resolve(Response.json({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:2,controller:true}}));await takeover;
    expect(JSON.parse(f.storage.getItem("li4chess.online.connection.v1")!).takeover).toBeNull();
  });
  it("reacts to resyncRequired immediately and ignores old socket close callbacks",async()=>{const f=await fixture();const old=await attach(f.client,f.states[0]);
    old.receive({version:ONLINE_VERSION,type:"resyncRequired"});await vi.waitFor(()=>expect(f.client.view.phase).toBe("recovering"));expect(old.close).toHaveBeenCalled();
    await vi.waitFor(()=>expect(Socket.all.length).toBe(2),{timeout:2000});const replacement=Socket.all[1];old.onclose?.();expect(replacement.close).not.toHaveBeenCalled();
  });
  it("retains pending intentions after failed resync and prevents sends while recovering",async()=>{const f=await fixture();await attach(f.client,f.states[0]);
    f.fetcher.mockRejectedValue(new Error("network lost"));await f.client.command({type:"move",from:17,to:31});const id=f.client.view.pending!.request.id;
    const sent=f.fetcher.mock.calls.length;await f.client.retryPending();expect(f.fetcher.mock.calls.length).toBe(sent);
    await f.client.clearPending();expect(f.client.view.pending?.request.id).toBe(id);expect(f.storage.getItem("li4chess.online.connection.v1")).toContain(id);
  });
  it("ignores delayed control generations and applies HTTP terminal resync",async()=>{const f=await fixture();const socket=await attach(f.client,f.states[0]);
    socket.receive({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:3,controller:false}});
    socket.receive({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:2,controller:true}});await vi.waitFor(()=>expect(f.client.view.control?.generation).toBe(3));expect(f.client.view.control?.controller).toBe(false);
    f.fetcher.mockResolvedValue(Response.json({version:ONLINE_VERSION,type:"snapshot",snapshot:f.states[3]}));await f.client.clearPending();expect(f.client.view.phase).toBe("terminal");
    const count=f.fetcher.mock.calls.length;await f.client.command({type:"resign"});expect(f.fetcher.mock.calls.length).toBe(count);
  });
});
