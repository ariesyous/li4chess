import { canonicalJson, equalCanonical, readReplay, readReplayEvents, REPLAY_LIMITS, stateHash, replayJsonBytes, replayArtifactBytes } from "@li4chess/protocol";
import type { OnlineErrorCode, OnlineReplayPage, OnlineSnapshot, ReplayEnvelopeV2, ReplayEventV2 } from "@li4chess/protocol";
import { onlineRequest } from "./connection.js";
import type { Session } from "./connection.js";

export const replayFailureMessage = (code: OnlineErrorCode): string => ({
  replayIncomplete:"This game is not complete. Reconnect and resync before trying again.",
  replayMissing:"The saved history is missing. Retry after persistence is restored.",
  replayIncompatible:"This history needs a compatible replay reader. Keep the room identity and retry after the service is updated.",
  replayIntegrity:"The saved records disagree or are quarantined. The service must resolve the incident before export.",
  replayRestart:"The download continuation expired or the runtime restarted. Download again to restart safely.",
  replayLimit:"This replay exceeds the 32 MB export budget. No partial file was downloaded.",
  expired:"Your guest session expired. This credential can no longer read the room.",
  revoked:"Your session changed or was revoked. Leave and reopen the room with a valid member session.",
  unauthorized:"This session cannot read this room. Reopen it with the original member session.",
  unavailable:"Persistence is unavailable. Download again after the service recovers.",
  capacity:"The service is busy. Wait briefly, then download again.",
  invalid:"The replay request was rejected. Reconnect and try again.",
  conflict:"The replay request conflicted. Reconnect and try again.",
  stale:"The room changed. Reconnect and try again.",
  terminal:"Reconnect and try the completed-game download again.",
  origin:"The multiplayer origin is misconfigured. Reopen the configured local service.",
})[code];

function assert(value: unknown): asserts value { if (!value) throw new Error("Replay verification failed. Reconnect and try again; no file was downloaded."); }
/** Assemble only complete, authenticated, fully audited pages. Local import uses
 * the same replay-v2 reader; this does not create a new producing checkpoint. */
export async function retrieveCompletedReplay(room: string, session: Session, snapshot: OnlineSnapshot, signal: AbortSignal,
  progress: (command:number,total:number)=>void = ()=>undefined): Promise<string> {
  const request = async (cursor:string|null):Promise<OnlineReplayPage> => {
    signal.throwIfAborted(); const response=await onlineRequest({type:"replay",room,cursor},undefined,signal); signal.throwIfAborted();
    if(response.type==="error")throw new Error(replayFailureMessage(response.code));
    assert(response.type==="replay");const p=response.page;
    assert(p.room===room&&p.principal===session.principal&&p.generation===session.generation);
    assert(equalCanonical(p.head,{command:snapshot.command,event:snapshot.event,stateHash:snapshot.stateHash,chainHash:snapshot.chainHash}));return p;
  };
  let page=await request(null);assert(page.header!==null);const header=page.header;
  assert(equalCanonical(header.engineBuild,snapshot.producer)&&(header.game.sourceReplayHash??null)===snapshot.sourceReplayHash);
  let state=(await readReplay(header)).state,command=0,size=0;
  assert(snapshot.state.position.result!==null);
  const result={stateSchemaId:snapshot.state.stateSchemaId,rulesetId:snapshot.state.rulesetId,result:snapshot.state.position.result};
  const events:ReplayEventV2[]=[];
  while(page.next!==null){
    signal.throwIfAborted();page=await request(page.next);
    assert(page.header===null&&page.command===command+1&&page.command<=2048);
    size+=page.events.reduce((n,event)=>n+replayJsonBytes(event),0);
    if(replayArtifactBytes(header,result,events.length+page.events.length,size)>REPLAY_LIMITS.bytes)throw new Error(replayFailureMessage("replayLimit"));
    state=await readReplayEvents(state,page.events);assert(state.pendingEffects.length===0);
    events.push(...page.events);command=page.command;progress(command,snapshot.command);
  }
  assert(command===snapshot.command&&equalCanonical(state,snapshot.state)&&state.position.result!==null&&await stateHash(state)===snapshot.stateHash);
  const replay:ReplayEnvelopeV2={...header,events,finalStateHash:snapshot.stateHash,
    result:{stateSchemaId:state.stateSchemaId,rulesetId:state.rulesetId,result:state.position.result}};
  const checked=await readReplay(replay);assert(equalCanonical(checked.state,snapshot.state));
  const json=canonicalJson(replay);if(new TextEncoder().encode(json).length>REPLAY_LIMITS.bytes)throw new Error(replayFailureMessage("replayLimit"));
  // A cookie may rotate/change in another tab while replay validation is pending.
  const auth=await onlineRequest({type:"session"},undefined,signal);signal.throwIfAborted();
  if(auth.type==="error")throw new Error(replayFailureMessage(auth.code));
  assert(auth.type==="session"&&auth.principal===session.principal&&auth.generation===session.generation);
  return json;
}
