import { describe,expect,it } from "vitest";
import { createInitialState } from "@li4chess/engine";
import { createReplay,recordReplay,canonicalJson,replayArtifactBytes,replayJsonBytes,REPLAY_LIMITS,parseOnlineRequest,parseOnlineResponse,ONLINE_VERSION } from "../src/index.js";
import type { EngineBuildIdentityV1 } from "../src/index.js";
const producer:EngineBuildIdentityV1={format:"li4chess-engine-build-v1",sourceRevision:"4".repeat(40),packageVersions:{"@li4chess/engine":"0.0.0","@li4chess/protocol":"0.0.0"},workingTree:{status:"clean"}};
describe("completed replay transport bounds",()=>{
  it("accepts only room/cursor selection, never identity, seat or continuation state",()=>{
    const request={version:ONLINE_VERSION,type:"replay",room:"room",cursor:null};expect(parseOnlineRequest(request)).toEqual(request);
    for(const extra of [{principal:"p0"},{seat:0},{state:{}},{cursor:"invalid"},{proof:"a".repeat(64)}])expect(()=>parseOnlineRequest({...request,...extra})).toThrow();
  });
  it("accounts for exact UTF-8 artifact bytes including terminal result and event separators",async()=>{
    const initial=createInitialState(),header=await createReplay(initial,producer);
    const replay=await recordReplay(initial,[{type:"resign",actor:0}],producer);if(!replay.result)throw new Error();
    const eventBytes=replay.events.reduce((n,e)=>n+replayJsonBytes(e),0);
    expect(replayArtifactBytes(header,replay.result,replay.events.length,eventBytes)).toBe(new TextEncoder().encode(canonicalJson(replay)).length);
    const base=replayArtifactBytes(header,replay.result,1,0);
    expect(replayArtifactBytes(header,replay.result,1,REPLAY_LIMITS.bytes-base)).toBe(REPLAY_LIMITS.bytes);
    expect(replayArtifactBytes(header,replay.result,1,REPLAY_LIMITS.bytes-base+1)).toBe(REPLAY_LIMITS.bytes+1);
    expect(()=>replayArtifactBytes(header,replay.result!,2048*32+1,0)).toThrow();
  });
  it("accepts the 32-event transport page and rejects 33 or a head beyond 2048 commands",async()=>{
    const replay=await recordReplay(createInitialState(),[{type:"resign",actor:0}],producer);
    const response={version:ONLINE_VERSION,type:"replay",page:{room:"room",principal:"p",generation:1,
      head:{command:2048,event:65536,stateHash:replay.finalStateHash,chainHash:replay.finalStateHash},command:2048,
      header:null,events:Array.from({length:32},()=>replay.events[0]),next:null}};
    expect(await parseOnlineResponse(response)).toEqual(response);
    await expect(parseOnlineResponse({...response,page:{...response.page,events:[...response.page.events,replay.events[0]]}})).rejects.toThrow();
    await expect(parseOnlineResponse({...response,page:{...response.page,head:{...response.page.head,command:2049}}})).rejects.toThrow();
  });
});
