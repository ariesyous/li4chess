import { useEffect, useRef, useState } from "react";
import { ALL_COLORS, canClaimWin } from "@li4chess/engine";
import { legalMoves, type PlayerColor } from "@li4chess/engine";
import { engineState } from "@li4chess/protocol";
import type { OnlineLobby, OnlineResponse } from "@li4chess/protocol";
import { Board, PLAYER_COLOR_NAME } from "@li4chess/ui-kit";
import { OnlineConnection, onlineRequest, type Session } from "./connection.js";

export function OnlineGame({onLeave}:{onLeave:()=>void}){
  const [session,setSession]=useState<Session|null>(null),[lobby,setLobby]=useState<OnlineLobby|null>(null),[invite,setInvite]=useState(""),[message,setMessage]=useState("Checking guest session…");
  const [busy,setBusy]=useState(false);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const accept=(r:OnlineResponse)=>{if(!mounted.current)return;if(r.type==="session"){setSession(r);setMessage("Guest session active");}
    else if(r.type==="lobby"||r.type==="created"){setLobby(old=>old&&old.room===r.lobby.room&&old.revision>r.lobby.revision?old:r.lobby);sessionStorage.setItem("li4chess.online.room",r.lobby.room);if(r.type==="created")setInvite(r.invitation);setMessage("");}
    else if(r.type==="error")setMessage(`${r.code}${r.ambiguous?" — outcome uncertain; retry the same operation":""}`);};
  useEffect(()=>{let active=true;void onlineRequest({type:"session"}).then(async r=>{if(!active)return;accept(r);
    if(r.type==="session"){const room=sessionStorage.getItem("li4chess.online.room");if(room){const l=await onlineRequest({type:"lobby",room});if(active)accept(l);}}}).catch(()=>{if(active)setMessage("Multiplayer service unavailable. Use the explicit local multiplayer configuration.");});return()=>{active=false;};},[]);
  useEffect(()=>{if(!session||!lobby||lobby.phase==="started")return;let active=true;const timer=setInterval(()=>{void onlineRequest({type:"lobby",room:lobby.room}).then(r=>{if(active)accept(r);}).catch(()=>{if(active)setMessage("Lobby unavailable — retrying…");});},1500);return()=>{active=false;clearInterval(timer);};},[session,lobby?.room,lobby?.phase]);
  const perform=async(operation:()=>Promise<OnlineResponse>)=>{setBusy(true);try{accept(await operation());}catch{if(mounted.current)setMessage("Response lost. Retry the same operation.");}finally{if(mounted.current)setBusy(false);}};
  const create=()=>perform(()=>{let id=sessionStorage.getItem("li4chess.online.create");if(!id){id=crypto.randomUUID();sessionStorage.setItem("li4chess.online.create",id);}return onlineRequest({type:"create",id});});
  const leave=()=>{mounted.current=false;sessionStorage.removeItem("li4chess.online.room");sessionStorage.removeItem("li4chess.online.create");setLobby(null);onLeave();};
  if(session&&lobby?.phase==="started")return <ConnectedGame room={lobby.room} session={session} onLeave={leave}/>;
  return <main className="setup-shell online-setup"><h1>Private multiplayer</h1><p>Four authenticated guests · Local service</p>
    <p role="status">{message}</p>
    {!session?<button disabled={busy} onClick={()=>void perform(()=>onlineRequest({type:"issue"}))}>Create guest session</button>:<>
      <p>Guest session expires {new Date(session.expiresAt).toLocaleTimeString()}.</p>
      {!lobby?<><button disabled={busy} onClick={()=>void create()}>Create private room</button>
        <label>Invitation <input value={invite} onChange={e=>setInvite(e.target.value)} autoComplete="off"/></label>
        <button disabled={busy||!/^[0-9a-f]{64}$/.test(invite)} onClick={()=>void perform(()=>onlineRequest({type:"join",invitation:invite}))}>Join private room</button></>:<>
        <p>Room <code data-testid="online-room">{lobby.room}</code> · {lobby.phase}</p>
        {invite&&<label>Share invitation <input aria-label="Share invitation" readOnly value={invite}/></label>}
        <p>Development clock: {lobby.policy.initialMs/1000} seconds + {lobby.policy.incrementMs/1000}. This is not a launch time control.</p>
        <div className="online-seats">{ALL_COLORS.map(seat=><button key={seat} disabled={busy||lobby.phase!=="waiting"||!!lobby.seats[seat]&&!lobby.seats[seat]!.mine}
          onClick={()=>void perform(()=>onlineRequest({type:"seat",room:lobby.room,seat}))}>{PLAYER_COLOR_NAME[seat]} — {lobby.seats[seat]?`${lobby.seats[seat]!.mine?"Your seat":"Taken"}${lobby.seats[seat]!.ready?", ready":""}`:"Available"}</button>)}</div>
        <button disabled={busy||!lobby.seats.some(s=>s?.mine)} onClick={()=>void perform(()=>onlineRequest({type:"ready",room:lobby.room,ready:true}))}>Ready</button>
      </>}
      <button disabled={busy} onClick={()=>void perform(async()=>{const r=await onlineRequest({type:"revoke"});if(mounted.current&&r.type==="revoked"){setSession(null);setLobby(null);sessionStorage.removeItem("li4chess.online.room");sessionStorage.removeItem("li4chess.online.connection.v1");sessionStorage.removeItem("li4chess.online.create");setMessage("Guest revoked. A new guest cannot reclaim the former guest’s seats.");}return r;})}>Revoke guest session</button>
    </>}
    <button onClick={leave}>Back to local play</button></main>;
}
function ConnectedGame({room,session,onLeave}:{room:string;session:Session;onLeave:()=>void}){
  const [client]=useState(()=>new OnlineConnection(room,session,sessionStorage));const [view,setView]=useState(client.view);
  const [selected,setSelected]=useState<number|null>(null),[now,setNow]=useState(performance.now());
  useEffect(()=>{const unsubscribe=client.subscribe(()=>{setView(client.view);setSelected(null);});client.start();return()=>{unsubscribe();client.stop();};},[client]);
  useEffect(()=>{const timer=setInterval(()=>setNow(performance.now()),250);return()=>clearInterval(timer);},[]);
  const snapshot=view.snapshot,state=snapshot?engineState(snapshot.state):null,seat=view.control?.seat as PlayerColor|undefined;
  const moves=state&&view.phase==="connected"&&view.control?.controller&&!view.pending&&!view.takeover&&state.turn===seat?[...legalMoves(state)]:[];
  const targets=new Set(moves.filter(m=>m.from===selected).map(m=>m.to));
  const select=(square:number)=>{if(selected!==null&&targets.has(square)){void client.command({type:"move",from:selected,to:square});setSelected(null);}else setSelected(moves.some(m=>m.from===square)?square:null);};
  const leave=async()=>{if((view.pending||view.takeover||view.identityConflict)&&!window.confirm("A sent command or takeover may already be committed. Leave and clear its saved intention after abandoning response recovery?"))return;await client.leave();onLeave();};
  const seconds=(n:number)=>Math.max(0,n/1000).toFixed(1);
  return <main className="game-shell"><header className="app-header"><h1>Private multiplayer</h1><button onClick={()=>void leave()}>Leave online room</button></header>
    <p role="status" data-testid="online-status">{view.phase} · {view.notice}</p>
    {view.identityConflict&&<button onClick={()=>{if(window.confirm("Abandon the previous identity's unresolved intention? This cannot undo a committed command or recover its receipt under the new identity."))client.abandonPreviousIdentity();}}>Abandon previous intention and connect</button>}
    <p data-testid="online-control">{seat===undefined?"Authenticating seat":`${PLAYER_COLOR_NAME[seat]} · ${view.control?.controller?"Controller":"Observer"} · generation ${view.control?.generation}`}</p>
    {view.control&&!view.control.controller&&<button onClick={()=>void client.takeControl()}>Take control</button>}
    <button onClick={()=>client.reconnect()}>Reconnect and resync</button>
    {view.takeover&&<div role="status"><p>Pending takeover <code data-testid="pending-takeover">{view.takeover}</code>. Its outcome may already be committed.</p>
      <button onClick={()=>void client.takeControl()}>Retry same takeover</button></div>}
    {view.pending&&<div role="status"><p>Pending command <code data-testid="pending-command">{view.pending.request.id}</code>. Its outcome may already be committed.</p>
      <button onClick={()=>void client.retryPending()}>Retry same command</button><button onClick={()=>{if(window.confirm("Resync and forget this intention? This does not undo a committed command."))void client.clearPending();}}>Resync and clear intention</button></div>}
    {state&&snapshot&&<><p data-testid="online-boundary">Command {snapshot.command} · {snapshot.stateHash}</p>
      <p>{state.result?`Game finished — ${state.result.reason}`:`${PLAYER_COLOR_NAME[state.turn]} to move`} · <span data-testid="online-timing">Timing {view.suspension?.timing.phase??snapshot.timing.phase}{view.phase==="recovering"&&!view.suspension?" (last known; resync required)":""}</span></p>
      <div className="online-seats">{ALL_COLORS.map(color=>{const t=view.suspension?.command===snapshot.command?view.suspension.timing:snapshot.timing;
        const elapsed=Math.max(0,now-view.receivedAt);const remaining=t.phase==="running"&&t.activeSeat===color&&t.deadline!==null?t.deadline-snapshot.serverTime-elapsed:t.remainingMs[color];
        const bank=t.phase==="running"&&!t.connected[color]&&state.players[color].status==="active"?t.disconnectRemainingMs[color]-(snapshot.serverTime-t.accountedAt)-elapsed:t.disconnectRemainingMs[color];
        return <section key={color} aria-label={`${PLAYER_COLOR_NAME[color]} timing`}><strong>{PLAYER_COLOR_NAME[color]} · {state.players[color].score} points</strong>
          <p>Clock {seconds(remaining)}s · Disconnect bank {seconds(bank)}s · {t.connected[color]?"Present":"Disconnected"}</p></section>;})}</div>
      <p>Server snapshot at {new Date(snapshot.serverTime).toLocaleTimeString()}. Countdown is a display estimate; the server decides admission and expiry.</p>
      {snapshot.timing.previousResume&&<p>Timing resumed: {snapshot.timing.previousResume.reason}, revision {snapshot.timing.previousResume.revision}</p>}
      <div className="online-board"><Board board={state.board} onSquareClick={select} onClearSelection={()=>setSelected(null)} selectedSquare={selected} legalTargets={targets} bottomColor={seat??0}/></div>
      <div className="board-tools"><button disabled={!view.control?.controller||view.phase!=="connected"||!!view.pending||!!view.takeover||seat===undefined||state.players[seat].status!=="active"} onClick={()=>{if(window.confirm("Resign your seat? During the opening this aborts the game."))void client.command({type:"resign"});}}>Resign my seat</button>
        {seat!==undefined&&canClaimWin(state,seat)&&<button disabled={!view.control?.controller||view.phase!=="connected"||!!view.pending||!!view.takeover} onClick={()=>{if(window.confirm("Claim Win now and end this game?"))void client.command({type:"claimWin"});}}>Claim Win</button>}</div>
      {state.result&&<section data-testid="online-result"><h2>Authoritative result: {state.result.reason}</h2>{state.result.placements.map(p=><p key={p.color}>{PLAYER_COLOR_NAME[p.color]} — place {p.place}, {p.score} points</p>)}</section>}
    </>}
  </main>;
}
