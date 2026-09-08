import { useEffect, useState } from "react";
import type { OnlineSnapshot } from "@li4chess/protocol";
import { PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { onlineRequest, type Session } from "./connection.js";
import { ReplayDownload } from "./ReplayDownload.js";

/** Viewing the prior result does not attach, retire or replace a game connection. */
export function PreviousResult({room,session}:{room:string;session:Session}){
  const [open,setOpen]=useState(false),[snapshot,setSnapshot]=useState<OnlineSnapshot|null>(null),[message,setMessage]=useState("");
  const [signal,setSignal]=useState(()=>new AbortController().signal);
  useEffect(()=>{const controller=new AbortController();setSignal(controller.signal);setSnapshot(null);
    if(open)void (async()=>{try{const r=await onlineRequest({type:"completedView",room},undefined,controller.signal);
      if(controller.signal.aborted)return;
      if(r.type!=="replayStatus"||r.principal!==session.principal||r.generation!==session.generation||r.snapshot?.gameId!==room)throw new Error("Previous result unavailable. Reopen with a valid member session.");
      setSnapshot(r.snapshot);setMessage("");
    }catch(error){if(!controller.signal.aborted)setMessage(error instanceof Error?error.message:"Previous result unavailable.");}})();
    return()=>controller.abort();
  },[open,room,session.principal,session.generation]);
  return <section><button onClick={()=>setOpen(!open)}>{open?"Close previous result":"View previous result and replay"}</button>
    {open&&<div data-testid="previous-result"><p role="status">{message}</p>{snapshot&&<><h3>Previous game: {snapshot.state.position.result?.reason}</h3>
      {snapshot.state.position.result?.placements.map(p=><p key={p.color}>{PLAYER_COLOR_NAME[p.color]} — place {p.place}, {p.score} points</p>)}
      <ReplayDownload room={room} session={session} snapshot={snapshot} signal={signal} allowed={open}/></>}</div>}
  </section>;
}
