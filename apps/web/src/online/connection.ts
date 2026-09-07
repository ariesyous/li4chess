import { ONLINE_VERSION, ONLINE_LIMITS, parseOnlineRequest, parseOnlineResponse, equalCanonical, sha256 } from "@li4chess/protocol";
import type { Intention, OnlineRequest, OnlineResponse, OnlineSnapshot, OnlineControl, OnlineSuspension } from "@li4chess/protocol";
export type Session = Extract<OnlineResponse,{type:"session"}>;
export type ConnectionState = "connecting" | "connected" | "recovering" | "expired" | "revoked" | "terminal";
type RequestBody = OnlineRequest extends infer R ? R extends OnlineRequest ? Omit<R,"version"> : never : never;
export async function onlineRequest(body:RequestBody,proof?:string):Promise<OnlineResponse>{
  const input=parseOnlineRequest({version:ONLINE_VERSION,...body});
  const response=await fetch("/api/online",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","X-Li4chess-Protocol":ONLINE_VERSION,
    ...(proof?{"X-Li4chess-Connection":proof}:{})},body:JSON.stringify(input),signal:AbortSignal.timeout(10000)});
  const reader=response.body?.getReader();if(!reader)throw new Error("Missing response");let size=0;const chunks:Uint8Array[]=[];
  for(;;){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>ONLINE_LIMITS.snapshotBytes){void reader.cancel().catch(()=>undefined);throw new Error("Response too large");}chunks.push(next.value);}
  const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  return parseOnlineResponse(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));
}
export interface Pending { request:Extract<OnlineRequest,{type:"command"}>; generation:number }
interface Saved { principal:string;session:number;room:string;proof:string|null;pending:Pending|null;takeover:string|null }
export interface OnlineView { phase:ConnectionState;snapshot:OnlineSnapshot|null;suspension:OnlineSuspension|null;receivedAt:number;control:OnlineControl|null;pending:Pending|null;identityConflict:boolean;notice:string }
/** Every callback is bound to an attempt, including asynchronous hash validation.
 * Receipts resolve intentions; only snapshots can replace displayed state. */
export class OnlineConnection {
  view:OnlineView={phase:"connecting",snapshot:null,suspension:null,receivedAt:0,control:null,pending:null,identityConflict:false,notice:"Connecting…"};
  private saved:Saved;private socket:WebSocket|null=null;private epoch=0;private timer:ReturnType<typeof setTimeout>|undefined;
  private stopped=false;private attempts=0;private sending=false;private clearing=false;private listeners=new Set<()=>void>();
  private releaseLock:(()=>void)|null=null;
  private takeoverAttempt:number|null=null;
  private heartbeat:ReturnType<typeof setInterval>|undefined;
  private networkChanged=()=>this.reconnect();
  private frames:Promise<void>=Promise.resolve();private readonly key="li4chess.online.connection.v1";
  constructor(readonly room:string,readonly session:Session,private readonly storage:Storage){
    this.saved={principal:session.principal,session:session.generation,room,proof:null,pending:null,takeover:null};
    try{const text=storage.getItem(this.key);if(text){if(text.length>6000)throw new Error("Saved intention too large");const value=JSON.parse(text) as Saved;
      if(value.principal===session.principal&&value.session===session.generation&&value.room===room){
        if(value.proof!==null&&!/^[0-9a-f]{64}$/.test(value.proof))throw new Error("Invalid saved connection");
        if(value.pending){const p=parseOnlineRequest(value.pending.request);if(p.type!=="command"||p.room!==room||!Number.isSafeInteger(value.pending.generation))throw new Error("Invalid saved intention");}
        this.saved=value;this.view.pending=value.pending;
      }else if(value.pending||value.takeover){this.view={...this.view,phase:"revoked",identityConflict:true,notice:"An unresolved intention belongs to a previous identity, session or room. It was retained. Deliberately abandon it before connecting with this identity."};}
      else storage.removeItem(this.key);}}
    catch{this.view={...this.view,phase:"revoked",identityConflict:true,notice:"Saved connection could not be read. Its bytes were retained; deliberately abandon it before creating a new connection."};}
  }
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  private update(value:Partial<OnlineView>){this.view={...this.view,...value};for(const f of this.listeners)f();}
  private save(){this.storage.setItem(this.key,JSON.stringify(this.saved));}
  start(){if(this.view.identityConflict)return;this.stopped=false;window.addEventListener("offline",this.networkChanged);window.addEventListener("online",this.networkChanged);
    this.heartbeat=setInterval(()=>{if(this.view.phase!=="connected")return;const epoch=this.epoch;void this.resync(epoch).catch(()=>this.recover(epoch));},15000);void this.connect();}
  stop(){this.stopped=true;this.epoch++;clearTimeout(this.timer);clearInterval(this.heartbeat);window.removeEventListener("offline",this.networkChanged);window.removeEventListener("online",this.networkChanged);
    const old=this.socket;this.socket=null;old?.close();this.releaseLock?.();this.releaseLock=null;}
  private authError(r:OnlineResponse):boolean {if(r.type!=="error"||!["expired","revoked"].includes(r.code))return false;
    this.stop();this.update({phase:r.code==="expired"?"expired":"revoked",notice:"Guest session expired or was revoked. Pending intentions remain unresolved; start a new guest deliberately."});return true;}
  private recover(epoch:number,notice="Connection unavailable — recovering and resyncing…"){
    if(this.stopped||epoch!==this.epoch)return;this.epoch++;const old=this.socket;this.socket=null;old?.close();this.sending=false;
    this.update({phase:"recovering",notice});clearTimeout(this.timer);this.timer=setTimeout(()=>void this.connect(),Math.min(500*2**Math.min(this.attempts++,4),8000));
  }
  reconnect(){if(this.stopped||this.view.identityConflict)return;this.recover(this.epoch);}
  abandonPreviousIdentity(){if(!this.view.identityConflict)return;this.storage.removeItem(this.key);this.update({identityConflict:false,pending:null});this.start();}
  private async lockProof():Promise<boolean>{if(this.releaseLock)return true;
    const epoch=this.epoch,name=await sha256(this.saved.proof!);
    return new Promise<boolean>((resolve,reject)=>{void navigator.locks.request(`li4chess:${name}`,{ifAvailable:true},async lock=>{
      if(!lock||this.stopped||epoch!==this.epoch){resolve(false);return;}await new Promise<void>(release=>{this.releaseLock=release;resolve(true);});
    }).catch(reject);});
  }
  private applyControl(control:OnlineControl){const old=this.view.control;if(old&&control.generation<old.generation)return;
    this.update({control});}
  private async connect(){if(this.view.identityConflict)return;const epoch=++this.epoch;const current=()=>!this.stopped&&epoch===this.epoch;
    this.update({phase:this.view.snapshot?"recovering":"connecting"});
    try{
      const auth=await onlineRequest({type:"session"});if(!current()||this.authError(auth))return;
      if(auth.type==="error"&&auth.code==="unauthorized"){this.stop();this.update({phase:"expired",notice:"Guest cookie is no longer available. Pending intentions were retained."});return;}
      if(auth.type!=="session")throw new Error("Authentication service unavailable");
      if(auth.principal!==this.session.principal||auth.generation!==this.session.generation){this.stop();this.update({phase:"revoked",notice:"Guest identity changed. Leave this room before using the new session."});return;}
      if(this.saved.proof&&!await this.lockProof()){this.saved.proof=null;this.save();}
      if(!current())return;
      if(!this.saved.proof){const r=await onlineRequest({type:"connection",room:this.room});if(!current()||this.authError(r))return;
        if(r.type!=="connection")throw new Error("Connection unavailable");this.saved.proof=r.proof;this.save();}
      if(!await this.lockProof()||!current())throw new Error("Tab proof already owned");
      const url=new URL("/api/online",window.location.href);url.protocol=url.protocol==="https:"?"wss:":"ws:";
      const socket=new WebSocket(url,ONLINE_VERSION);this.socket=socket;let freshControl=false,freshSnapshot=false;
      socket.onopen=()=>{if(current())socket.send(JSON.stringify({version:ONLINE_VERSION,type:"attach",room:this.room,proof:this.saved.proof}));};
      socket.onmessage=event=>{this.frames=this.frames.then(async()=>{if(!current())return;
        if(typeof event.data!=="string"||new TextEncoder().encode(event.data).length>ONLINE_LIMITS.snapshotBytes)throw new Error("Invalid frame");
        const r=await parseOnlineResponse(JSON.parse(event.data));if(!current())return;
        if(r.type==="resyncRequired"){this.recover(epoch);return;}if(this.authError(r))return;
        if(r.type==="suspended"){
          const old=this.view.snapshot,s=r.suspension;
          if(!old||s.command>old.command||s.command===old.command&&s.stateHash===old.stateHash&&s.timing.revision>=old.timing.revision)this.update({suspension:s});
          return;
        }
        if(r.type==="control"){this.applyControl(r.control);freshControl=true;}
        if(r.type==="snapshot"){await this.applySnapshot(r.snapshot,false,epoch);freshSnapshot=true;}
        if(current()&&freshControl&&freshSnapshot&&this.view.snapshot&&this.view.control){this.attempts=0;this.update({phase:this.view.snapshot.state.position.result?"terminal":"connected",notice:this.saved.pending?"Resolving the saved command…":"Connected"});
          if(this.saved.takeover)void this.takeControl();else void this.retryPending();}
      }).catch(()=>this.recover(epoch,"Invalid or conflicting snapshot — resyncing…"));};
      socket.onerror=()=>this.recover(epoch);socket.onclose=()=>this.recover(epoch);
      clearTimeout(this.timer);this.timer=setTimeout(()=>{if(current()&&this.view.phase!=="connected"&&this.view.phase!=="terminal")this.recover(epoch);},10000);
    }catch{if(current())this.recover(epoch);}
  }
  private async applySnapshot(s:OnlineSnapshot,resync:boolean,epoch:number){
    if(epoch!==this.epoch||this.stopped)return;if(s.gameId!==this.room)throw new Error("Wrong room");const old=this.view.snapshot;
    if(old){if(s.command<old.command)return;
      if(s.command===old.command){if(s.stateHash!==old.stateHash||s.chainHash!==old.chainHash)throw new Error("Conflicting boundary");
        if(s.timing.revision<old.timing.revision)return;
        if(s.timing.revision===old.timing.revision&&!equalCanonical(s.timing,old.timing))throw new Error("Conflicting timing");}
      if(s.command>old.command+1&&!resync){await this.resync(epoch);return;}
      if(old.state.position.result&&s.stateHash!==old.stateHash)throw new Error("Terminal changed");}
    const suspended=this.view.suspension;
    this.update({snapshot:s,receivedAt:performance.now(),...(suspended&&s.command>=suspended.command&&s.timing.revision>=suspended.timing.revision?{suspension:null}:{}),...(s.state.position.result?{phase:"terminal" as const}:{})});
  }
  private async resync(epoch=this.epoch){const r=await onlineRequest({type:"resync",room:this.room,expectedCommand:this.view.snapshot?.command??0},this.saved.proof??undefined);
    if(epoch!==this.epoch||this.stopped||this.authError(r))throw new Error("Resync interrupted");if(r.type!=="snapshot")throw new Error("Resync unavailable");await this.applySnapshot(r.snapshot,true,epoch);}
  async command(action:Intention){if(this.saved.pending||this.clearing||!this.view.control?.controller||this.view.phase!=="connected"||this.view.snapshot?.state.position.result)return;
    if(this.saved.takeover||this.takeoverAttempt!==null){this.update({notice:"Resolve the takeover response before sending a game command."});return;}
    const pending:Pending={generation:this.view.control.generation,request:{version:ONLINE_VERSION,type:"command",room:this.room,id:crypto.randomUUID(),expectedCommand:this.view.snapshot!.command,action}};
    this.saved.pending=pending;try{this.save();}catch{this.saved.pending=null;this.update({notice:"Browser storage unavailable. Command was not sent; enable session storage to retain retry intentions."});return;}
    this.update({pending,notice:"Waiting for authoritative receipt…"});await this.retryPending();
  }
  async retryPending(){const pending=this.saved.pending,epoch=this.epoch;if(!pending||this.sending||this.clearing||this.stopped||!["connected","terminal"].includes(this.view.phase)||!this.view.snapshot||!this.view.control)return;
    if(!this.view.control.controller||pending.generation!==this.view.control.generation){this.update({notice:"This saved command belongs to earlier control. It will not be resent. Resync and deliberately clear it before taking control."});return;}
    this.sending=true;try{
      const r=await onlineRequest(pending.request,this.saved.proof??undefined);if(epoch!==this.epoch||this.stopped||this.saved.pending!==pending)return;
      if(r.type==="receipt"){
        if(r.receipt.id!==pending.request.id)throw new Error("Wrong receipt");this.saved.pending=null;this.save();this.update({pending:null,notice:`Command ${r.receipt.sequence} confirmed`});await this.resync(epoch);
      }else if(r.type==="error"&&!r.ambiguous){
        if(this.authError(r))return;
        if(r.code==="unauthorized"||r.code==="conflict"){this.update({notice:`Command ownership or ID conflict (${r.code}). Intention retained for deliberate resync and cleanup.`});await this.resync(epoch);return;}
        this.saved.pending=null;this.save();this.update({pending:null,notice:`Command rejected: ${r.code}`});await this.resync(epoch);
      }else this.recover(epoch);
    }catch{this.recover(epoch);}finally{if(epoch===this.epoch)this.sending=false;}
  }
  async clearPending(){if(this.sending||this.clearing){this.update({notice:"A command response is still in flight. Wait for its outcome or recovery before clearing."});return;}
    const epoch=this.epoch;this.clearing=true;try{await this.resync(epoch);if(epoch!==this.epoch||this.stopped)return;this.saved.pending=null;this.save();this.update({pending:null,notice:"Saved intention cleared after resync. No new command was sent."});}
    catch{this.update({notice:"Resync did not complete. The saved intention was retained."});}finally{this.clearing=false;}}
  async takeControl(){if(this.saved.pending){this.update({notice:"Resolve or deliberately clear the saved intention before takeover."});return;}
    if(this.stopped||this.view.identityConflict||!["connected","terminal"].includes(this.view.phase))return;
    const epoch=this.epoch;if(this.takeoverAttempt===epoch)return;this.takeoverAttempt=epoch;this.saved.takeover??=crypto.randomUUID();this.save();
    try{const r=await onlineRequest({type:"takeControl",room:this.room,id:this.saved.takeover},this.saved.proof??undefined);if(epoch!==this.epoch)return;
      if(r.type==="control"){this.saved.takeover=null;this.save();this.applyControl(r.control);this.update({notice:"Control updated"});await this.resync(epoch);}
      else if(r.type==="error"&&r.code==="conflict"&&!r.ambiguous){this.saved.takeover=null;this.save();this.update({notice:"The earlier takeover was superseded. Choose Take control again to make a new request."});await this.resync(epoch);}
      else if(!this.authError(r)){this.update({notice:"Takeover outcome needs recovery. Retry Take control with the same intention."});this.reconnect();}
    }catch{if(epoch===this.epoch)this.reconnect();}finally{if(this.takeoverAttempt===epoch)this.takeoverAttempt=null;}
  }
  async leave(){this.stop();if(this.saved.proof)await onlineRequest({type:"retire",room:this.room},this.saved.proof).catch(()=>undefined);this.storage.removeItem(this.key);}
}
