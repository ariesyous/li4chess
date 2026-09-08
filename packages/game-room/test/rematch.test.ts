import { describe, expect, it } from "vitest";
import { REMATCH_LIMITS } from "@li4chess/protocol";
import type { RematchMutation } from "@li4chess/protocol";
import { emptyRematch, mutateRematch, rematchView, settleRematch } from "../src/rematch.js";

function fixture() {
  let record=emptyRematch(),id=0,now=1000;
  const request=(type:RematchMutation["type"]):RematchMutation=>type==="rematchPropose"?
    {type,room:"old",id:`request-${id++}`,expectedRevision:record.revision}:
    {type,room:"old",id:`request-${id++}`,expectedRevision:record.revision,proposal:record.proposals.length};
  const send=(seat:number,input:RematchMutation)=>{const result=mutateRematch(record,`p${seat}`,seat,input,now,"new");record=result.record;return result;};
  return {request,send,get record(){return record;},set record(r){record=r;},get now(){return now;},set now(n){now=n;}};
}
describe("private rematch metadata reducer (trusted auth/storage ports)",()=>{
  it("requires four separate principal votes, creates once, and keeps exact receipts with current state",()=>{
    const f=fixture(),proposal=f.request("rematchPropose");f.send(0,proposal);
    expect(rematchView(f.record,"old",0).consents).toEqual([false,false,false,false]);
    let first:RematchMutation|undefined;
    for(let seat=0;seat<4;seat++){
      const request=f.request("rematchConsent");first??=request;const r=f.send(seat,request);
      expect(r.allocated).toBe(seat===3);
      expect(f.send(seat,request)).toEqual({...r,allocated:false});
    }
    expect(f.record.proposals[0].successor).toBe("new");
    const repeated=f.send(0,first!);expect(repeated.receipt.outcome).toBe("consented");expect(repeated.record.proposals[0].phase).toBe("created");
    expect(()=>f.send(0,f.request("rematchPropose"))).toThrow("conflict");
    expect(()=>f.send(0,f.request("rematchDecline"))).toThrow("conflict");
    expect(f.record.proposals).toHaveLength(1);
  });
  it("sibling tabs share one vote; changed payload reuse and competing proposals cannot add votes",()=>{
    const f=fixture(),a=f.request("rematchPropose"),b=f.request("rematchPropose");f.send(0,a);
    expect(()=>f.send(1,b)).toThrow("stale");
    const consent=f.request("rematchConsent");f.send(0,consent);
    f.send(0,f.request("rematchConsent"));expect(f.record.proposals[0].consents.filter(Boolean)).toHaveLength(1);
    expect(()=>f.send(0,{...consent,type:"rematchDecline",proposal:1})).toThrow("conflict");
    expect(()=>f.send(1,consent)).toThrow("stale");
  });
  it("withdrawal closes the epoch; old consent cannot revive it or a later proposal",()=>{
    const f=fixture();f.send(0,f.request("rematchPropose"));const consent=f.request("rematchConsent");f.send(0,consent);
    const delayed=f.request("rematchConsent");f.send(1,f.request("rematchDecline"));
    expect(f.send(0,consent).record.proposals[0].phase).toBe("declined");
    expect(()=>f.send(2,delayed)).toThrow("stale");
    f.send(3,f.request("rematchPropose"));expect(f.record.proposals[1].consents).toEqual([false,false,false,false]);
    expect(()=>f.send(2,{...delayed,expectedRevision:f.record.revision})).toThrow("conflict");
  });
  it.each(["withdraw-first","consent-first"])("serializes a final consent/withdraw race: %s",order=>{
    const f=fixture();f.send(0,f.request("rematchPropose"));for(let i=0;i<3;i++)f.send(i,f.request("rematchConsent"));
    const consent=f.request("rematchConsent"),withdraw=f.request("rematchDecline");
    if(order==="withdraw-first"){f.send(0,withdraw);expect(()=>f.send(3,consent)).toThrow("stale");expect(f.record.proposals[0].successor).toBeNull();}
    else {f.send(3,consent);expect(()=>f.send(0,withdraw)).toThrow("stale");expect(f.record.proposals[0].successor).toBe("new");}
  });
  it("expires at the exact fixed deadline, ignores retries, and settles unavailable participants without receipt slots",()=>{
    const f=fixture(),p=f.request("rematchPropose");f.send(0,p);const deadline=f.record.proposals[0].expiresAt;
    f.now+=100;f.send(0,p);expect(f.record.proposals[0].expiresAt).toBe(deadline);
    expect(settleRematch(f.record,deadline-1,true)).toEqual(f.record);
    expect(settleRematch(f.record,deadline,true).proposals[0].phase).toBe("expired");
    expect(settleRematch(f.record,deadline-1,false).proposals[0].phase).toBe("participantUnavailable");
    f.now=deadline;expect(()=>f.send(0,f.request("rematchConsent"))).toThrow("stale");
  });
  it("reserves cancellation at normal receipt capacity and keeps status/exact retries available",()=>{
    const f=fixture(),first=f.request("rematchPropose");f.send(0,first);
    while(f.record.receipts.length<REMATCH_LIMITS.ordinaryReceipts)f.send(0,f.request("rematchConsent"));
    expect(()=>f.send(1,f.request("rematchConsent"))).toThrow("capacity");
    f.send(1,f.request("rematchDecline"));expect(f.record.receipts).toHaveLength(121);
    expect(()=>f.send(1,f.request("rematchDecline"))).toThrow("conflict");
    expect(f.send(0,first).record.proposals[0].phase).toBe("declined");
    expect(rematchView(f.record,"old",0).revision).toBe(121);
  });
  it("bounds total epochs and never evicts accepted outcomes; a created successor survives credential loss",()=>{
    const f=fixture();for(let i=0;i<8;i++){f.send(0,f.request("rematchPropose"));f.send(0,f.request("rematchDecline"));}
    expect(()=>f.send(0,f.request("rematchPropose"))).toThrow("capacity");expect(f.record.proposals).toHaveLength(8);
    const g=fixture();g.send(0,g.request("rematchPropose"));for(let i=0;i<4;i++)g.send(i,g.request("rematchConsent"));
    expect(settleRematch(g.record,Number.MAX_SAFE_INTEGER,false)).toEqual(g.record);
  });
});
