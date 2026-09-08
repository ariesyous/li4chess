import { useEffect, useState } from "react";
import type { RematchClient } from "./rematch.js";

export function RematchPanel({client,allowed,transitioning=false,onEnter}:{client:RematchClient;allowed:boolean;transitioning?:boolean;onEnter:(room:string)=>Promise<void>}){
  const [view,setView]=useState(client.view),[entering,setEntering]=useState(false);
  useEffect(()=>client.subscribe(()=>setView(client.view)),[client]);
  useEffect(()=>{if(!allowed){client.stop();return;}client.start();const timer=setInterval(()=>void client.refresh(),1500);return()=>{clearInterval(timer);client.stop();};},[client,allowed]);
  const state=view.state,disabled=!allowed||transitioning||view.busy||!!view.pending||view.blocked||entering;
  const enter=async()=>{if(disabled||!state?.successor)return;setEntering(true);try{await onEnter(state.successor);}finally{setEntering(false);}};
  return <section aria-label="Private rematch"><h3>Play again with these four players</h3>
    <p role="status" data-testid="rematch-status" data-revision={state?.revision}>{state?`${state.phase} · ${state.consents.filter(Boolean).length}/4 consented`:"Checking availability"} {view.notice}</p>
    <p>Each player must consent, then enter and ready separately. Seats and clock settings stay the same.</p>
    {state?.phase==="pending"&&<><p>Proposal {state.proposal} expires {new Date(state.expiresAt!).toLocaleTimeString()}.</p>
      <button disabled={disabled||state.consents[state.seat]} onClick={()=>void client.act("rematchConsent")}>{state.consents[state.seat]?"You consented":"Consent to rematch"}</button>
      <button disabled={disabled} onClick={()=>void client.act("rematchDecline")}>Decline or withdraw rematch</button></>}
    {state&&["none","declined","expired","participantUnavailable"].includes(state.phase)&&<button disabled={disabled} onClick={()=>void client.act("rematchPropose")}>Propose rematch</button>}
    {state?.phase==="created"&&<><p>The new private room is ready to enter. This result and its replay stay available.</p><button disabled={disabled} onClick={()=>void enter()}>Enter rematch room</button></>}
    {view.pending&&<div><p>Pending rematch request <code data-testid="pending-rematch">{view.pending.id}</code>.</p><button disabled={transitioning||!allowed||view.busy||view.blocked} onClick={()=>void client.retry()}>Retry same rematch request</button></div>}
    {(view.pending||view.blocked)&&<button disabled={transitioning||view.busy} onClick={()=>{if(window.confirm("Abandon rematch response recovery? The request may already be committed. This does not withdraw consent or undo creation."))client.abandon();}}>Abandon rematch recovery</button>}
    <button disabled={transitioning||!allowed||view.busy} onClick={()=>void client.refresh()}>Refresh rematch status</button>
  </section>;
}
