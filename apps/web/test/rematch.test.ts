import { afterEach,describe,expect,it,vi } from "vitest";
import { ONLINE_VERSION } from "@li4chess/protocol";
import type { OnlineRematch,OnlineResponse,RematchMutation } from "@li4chess/protocol";
import { RematchClient } from "../src/online/rematch.js";
import type { Session } from "../src/online/connection.js";
class MemoryStorage implements Storage {data=new Map<string,string>();get length(){return this.data.size;}clear(){this.data.clear();}getItem(k:string){return this.data.get(k)??null;}key(i:number){return [...this.data.keys()][i]??null;}removeItem(k:string){this.data.delete(k);}setItem(k:string,v:string){this.data.set(k,v);}}
const session:Session={version:ONLINE_VERSION,type:"session",principal:"guest",generation:1,expiresAt:Date.now()+100000};
const state:OnlineRematch={room:"room",revision:1,proposal:1,phase:"pending",expiresAt:Date.now()+600000,consents:[false,false,false,false],successor:null,seat:0};
const clients:RematchClient[]=[];
const response=(s=state):OnlineResponse=>({version:ONLINE_VERSION,type:"rematch",principal:session.principal,generation:1,rematch:s,receipt:null});
async function fixture(){const storage=new MemoryStorage();let mutation:(r:RematchMutation)=>Promise<OnlineResponse>=async()=>{throw new Error("lost reply");};
  const fetcher=vi.fn(async(_url:string,o:RequestInit)=>{const b=JSON.parse(o.body as string);return Response.json(b.type==="session"?session:b.type==="rematch"?response():await mutation(b));});vi.stubGlobal("fetch",fetcher);
  const c=new RematchClient("room",session,storage);clients.push(c);c.start();await vi.waitFor(()=>expect(c.view.state).not.toBeNull());return {c,storage,fetcher,setMutation:(f:typeof mutation)=>{mutation=f;}};
}
afterEach(()=>{clients.splice(0).forEach(c=>c.stop());vi.unstubAllGlobals();});
describe("saved rematch intentions",()=>{
  it("recovers after transient abandonment cleanup failure",async()=>{const f=await fixture();await f.c.act("rematchConsent");const request=f.c.view.pending!;
    vi.spyOn(f.storage,"removeItem").mockImplementationOnce(()=>{throw new Error("storage unavailable");});expect(f.c.abandon()).toBe(false);
    f.setMutation(async r=>({...response({...state,revision:2,consents:[true,false,false,false]}),receipt:{id:r.id,revision:2,outcome:"consented"}} as OnlineResponse));
    expect(await f.c.retry()).toBe(true);expect(f.c.view.pending).toBeNull();expect(request.id).toBeTruthy();
  });
  it.each(["capacity","unauthorized","replayMissing","stale"] as const)("retains a lost accepted ID through a %s retry error until a matching receipt",async code=>{
    const f=await fixture();await f.c.act("rematchConsent");const request=f.c.view.pending!,bytes=f.storage.getItem(f.c.key);
    f.setMutation(async()=>({version:ONLINE_VERSION,type:"error",code,ambiguous:false}));await f.c.retry();
    expect(f.c.view.pending).toEqual(request);expect(f.storage.getItem(f.c.key)).toBe(bytes);
    f.setMutation(async r=>({...response({...state,revision:2,consents:[true,false,false,false]}),receipt:{id:r.id,revision:2,outcome:"consented"}} as OnlineResponse));
    expect(await f.c.retry()).toBe(true);expect(f.c.view.pending).toBeNull();
  });
  it("does not send an unsaved mutation",async()=>{const f=await fixture();vi.spyOn(f.storage,"setItem").mockImplementation(()=>{throw new Error("quota");});
    expect(await f.c.act("rematchConsent")).toBe(false);expect(f.fetcher.mock.calls.some(([,o])=>JSON.parse(o.body as string).type==="rematchConsent")).toBe(false);
  });
  it("rejects duplicate clicks and late acknowledgements after stopping",async()=>{const f=await fixture();let done!:(r:OnlineResponse)=>void;
    f.setMutation(()=>new Promise(resolve=>{done=resolve;}));const operation=f.c.act("rematchConsent");await vi.waitFor(()=>expect(done).toBeDefined());
    const request=f.c.view.pending!;expect(await f.c.act("rematchConsent")).toBe(false);f.c.stop();
    done({...response({...state,revision:2,consents:[true,false,false,false]}),receipt:{id:request.id,revision:2,outcome:"consented"}} as OnlineResponse);await operation;expect(f.c.view.pending).toEqual(request);
  });
  it("reconciles departure from fresh authenticated state and reports unavailable status",async()=>{const f=await fixture();f.c.view.state=null;
    expect(await f.c.reconcile()).toBe(true);expect(f.c.view.state).toMatchObject({phase:"pending"});f.fetcher.mockRejectedValue(new Error("offline"));expect(await f.c.reconcile()).toBe(false);
  });
  it("keeps principal-owned recovery across rotation but blocks another room",async()=>{const f=await fixture();await f.c.act("rematchConsent");f.c.stop();
    const rotated=new RematchClient("room",{...session,generation:2},f.storage),other=new RematchClient("different",session,f.storage);
    expect(rotated.view.pending).toEqual(f.c.view.pending);expect(rotated.view.blocked).toBe(false);expect(other.view.blocked).toBe(true);
  });
});
