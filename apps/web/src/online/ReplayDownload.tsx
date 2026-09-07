import { useEffect, useRef, useState } from "react";
import type { OnlineSnapshot } from "@li4chess/protocol";
import type { Session } from "./connection.js";
import { retrieveCompletedReplay } from "./replay.js";

export function ReplayDownload({room,session,snapshot,signal,allowed}:{room:string;session:Session;snapshot:OnlineSnapshot;signal:AbortSignal;allowed:boolean}) {
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const operation=useRef<AbortController|null>(null),enabled=useRef(allowed);enabled.current=allowed;
  const identity=`${room}:${session.principal}:${session.generation}`,identityRef=useRef(identity);identityRef.current=identity;
  useEffect(()=>{setBusy(false);setMessage("");return()=>{operation.current?.abort();operation.current=null;};},[identity]);
  useEffect(()=>{if(!allowed){operation.current?.abort();operation.current=null;setBusy(false);}},[allowed]);
  const download=async()=>{
    if(operation.current||signal.aborted||!enabled.current)return;
    const controller=new AbortController();operation.current=controller;setBusy(true);setMessage("Verifying saved replay…");
    const combined=AbortSignal.any([controller.signal,signal]);
    const current=()=>!combined.aborted&&operation.current===controller&&enabled.current&&identityRef.current===identity;
    try {
      const json=await retrieveCompletedReplay(room,session,snapshot,combined,(n,total)=>{if(current())setMessage(`Verifying saved replay… ${n}/${total}`);});
      if(!current())return;
      const url=URL.createObjectURL(new Blob([json],{type:"application/json"}));
      try {const anchor=document.createElement("a");anchor.href=url;anchor.download=`li4chess-${room.replace(/[^a-zA-Z0-9_-]/g,"-")}.replay.json`;anchor.click();}
      finally {setTimeout(()=>URL.revokeObjectURL(url),1000);}
      setMessage("Verified replay download started. You can import this file in local play.");
    } catch(error) {if(current())setMessage(`${error instanceof Error?error.message:"Download interrupted."} Download again to retry safely.`);}
    finally {if(operation.current===controller){operation.current=null;setBusy(false);}}
  };
  return <div><button disabled={busy||!allowed||signal.aborted} onClick={()=>void download()}>Download replay</button>
    <p role="status" data-testid="replay-download-status">{message}</p></div>;
}
