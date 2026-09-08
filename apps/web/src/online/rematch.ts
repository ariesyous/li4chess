import { ONLINE_VERSION, parseOnlineRequest } from "@li4chess/protocol";
import type { OnlineRematch, OnlineResponse, RematchMutation } from "@li4chess/protocol";
import { onlineRequest, type Session } from "./connection.js";

interface Saved { principal: string; room: string; request: RematchMutation }
export interface RematchView { state: OnlineRematch | null; pending: RematchMutation | null; busy: boolean; blocked: boolean; notice: string }
/** One saved principal-owned intention. Transport cancellation never establishes
 * rejection. Session rotation may recover the same principal's exact payload. */
export class RematchClient {
  readonly key="li4chess.online.rematch.v1";
  view:RematchView={state:null,pending:null,busy:false,blocked:false,notice:"Checking rematch availability…"};
  private epoch=0;private stopped=true;private abort=new AbortController();private polling=false;
  private listeners=new Set<()=>void>();
  constructor(readonly room:string,readonly session:Session,private readonly storage:Storage){
    try{const raw=storage.getItem(this.key);if(raw){if(raw.length>8000)throw new Error();const saved=JSON.parse(raw) as Saved;
      const r=parseOnlineRequest({version:ONLINE_VERSION,...saved.request});
      if(saved.room!==room||saved.principal!==session.principal||!("room" in r)||r.room!==room||!["rematchPropose","rematchConsent","rematchDecline"].includes(r.type))throw new Error();
      this.view.pending=saved.request;this.view.notice="An unresolved rematch request was retained. Retry its exact ID.";
    }}catch{this.view.blocked=true;this.view.notice="A saved rematch intention belongs to another room/identity or cannot be read. It was retained; deliberately abandon recovery before continuing.";}
  }
  subscribe=(f:()=>void)=>{this.listeners.add(f);return()=>{this.listeners.delete(f);};};
  private update(v:Partial<RematchView>){this.view={...this.view,...v};for(const f of this.listeners)f();}
  start(){this.stopped=false;this.abort=new AbortController();void this.refresh();}
  stop(){this.stopped=true;this.epoch++;this.abort.abort();this.polling=false;this.update({busy:false});}
  private current(epoch:number){return !this.stopped&&epoch===this.epoch;}
  private async sessionCheck(signal:AbortSignal){
    const auth=await onlineRequest({type:"session"},undefined,signal);
    if(auth.type!=="session"||auth.principal!==this.session.principal||auth.generation!==this.session.generation)throw new Error("Guest session unavailable or changed. Reopen with the original principal; the intention is retained.");
  }
  private accept(r:OnlineResponse){
    if(r.type!=="rematch"||r.principal!==this.session.principal||r.generation!==this.session.generation||r.rematch.room!==this.room)throw new Error("Rematch response identity mismatch. Retry safely.");
    if(!this.view.state||r.rematch.revision>=this.view.state.revision)this.update({state:r.rematch});
    return r;
  }
  async refresh(){if(this.stopped||this.view.blocked||this.polling||this.view.busy)return;const epoch=this.epoch,signal=this.abort.signal;this.polling=true;
    try{await this.sessionCheck(signal);const r=await onlineRequest({type:"rematch",room:this.room},undefined,signal);if(!this.current(epoch))return;
      if(r.type==="error")throw new Error(`Rematch unavailable: ${r.code}. Retry after recovery.`);
      this.accept(r);if(this.view.notice==="Checking rematch availability…")this.update({notice:""});
    }catch(error){if(this.current(epoch))this.update({notice:error instanceof Error?error.message:"Rematch status unavailable."});}
    finally{if(this.current(epoch))this.polling=false;}
  }
  /** Departure needs a fresh authenticated observation, even while a poll is pending. */
  async reconcile():Promise<boolean>{
    if(this.stopped||this.view.blocked||this.view.busy)return false;
    const epoch=this.epoch,signal=this.abort.signal;
    try{await this.sessionCheck(signal);const r=await onlineRequest({type:"rematch",room:this.room},undefined,signal);
      if(!this.current(epoch)||r.type==="error")return false;this.accept(r);return true;
    }catch{return false;}
  }
  private save(request:RematchMutation|null){
    if(request)this.storage.setItem(this.key,JSON.stringify({principal:this.session.principal,room:this.room,request} satisfies Saved));
    else this.storage.removeItem(this.key);
    this.update({pending:request});
  }
  async act(type:RematchMutation["type"]):Promise<boolean>{
    if(this.stopped||this.view.blocked||this.view.pending||this.view.busy||!this.view.state)return false;
    const common={room:this.room,id:crypto.randomUUID(),expectedRevision:this.view.state.revision};
    const request:RematchMutation=type==="rematchPropose"?{...common,type}:{...common,type,proposal:this.view.state.proposal};
    try{this.save(request);}catch{this.update({notice:"Browser storage failed. No rematch request was sent."});return false;}
    return this.retry();
  }
  async retry():Promise<boolean>{
    const request=this.view.pending;if(!request||this.stopped||this.view.busy||this.view.blocked)return false;
    const epoch=this.epoch,signal=this.abort.signal;this.update({busy:true,notice:"Waiting for the rematch request outcome…"});
    try{
      await this.sessionCheck(signal);if(!this.current(epoch))return false;
      const r=await onlineRequest(request,undefined,signal);if(!this.current(epoch))return false;
      if(r.type==="error"){
        // Admission/authentication errors can precede receipt lookup, including
        // on a retry of an already committed request. Only a receipt resolves it.
        this.update({notice:`Rematch request: ${r.code}. Outcome unresolved; retry the same ID or deliberately abandon recovery.`});return false;
      }
      const response=this.accept(r);if(response.receipt?.id!==request.id)throw new Error("Rematch acknowledgement mismatch.");
      this.save(null);this.update({notice:"Rematch request confirmed."});return true;
    }catch(error){if(this.current(epoch))this.update({notice:error instanceof Error?error.message:"Response lost. Retry the same rematch ID."});return false;}
    finally{if(this.current(epoch)){this.update({busy:false});void this.refresh();}}
  }
  abandon():boolean{
    try{this.stop();this.storage.removeItem(this.key);this.update({pending:null,blocked:false,notice:"Response recovery abandoned. A sent request may already have committed."});this.start();return true;}
    catch{this.update({notice:"Browser storage cleanup failed; the intention remains retained."});this.start();return false;}
  }
}
