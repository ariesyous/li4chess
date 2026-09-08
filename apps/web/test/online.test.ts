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
    const response=body.type==="replayStatus"?{version:ONLINE_VERSION,type:"replayStatus" as const,principal:session.principal,generation:session.generation,snapshot:null,seat:null}:handler?await handler(body):body.type==="session"?session:body.type==="connection"?{version:ONLINE_VERSION,type:"connection" as const,proof:"a".repeat(64),control:{seat:0,generation:1,controller:true}}:
      {version:ONLINE_VERSION,type:"snapshot" as const,snapshot:states[0]};return Response.json(response);});vi.stubGlobal("fetch",fetcher);
  const client=new OnlineConnection("room",session,storage);clients.push(client);client.start();return {client,states,fetcher,storage};
}
async function attach(client:OnlineConnection,snapshot:OnlineSnapshot){await vi.waitFor(()=>expect(Socket.all.length).toBeGreaterThan(0));const socket=Socket.all.at(-1)!;socket.onopen?.();
  socket.receive({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:1,controller:true}});socket.receive({version:ONLINE_VERSION,type:"snapshot",snapshot});
  await vi.waitFor(()=>expect(client.view.phase).toBe("connected"));return socket;}
afterEach(()=>{for(const c of clients)c.stop();clients.length=0;vi.unstubAllGlobals();});
describe("online browser ordering and recovery",()=>{
  it("obtains fresh proof when entry fails after retirement and the source connection restarts",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);await f.client.leave();
    const before=f.fetcher.mock.calls.filter(([,o])=>JSON.parse(o.body as string).type==="connection").length;
    f.client.start();await vi.waitFor(()=>expect(f.fetcher.mock.calls.filter(([,o])=>JSON.parse(o.body as string).type==="connection").length).toBe(before+1));
  });
  it("checks historical completed mode before retained proof/pending handling and never attaches or retires",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);f.fetcher.mockRejectedValue(new Error("lost"));
    await f.client.command({type:"move",from:17,to:31});f.client.stop();
    const saved=f.storage.getItem("li4chess.online.connection.v1"),calls:string[]=[];Socket.all=[];
    f.fetcher.mockImplementation(async(_url,options)=>{
      const type=(JSON.parse(options.body as string) as {type:string}).type;calls.push(type);
      return Response.json(type==="session"?session:{version:ONLINE_VERSION,type:"replayStatus",principal:session.principal,generation:session.generation,snapshot:f.states[3],seat:0});
    });
    const historical=new OnlineConnection("room",session,f.storage);clients.push(historical);historical.start();
    await vi.waitFor(()=>expect(historical.view.phase).toBe("terminal"));
    expect(Socket.all).toHaveLength(0);expect(calls).toEqual(["session","replayStatus"]);expect(historical.view.control).toBeNull();
    expect(f.storage.getItem("li4chess.online.connection.v1")).toBe(saved);expect(historical.view.pending).not.toBeNull();
    await historical.retryPending();await historical.takeControl();await historical.clearPending();
    expect(calls).toEqual(["session","replayStatus"]);expect(f.storage.getItem("li4chess.online.connection.v1")).toBe(saved);
    await historical.leave();expect(calls).toEqual(["session","replayStatus"]);expect(f.storage.getItem("li4chess.online.connection.v1")).toBeNull();
  });
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
  it.each(["receipt","rejection","explicit cleanup"] as const)("retains the original command when %s cannot be persisted and resends the same ID after reconnect",async outcome=>{
    const f=await fixture();await attach(f.client,f.states[0]);let resolve!:(r:Response)=>void;
    f.fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));
    const command=f.client.command({type:"move",from:17,to:31}),pending=f.client.view.pending!,id=pending.request.id;
    const bytes=f.storage.getItem("li4chess.online.connection.v1");
    const save=vi.spyOn(f.storage,"setItem").mockImplementation(()=>{throw new Error("quota");});
    const response:OnlineResponse=outcome==="receipt"?{version:ONLINE_VERSION,type:"receipt",admittedAt:1010,receipt:{id,sequence:1,firstEvent:1,lastEvent:1,commandHash:hash,stateHash:f.states[1].stateHash,commitHash:hash}}:
      {version:ONLINE_VERSION,type:"error",code:outcome==="rejection"?"stale":"unavailable",ambiguous:outcome!=="rejection"};
    resolve(Response.json(response));await command;
    if(outcome==="explicit cleanup"){await f.client.clearPending();expect(f.client.view.notice).toContain("storage cleanup did not complete");}
    expect(f.client.view.pending).toBe(pending);expect(f.storage.getItem("li4chess.online.connection.v1")).toBe(bytes);
    const sent=f.fetcher.mock.calls.length;await f.client.command({type:"resign"});expect(f.fetcher.mock.calls.length).toBe(sent);
    save.mockRestore();const fetcher=f.fetcher.getMockImplementation()!;
    f.fetcher.mockImplementation(async(url,options)=>{
      const request=JSON.parse(options.body as string) as {type:string;id?:string};
      if(request.type==="command"){expect(request).toEqual(pending.request);return Response.json({version:ONLINE_VERSION,type:"error",code:"stale",ambiguous:false});}
      return fetcher(url,options);
    });
    await vi.waitFor(()=>expect(Socket.all).toHaveLength(2),{timeout:2000});await attach(f.client,f.states[0]);
    await vi.waitFor(()=>expect(f.client.view.pending).toBeNull());expect(JSON.parse(f.storage.getItem("li4chess.online.connection.v1")!).pending).toBeNull();
    const commands=f.fetcher.mock.calls.map(([,options])=>JSON.parse(options.body as string) as {type:string;id?:string}).filter(r=>r.type==="command");
    expect(commands.map(r=>r.id)).toEqual([id,id]);
  });
  it("blocks a game intention until the pending takeover response is resolved",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);let resolve!:(r:Response)=>void;
    f.fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));const takeover=f.client.takeControl();
    expect(f.client.view.takeover).toBe(JSON.parse(f.storage.getItem("li4chess.online.connection.v1")!).takeover);
    await f.client.command({type:"move",from:17,to:31});expect(f.client.view.pending).toBeNull();expect(f.client.view.notice).toContain("takeover response");
    resolve(Response.json({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:2,controller:true}}));await takeover;
    expect(JSON.parse(f.storage.getItem("li4chess.online.connection.v1")!).takeover).toBeNull();
    expect(f.client.view.takeover).toBeNull();
  });
  it("does not send or retain an unsaved takeover and allows retry after storage recovers",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);const before=f.storage.getItem("li4chess.online.connection.v1"),calls=f.fetcher.mock.calls.length;
    const save=vi.spyOn(f.storage,"setItem").mockImplementationOnce(()=>{throw new Error("quota");});
    await expect(f.client.takeControl()).resolves.toBeUndefined();expect(f.fetcher.mock.calls.length).toBe(calls);
    expect(f.client.view.takeover).toBeNull();expect(f.storage.getItem("li4chess.online.connection.v1")).toBe(before);expect(f.client.view.notice).toContain("Takeover was not sent");
    save.mockRestore();f.fetcher.mockResolvedValueOnce(Response.json({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:2,controller:true}}));
    await f.client.takeControl();expect(f.client.view.control?.generation).toBe(2);expect(f.client.view.takeover).toBeNull();
  });
  it("retains a visible takeover after lost response and resends its original ID after refresh",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);f.fetcher.mockRejectedValueOnce(new Error("lost response"));await f.client.takeControl();
    const id=f.client.view.takeover;expect(id).toBeTruthy();f.client.stop();
    const replacement=new OnlineConnection("room",session,f.storage);clients.push(replacement);expect(replacement.view.takeover).toBe(id);
    const fetcher=f.fetcher.getMockImplementation()!;f.fetcher.mockImplementation(async(url,options)=>{
      const request=JSON.parse(options.body as string) as {type:string;id?:string};
      if(request.type==="takeControl"){expect(request.id).toBe(id);return Response.json({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:2,controller:true}});}
      return fetcher(url,options);
    });replacement.start();await vi.waitFor(()=>expect(Socket.all).toHaveLength(2));await attach(replacement,f.states[0]);
    await vi.waitFor(()=>expect(replacement.view.takeover).toBeNull());expect(replacement.view.control?.generation).toBe(2);
    const sent=f.fetcher.mock.calls.map(([,options])=>JSON.parse(options.body as string) as {type:string;id?:string}).filter(r=>r.type==="takeControl");
    expect(sent).toHaveLength(2);expect(sent.map(r=>r.id)).toEqual([id,id]);
  });
  it("retains the same takeover when storing its acknowledged outcome fails",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);let resolve!:(r:Response)=>void;
    f.fetcher.mockImplementationOnce(()=>new Promise<Response>(done=>{resolve=done;}));const takeover=f.client.takeControl(),id=f.client.view.takeover;
    const save=vi.spyOn(f.storage,"setItem").mockImplementationOnce(()=>{throw new Error("quota");});
    resolve(Response.json({version:ONLINE_VERSION,type:"control",control:{seat:0,generation:2,controller:true}}));await takeover;
    expect(f.client.view.takeover).toBe(id);expect(JSON.parse(f.storage.getItem("li4chess.online.connection.v1")!).takeover).toBe(id);expect(f.client.view.phase).toBe("recovering");save.mockRestore();
  });
  it("quarantines malformed saved takeover IDs without rewriting the retained bytes",async()=>{
    const f=await fixture();await attach(f.client,f.states[0]);f.client.stop();
    const saved=JSON.parse(f.storage.getItem("li4chess.online.connection.v1")!);saved.takeover={id:"malformed"};const bytes=JSON.stringify(saved);f.storage.setItem("li4chess.online.connection.v1",bytes);
    const replacement=new OnlineConnection("room",session,f.storage);clients.push(replacement);const calls=f.fetcher.mock.calls.length;replacement.start();
    expect(replacement.view.identityConflict).toBe(true);expect(f.fetcher.mock.calls.length).toBe(calls);expect(f.storage.getItem("li4chess.online.connection.v1")).toBe(bytes);
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
