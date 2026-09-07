import { describe,expect,it } from "vitest";
import { ONLINE_VERSION,parseOnlineRequest,parseOnlineResponse,validateOnlineTiming } from "../src/multiplayer.js";
const request={version:ONLINE_VERSION,type:"command",room:"room-1",id:"move-1",expectedCommand:0,action:{type:"move",from:17,to:31}};
describe("strict online v1 public protocol",()=>{
  it("accepts minimal own-seat intentions without public actor or control credentials",()=>{expect(parseOnlineRequest(request)).toEqual(request);
    for(const type of ["resign","claimWin"])expect(parseOnlineRequest({...request,action:{type}})).toMatchObject({action:{type}});});
  it.each([
    {...request,version:"unknown"},{...request,principal:"forged"},{...request,connectionId:"forged"},{...request,generation:1},
    {...request,id:"server:1"},{...request,expectedCommand:-1},{...request,expectedCommand:2048},{...request,expectedCommand:0.5},
    {...request,action:{...request.action,actor:0}},{...request,action:{type:"timeout"}},{...request,action:{type:"randomKingMove"}},
    {...request,action:{type:"move",from:0,to:1}},{...request,action:{...request.action,promotion:"N"}},
    {...request,id:"x".repeat(5000)},
  ])("rejects unsupported, untrusted, malformed and oversized request %#",value=>expect(()=>parseOnlineRequest(value)).toThrow());
  it("strictly validates receipt admission facts and control/error envelopes",async()=>{
    const receipt={version:ONLINE_VERSION,type:"receipt",admittedAt:123,receipt:{id:"x",sequence:1,firstEvent:1,lastEvent:2,commandHash:`sha256:${"a".repeat(64)}`,stateHash:`sha256:${"b".repeat(64)}`,commitHash:`sha256:${"c".repeat(64)}`}};
    expect(await parseOnlineResponse(receipt)).toEqual(receipt);
    for(const value of [{...receipt,admittedAt:-1},{...receipt,receipt:{...receipt.receipt,sequence:0}},{...receipt,receipt:{...receipt.receipt,lastEvent:0}},
      {version:ONLINE_VERSION,type:"error",code:"unknown",ambiguous:false},{version:ONLINE_VERSION,type:"resyncRequired",snapshot:{}},
      {version:ONLINE_VERSION,type:"control",control:{seat:4,generation:1,controller:true}}])await expect(parseOnlineResponse(value)).rejects.toThrow();
  });
  it("rejects false-like nullable clock records",()=>{
    const timing={format:"li4chess-room-clock-v1",revision:0,phase:"running",remainingMs:[1000,1000,1000,1000],disconnectRemainingMs:[60000,60000,60000,60000],connected:[true,true,true,true],
      activeSeat:0,activatedAt:10,deadline:1010,accountedAt:10,policy:{initialMs:1000,incrementMs:0,increment:"after-move"},previousResume:null,suspendedAt:null,backwards:false,command:0,incident:null};
    expect(()=>validateOnlineTiming(timing)).not.toThrow();for(const value of [false,0,""])for(const field of ["previousResume","incident"])expect(()=>validateOnlineTiming({...timing,[field]:value})).toThrow();
  });
});
