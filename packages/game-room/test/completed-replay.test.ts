import { describe,expect,it,vi } from "vitest";
import { createInitialState } from "@li4chess/engine";
import { createReplay, REPLAY_LIMITS, replayArtifactBytes, replayJsonBytes, stateHash } from "@li4chess/protocol";
import type { EngineBuildIdentityV1 } from "@li4chess/protocol";
import { creationBoundary, digest, exactReader, prepareCommand } from "@li4chess/persistence";
import type { D1Persistence } from "@li4chess/persistence";
import { CompletedReplay } from "../src/completed-replay.js";
import { activate,initialTiming } from "../src/timing.js";
import type { RoomStorage } from "../src/storage.js";

const producer:EngineBuildIdentityV1={format:"li4chess-engine-build-v1",sourceRevision:"4".repeat(40),packageVersions:{"@li4chess/engine":"0.0.0","@li4chess/protocol":"0.0.0"},workingTree:{status:"clean"}};
// Mock ports test lifecycle and read-only behavior; runtime acceptance uses D1/DO.
async function fixture(){
  let now=1000;
  const header={format:"li4chess-d1-game-v1" as const,gameId:"room",replay:await createReplay(createInitialState(),producer)};
  const boundary=await creationBoundary(header,exactReader(producer)),owner={namespace:"namespace",generation:1};
  const {prepared,next}=await prepareCommand(boundary,owner,{id:"abort",expectedCommand:0,admittedAt:1000,caller:{kind:"seat",principal:"p0",seat:0,generation:1},action:{type:"resign",actor:0}},producer);
  const policy={initialMs:600000,incrementMs:0,increment:"after-move" as const};
  const timing=activate(initialTiming(policy,1000),next.state.position,1000,1,"commit");
  const records:Record<string,unknown>={identity:{format:"li4chess-room-v1",objectId:"object",header,owner,policy,seats:[0,1,2,3].map(i=>({principal:`p${i}`,generation:1}))},
    cache:next,marker:next.head,timing:{value:timing,hash:await digest(timing)}};
  const storage:RoomStorage={read:<T>(key:string)=>structuredClone(records[key]??null) as T|null,write:vi.fn(async()=>{throw new Error("read must not write");})};
  const db={inspect:vi.fn(async()=>({headerHash:next.headerHash,owner,head:next.head})),recover:vi.fn(async()=>structuredClone(next)),
    readAuditPage:vi.fn(async()=>({boundary:structuredClone(next),events:structuredClone([...prepared.events])}))} as unknown as D1Persistence;
  const reader=new CompletedReplay(storage,"namespace","object",id=>id==="room",()=>now);
  const member={gameId:"room",principal:"p0",generation:1,expiresAt:10000000};
  return {reader,member,db,records,storage,next,prepared,producer,timing,setNow:(value:number)=>{now=value;}};
}
describe("completed replay read-only member audit",()=>{
  it("always fences rematch eligibility, including current producer, and retains exact original seats/policy/seed",async()=>{
    const f=await fixture(),before=structuredClone(f.records);
    expect(await f.reader.eligibility(f.member,f.db)).toMatchObject({ok:true,principals:["p0","p1","p2","p3"],policy:f.timing.policy,seed:f.next.header.replay.initialState.position.randomSeed});
    expect(f.db.inspect).toHaveBeenCalled();expect(f.records).toEqual(before);expect(f.storage.write).not.toHaveBeenCalled();
    f.next.state={...f.next.state,position:{...f.next.state.position,result:null}};
    expect(await f.reader.eligibility(f.member,f.db)).toEqual({ok:false,code:"replayIncomplete"});
  });
  it.each([0,1])("port-assisted 2048-command byte boundary +%i admits exactly or rejects without final publication",async extra=>{
    // Synthetic padded events isolate resource accounting at the trusted D1 port.
    // They are NOT a claim of engine reachability or a replay-v2-valid long game;
    // real history/reducer behavior is exercised separately through workerd/D1.
    const f=await fixture(),count=2048;
    f.next.state={...f.next.state,sequence:count};
    f.next.head={...f.next.head,command:count,event:count,stateHash:await stateHash(f.next.state)};
    f.records.marker=f.next.head;
    const timing={...f.timing,command:count};f.records.timing={value:timing,hash:await digest(timing)};
    const result=f.prepared.result!;
    const totalEventBytes=REPLAY_LIMITS.bytes-replayArtifactBytes(f.next.header.replay,result,count,0)+extra;
    const each=Math.floor(totalEventBytes/count),remainder=totalEventBytes%count;
    const events=Array.from({length:count},(_,i)=>{
      const event={...f.prepared.events[i===count-1?1:0],sequence:i+1,padding:""};
      const target=each+(i<remainder?1:0);event.padding="x".repeat(target-replayJsonBytes(event));
      expect(replayJsonBytes(event)).toBeLessThanOrEqual(16000);return event;
    });
    let calls=0;
    vi.mocked(f.db.readAuditPage).mockImplementation(async(boundary,through,pageSize)=>{
      expect(boundary.head.command).toBe(calls);expect(through).toBe(count);expect(pageSize).toBe(1);calls++;
      const next={...f.next,state:{...f.next.state,sequence:calls},head:{...f.next.head,command:calls,event:calls}};
      return {boundary:next,events:[events[calls-1]]};
    });
    let response=await f.reader.page(f.member,null,f.db);expect(response.ok).toBe(true);
    for(let command=1;command<=count;command++){
      if(!response.ok)throw new Error("Premature resource rejection");expect(response.page.next).not.toBeNull();
      response=await f.reader.page(f.member,response.page.next,f.db);
      if(command<count)expect(response).toMatchObject({ok:true,page:{command}});
    }
    expect(calls).toBe(count);
    expect(response).toMatchObject(extra?{ok:false,code:"replayLimit"}:{ok:true,page:{command:count,next:null}});
    expect(f.storage.write).not.toHaveBeenCalled();
  },60000);
  it("returns exact abort events, retries one page, keeps all four readers isolated and never writes",async()=>{
    const f=await fixture(),before=structuredClone(f.records);
    for(let seat=0;seat<4;seat++){
      const member={...f.member,principal:`p${seat}`};const start=await f.reader.page(member,null,f.db);expect(start.ok).toBe(true);if(!start.ok)throw new Error();
      expect(start.page.header?.engineBuild).toEqual(producer);expect(start.page.events).toEqual([]);
      const end=await f.reader.page(member,start.page.next,f.db);expect(end).toMatchObject({ok:true,page:{events:f.prepared.events,next:null}});
      expect(await f.reader.page(member,start.page.next,f.db)).toEqual(end);
    }
    expect(f.records).toEqual(before);expect(f.storage.write).not.toHaveBeenCalled();
  });
  it("rejects nonmembers and expired callers before reading persistence",async()=>{
    const f=await fixture();expect(await f.reader.page({...f.member,principal:"outsider"},null,f.db)).toEqual({ok:false,code:"unauthorized"});
    expect(await f.reader.page({...f.member,expiresAt:1000},null,f.db)).toEqual({ok:false,code:"expired"});expect(f.db.inspect).not.toHaveBeenCalled();
  });
  it("binds cursors to principal/session and expires them at the declared boundary",async()=>{
    const f=await fixture();const start=await f.reader.page(f.member,null,f.db);if(!start.ok)throw new Error();
    expect(await f.reader.page({...f.member,principal:"p1"},start.page.next,f.db)).toEqual({ok:false,code:"replayRestart"});
    expect(await f.reader.page({...f.member,generation:2},start.page.next,f.db)).toEqual({ok:false,code:"replayRestart"});
    f.setNow(1000+REPLAY_LIMITS.cursorMs);expect(await f.reader.page(f.member,start.page.next,f.db)).toEqual({ok:false,code:"replayRestart"});
    expect(await f.reader.page({...f.member,generation:2},null,f.db)).toMatchObject({ok:true});
  });
  it("rechecks expiry after awaited storage reads",async()=>{
    const f=await fixture();vi.mocked(f.db.recover).mockImplementation(async()=>{f.setNow(f.member.expiresAt);return f.next;});
    expect(await f.reader.page(f.member,null,f.db)).toEqual({ok:false,code:"expired"});
  });
  it.each(["marker","cache","timing"])("rejects missing %s without repairing it",async key=>{
    const f=await fixture();delete f.records[key];expect(await f.reader.page(f.member,null,f.db)).toEqual({ok:false,code:"unavailable"});expect(f.storage.write).not.toHaveBeenCalled();
  });
  it("rejects both durable incident forms and cross-store divergence",async()=>{
    const f=await fixture();f.records.incident={reason:"quarantine"};expect(await f.reader.page(f.member,null,f.db)).toEqual({ok:false,code:"unavailable"});delete f.records.incident;
    const timing={...f.timing,incident:{reason:"unresolved",firstAt:1000,attempts:1,retryAt:null}};f.records.timing={value:timing,hash:await digest(timing)};
    expect(await f.reader.page(f.member,null,f.db)).toEqual({ok:false,code:"unavailable"});
    f.records.timing={value:f.timing,hash:await digest(f.timing)};f.records.marker={...f.next.head,command:0};
    expect(await f.reader.page(f.member,null,f.db)).toEqual({ok:false,code:"replayIntegrity"});expect(f.storage.write).not.toHaveBeenCalled();
  });
  it("historical preflight preserves original producer and terminal state without a writer or control proof",async()=>{
    const f=await fixture(),before=structuredClone(f.records);
    expect(await f.reader.status(f.member,f.db,producer)).toEqual({ok:true,snapshot:null});
    const status=await f.reader.status(f.member,f.db,{...producer,sourceRevision:"5".repeat(40)});
    expect(status).toMatchObject({ok:true,snapshot:{boundary:f.next,timing:f.timing}});expect(f.records).toEqual(before);expect(f.storage.write).not.toHaveBeenCalled();
  });
});
