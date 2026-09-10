import { describe, expect, it, vi, afterEach } from "vitest";
import { applyMove, createInitialState, legalMoves, localSquare } from "@li4chess/engine";
import { chooseHybrid } from "../src/hybrid.js";
import type { AdvisoryRequest, AdvisoryResult } from "../src/hybrid.js";
import { toMailbox, packResearchState } from "../src/index.js";
import { NodeAdvisoryClient } from "../src/node.js";
import type { WorkerPort } from "../src/node.js";

const budget={nodeBudget:20_000,maxDepth:32};
const state=createInitialState(), legal=legalMoves(state), move=legal[0];
const result:AdvisoryResult={best:toMailbox(move.from)|(toMailbox(move.to)<<8),nodes:100,depth:2,elapsedMs:1,nnueLoaded:true,score:1,pv:[]};
const native=()=>({move});
describe("hybrid authority",()=>{
  it("accepts canonical metadata, hashes immutable state and isolates adviser input",async()=>{
    const before=structuredClone(state);
    const search=vi.fn(async(request:AdvisoryRequest)=>{
      expect(request.stateId).toMatch(/^sha256:[a-f0-9]{64}$/);
      request.squares.fill(0); return result;
    });
    const fallback=vi.fn(native);
    const reply=await chooseHybrid(state,{search},fallback,budget);
    expect(reply.move).toEqual(move); expect(reply.stats.fallback).toBe(false);
    expect(fallback).not.toHaveBeenCalled(); expect(state).toEqual(before);
  });
  it("routes pending EP to native before calling the adviser",async()=>{
    const board=[...state.board], source=localSquare(1,0,1);
    board[localSquare(0,5,3)]={...board[source]!,hasMoved:true}; board[source]=null;
    const ready={...state,board};
    const double=legalMoves(ready).find(m=>m.from===localSquare(0,6,1)&&m.to===localSquare(0,6,3))!;
    const ep=applyMove(ready,double);
    expect(ep.enPassantRights.length).toBeGreaterThan(0);
    const search=vi.fn();
    const reply=await chooseHybrid(ep,{search},s=>({move:legalMoves(s)[0]}),budget);
    expect(search).not.toHaveBeenCalled(); expect(reply.stats).toMatchObject({fallback:true,fallbackReason:"unsupported-state"});
  });
  it.each(["illegal","missing","nnue","crash"])("falls back for %s without granting move authority",async(kind)=>{
    const search=async()=>{if(kind==="crash")throw new Error("worker-crash");
      return {...result,best:kind==="illegal"?0:kind==="missing"?undefined:result.best,nnueLoaded:kind!=="nnue"};};
    const reply=await chooseHybrid(state,{search},native,budget);
    expect(reply.move).toEqual(move); expect(reply.stats.fallback).toBe(true);
  });
  it("cancels without selecting a fallback and rejects an invalid native reply",async()=>{
    const controller=new AbortController(), fallback=vi.fn(native);
    await expect(chooseHybrid(state,{search:async()=>{controller.abort();return result;}},fallback,budget,controller.signal)).rejects.toMatchObject({name:"AbortError"});
    expect(fallback).not.toHaveBeenCalled();
    await expect(chooseHybrid(state,{search:async()=>({...result,best:0})},()=>({move:{...move,to:0}}),budget)).rejects.toThrow("illegal");
  });
});

class MockWorker implements WorkerPort {
  handlers=new Map<string,(value:never)=>void>();
  messages:Record<string,unknown>[]=[]; terminated=false;
  on(event:string, listener:(value:never)=>void){this.handlers.set(event,listener);}
  postMessage(value:unknown){this.messages.push(value as Record<string,unknown>);}
  terminate(){this.terminated=true;}
  emit(event:string,value:unknown){this.handlers.get(event)?.(value as never);}
  reply(value:unknown=result){const m=this.messages.at(-1)!;this.emit("message",{id:m.id,stateId:m.stateId,result:value});}
}
const request:AdvisoryRequest={...packResearchState(state),stateId:"root-a",budget};
describe("Node adviser lifecycle",()=>{
  afterEach(()=>vi.useRealTimers());
  it("reuses a worker while ignoring stale request and position identities",async()=>{
    const w=new MockWorker(),client=new NodeAdvisoryClient(1000,()=>w);
    const first=client.search(request);w.reply();await expect(first).resolves.toEqual(result);
    const second=client.search({...request,stateId:"root-b"});
    w.emit("message",{id:1,stateId:"root-a",result});
    w.emit("message",{id:2,stateId:"root-a",result});
    await expect(client.search(request)).rejects.toThrow("busy");
    w.reply();await expect(second).resolves.toEqual(result);client.close();expect(w.terminated).toBe(true);
  });
  it.each(["crash","exit","malformed","watchdog","cancel"])("replaces the worker after %s and recovers",async(kind)=>{
    vi.useFakeTimers(); const workers:MockWorker[]=[];
    const client=new NodeAdvisoryClient(10,()=>{const w=new MockWorker();workers.push(w);return w;});
    const controller=new AbortController();const pending=client.search(request,controller.signal);
    const rejected=expect(pending).rejects.toThrow();
    if(kind==="crash")workers[0].emit("error",new Error("crash"));
    if(kind==="exit")workers[0].emit("exit",1);
    if(kind==="malformed")workers[0].reply({...result,nodes:NaN});
    if(kind==="watchdog")vi.advanceTimersByTime(11);
    if(kind==="cancel")controller.abort();
    await rejected;
    const next=client.search(request);expect(workers).toHaveLength(2);
    workers[0].reply();workers[1].reply();await expect(next).resolves.toEqual(result);client.close();
  });
});
