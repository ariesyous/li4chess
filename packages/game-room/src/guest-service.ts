import { DurableObject } from "cloudflare:workers";
import { createInitialState, type PlayerColor } from "@li4chess/engine";
import { createReplay, equalCanonical, sha256, ONLINE_VERSION, ONLINE_ERRORS, ONLINE_LIMITS, parseOnlineRequest, parseOnlineResponse, wireProof } from "@li4chess/protocol";
import type { EngineBuildIdentityV1, OnlineRequest, OnlineResponse, OnlineControl, OnlineLobby, OnlineErrorCode } from "@li4chess/protocol";
import type { GameRoom } from "./index.js";
import type { ConnectionContext, Creation, Publication, Snapshot } from "./room.js";
import { emptyRematch, settleRematch, rematchView, rematchReceipt, mutateRematch, RematchError } from "./rematch.js";
import type { RematchRecord } from "./rematch.js";
import type { RematchMutation, RematchReceipt } from "@li4chess/protocol";

export interface GuestEnvironment { GAME_ROOMS: DurableObjectNamespace<GameRoom>; ROOM_NAMESPACE: string; ROOM_PRODUCER: EngineBuildIdentityV1;
  ONLINE_ORIGIN: string; GUEST_TTL_MS: string; ONLINE_INITIAL_MS: string; ONLINE_INCREMENT_MS: string }
interface Credential { principal: string; generation: number; credentialGeneration: number; expiresAt: number; revoked: boolean }
interface Lobby { room: string; owner: string; invitationDigest: string; members: string[]; seats: (string | null)[];
  ready: boolean[]; revision: number; phase: OnlineLobby["phase"]; creation: Creation | null;
  rematchOf?: string; fixedPolicy?: Creation["policy"]; seed?: string; retryAt?: number; retryAttempts?: number }
interface Tab { digest: string; principal: string; session: number; room: string; context: ConnectionContext;
  takeovers: { id: string; generation: number }[]; detach: boolean; credentialDigest: string }
interface Bridge { tab: Tab; credentialDigest: string; socket: WebSocket; upstream: WebSocket | null }
class ServiceError extends Error { constructor(readonly code: OnlineErrorCode, readonly ambiguous = false) { super(code); } }
const requireService = (v: unknown, code: OnlineErrorCode = "unauthorized"): void => { if(!v) throw new ServiceError(code); };
const random = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,"0")).join("");
type ResponseBody = OnlineResponse extends infer R ? R extends OnlineResponse ? Omit<R,"version"> : never : never;
const version = <T extends ResponseBody>(body: T) => ({version:ONLINE_VERSION,...body});
function errorResponse(error: unknown): Response {
  const code = error instanceof ServiceError ? error.code : "unavailable";
  return Response.json(version({type:"error",code,ambiguous:error instanceof ServiceError ? error.ambiguous : true}),
    {status:["expired","revoked","unauthorized"].includes(code)?401:code==="origin"?403:code==="unavailable"?503:code==="capacity"?429:409,
      headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
export function checkOnlineOrigin(request: Request, origin: string): void {
  const configured=new URL(origin); const actual=new URL(request.url);
  requireService(configured.origin===origin && actual.origin===origin && request.headers.get("Origin")===origin,"origin");
  requireService(configured.protocol==="https:" || configured.protocol==="http:" && ["127.0.0.1","localhost","[::1]"].includes(configured.hostname),"origin");
  requireService(actual.pathname==="/api/online" && actual.search==="","invalid");
}
async function readRequest(request: Request): Promise<OnlineRequest> {
  requireService(request.method==="POST" && request.headers.get("Content-Type")==="application/json" &&
    request.headers.get("X-Li4chess-Protocol")===ONLINE_VERSION,"invalid");
  const reader=request.body?.getReader(); requireService(reader,"invalid");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read=async()=>{let size=0;const chunks:Uint8Array[]=[];for(;;){const next=await reader!.read();if(next.done)break;size+=next.value.length;
      requireService(size<=ONLINE_LIMITS.requestBytes,"invalid");chunks.push(next.value);}const bytes=new Uint8Array(size);let at=0;
      for(const c of chunks){bytes.set(c,at);at+=c.length;}return parseOnlineRequest(JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)));};
    return await Promise.race([read(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new ServiceError("invalid")),5000);})]);
  } catch(error) { void reader!.cancel().catch(()=>undefined); if(error instanceof ServiceError)throw error;throw new ServiceError("invalid"); }
  finally {if(timer)clearTimeout(timer);}
}

/** Maintained, explicitly configured small private-room service. No fault/admin
 * routes. Only authenticated server-derived contexts cross the room binding. */
export class GuestService extends DurableObject<GuestEnvironment> {
  private tail: Promise<unknown> = Promise.resolve(); private queued=0;
  private bridges=new Map<string,Bridge>(); private handshakes=0; private reading=0;
  constructor(ctx:DurableObjectState,env:GuestEnvironment){super(ctx,env);
    ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS guest_records (key TEXT PRIMARY KEY, value TEXT NOT NULL)");}
  private get<T>(key:string):T|null {const rows=this.ctx.storage.sql.exec<{value:string}>("SELECT value FROM guest_records WHERE key=?",key).toArray();return rows[0]?JSON.parse(rows[0].value) as T:null;}
  private list<T>(prefix:string):T[]{return this.ctx.storage.sql.exec<{value:string}>("SELECT value FROM guest_records WHERE key LIKE ? ORDER BY key",`${prefix}%`).toArray().map(x=>JSON.parse(x.value) as T);}
  private async put(values:Record<string,unknown|null>,alarmAt?:number){
    const write=()=>{for(const [key,v] of Object.entries(values)){
      if(v===null)this.ctx.storage.sql.exec("DELETE FROM guest_records WHERE key=?",key);else{const json=JSON.stringify(v);requireService(json.length<=600000,"capacity");this.ctx.storage.sql.exec("INSERT INTO guest_records VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",key,json);}}};
    if(alarmAt===undefined)this.ctx.storage.transactionSync(write);
    else await this.ctx.storage.transaction(async()=>{write();await this.ctx.storage.setAlarm(alarmAt);});
    await this.ctx.storage.sync();
  }
  private enqueue<T>(fn:()=>Promise<T>):Promise<T>{if(this.queued>=32)return Promise.reject(new ServiceError("capacity"));this.queued++;
    const task=this.tail.then(fn);this.tail=task.catch(()=>undefined).finally(()=>{this.queued--;});return task;}
  private cookieName(){return new URL(this.env.ONLINE_ORIGIN).protocol==="https:"?"__Host-li4chess-guest":"li4chess-local-guest";}
  private cookie(value:string,seconds:number){return `${this.cookieName()}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(this.env.ONLINE_ORIGIN).protocol==="https:"?"; Secure":""}`;}
  private async credential(request:Request):Promise<{digest:string;value:Credential}>{
    requireService((request.headers.get("Cookie")??"").length<=4096,"invalid");
    const values=(request.headers.get("Cookie")??"").split(";").map(x=>x.trim()).filter(x=>x.startsWith(`${this.cookieName()}=`));
    requireService(values.length===1);const token=values[0].slice(this.cookieName().length+1);try{wireProof(token);}catch{throw new ServiceError("unauthorized");}
    const digest=await sha256(token);return {digest,value:this.valid(digest)};
  }
  private valid(digest:string):Credential {const c=this.get<Credential>(`credential:${digest}`);requireService(c);if(c!.revoked)throw new ServiceError("revoked");
    if(Date.now()>=c!.expiresAt)throw new ServiceError("expired");return c!;}
  private policy(){const initialMs=Number(this.env.ONLINE_INITIAL_MS),incrementMs=Number(this.env.ONLINE_INCREMENT_MS);
    requireService(Number.isSafeInteger(initialMs)&&initialMs>0&&initialMs<=86400000&&Number.isSafeInteger(incrementMs)&&incrementMs>=0&&incrementMs<=86400000,"unavailable");
    return {initialMs,incrementMs,increment:"after-move" as const};}
  private member(room:string,principal:string):Lobby {const lobby=this.get<Lobby>(`lobby:${room}`);requireService(lobby?.members.includes(principal));return lobby!;}
  private stub(lobby:Lobby){return this.env.GAME_ROOMS.get(this.env.GAME_ROOMS.idFromName(lobby.room));}
  private view(l:Lobby,p:string):OnlineLobby{return {room:l.room,phase:l.phase,revision:l.revision,seats:l.seats.map((s,i)=>s?{mine:s===p,ready:l.ready[i]}:null),policy:l.fixedPolicy??this.policy(),...(l.rematchOf?{rematchOf:l.rematchOf}:{})};}
  private lobbyRecord(room:string,owner:string,invitationDigest:string):Lobby {
    requireService(this.list("lobby:").length<64,"capacity");
    return {room,owner,invitationDigest,members:[owner],seats:[null,null,null,null],ready:[false,false,false,false],revision:0,phase:"waiting",creation:null};
  }
  private present(principals:readonly (string|null)[]):boolean {
    const live=this.list<Credential>("credential:").filter(c=>!c.revoked&&c.expiresAt>Date.now());
    return principals.length===4&&principals.every(p=>p!==null&&live.some(c=>c.principal===p));
  }
  private async settle(l:Lobby):Promise<RematchRecord> {
    const key=`rematch:${l.room}`,old=this.get<RematchRecord>(key)??emptyRematch();
    requireService(old.proposals.length<=8&&old.receipts.length<=128,"unavailable");
    const next=settleRematch(old,Date.now(),this.present(l.seats));
    if(!equalCanonical(old,next))await this.put({[key]:next});return next;
  }
  private async rematchResponse(l:Lobby,auth:{digest:string;value:Credential},record:RematchRecord,receipt:RematchReceipt|null) {
    const c=auth.value;
    const response=await this.json(version({type:"rematch",principal:c.principal,generation:c.generation,
      rematch:rematchView(record,l.room,l.seats.indexOf(c.principal)),receipt}));
    try{this.valid(auth.digest);}catch(error){if(error instanceof ServiceError)throw new ServiceError(error.code,receipt!==null);throw error;}
    return response;
  }
  private async rematch(l:Lobby,auth:{digest:string;value:Credential},input:RematchMutation|{type:"rematch";room:string}) {
    requireService(l.phase==="started","replayIncomplete");
    const c=auth.value;
    // Never use completedStatus's same-producer fast path to establish eligibility.
    const eligible=await this.stub(l).completedEligibility({gameId:l.room,principal:c.principal,generation:c.generation,expiresAt:c.expiresAt});
    this.valid(auth.digest);if(!eligible.ok)throw new ServiceError(eligible.code);
    requireService(equalCanonical(eligible.principals,l.seats),"replayIntegrity");
    let record=await this.settle(l);this.valid(auth.digest);
    if(input.type==="rematch")return this.rematchResponse(l,auth,record,null);
    try {
      const previous=rematchReceipt(record,c.principal,input);
      if(previous)return this.rematchResponse(l,auth,record,previous);
      // All random and capacity work is bounded and synchronous before admission.
      const successor=`room:${random().slice(0,32)}`;
      let seed=random().slice(0,8);
      if(seed===eligible.seed)seed=((Number.parseInt(seed,16)+1)>>>0).toString(16).padStart(8,"0");
      this.valid(auth.digest);
      record=settleRematch(record,Date.now(),this.present(l.seats));
      if(!this.present(l.seats)){
        await this.put({[`rematch:${l.room}`]:record});throw new ServiceError("conflict");
      }
      const result=mutateRematch(record,c.principal,l.seats.indexOf(c.principal),input,Date.now(),successor);
      const values:Record<string,unknown>={[`rematch:${l.room}`]:result.record};
      if(result.allocated){
        const next=this.lobbyRecord(successor,c.principal,"");
        Object.assign(next,{members:[...eligible.principals],seats:[...eligible.principals],rematchOf:l.room,fixedPolicy:eligible.policy,seed});
        values[`lobby:${successor}`]=next;
      }
      // put begins a synchronous SQLite transaction: consent/receipt and lobby
      // allocation commit together. No cross-object/D1 operation occurs here.
      await this.put(values);await this.schedule();
      return this.rematchResponse(l,auth,result.record,result.receipt);
    }catch(error){if(error instanceof RematchError)throw new ServiceError(error.code);throw error;}
  }
  private async invitation(room:string):Promise<string>{let secret=this.get<string>("invitation-key");if(!secret){secret=random();await this.put({"invitation-key":secret});}
    const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
    return [...new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(room)))].map(n=>n.toString(16).padStart(2,"0")).join("");}
  private async start(l:Lobby){if(l.phase==="started")return;
    if(!l.creation){requireService(l.seats.every(Boolean)&&l.ready.every(Boolean),"invalid");
      if(l.rematchOf)requireService(this.present(l.seats),"conflict");
      const initial=createInitialState();
      const state={...initial,randomSeed:l.seed??random().slice(0,8)};
      const replay=await createReplay(state,this.env.ROOM_PRODUCER);
      if(l.rematchOf)requireService(this.present(l.seats),"conflict");
      l.creation={header:{format:"li4chess-d1-game-v1",gameId:l.room,replay},owner:{namespace:this.env.ROOM_NAMESPACE,generation:1},
        seats:l.seats.map(principal=>({principal:principal!,generation:1})) as Creation["seats"],policy:l.fixedPolicy??this.policy()};
      l.phase="creating";l.revision++;l.retryAt=Date.now()+1000;await this.put({[`lobby:${l.room}`]:l},l.retryAt);}
    await this.stub(l).create(l.creation);l.phase="started";l.revision++;delete l.retryAt;delete l.retryAttempts;await this.put({[`lobby:${l.room}`]:l});
  }
  private async tab(proof:string|null,c:Credential,room:string):Promise<Tab>{try{wireProof(proof);}catch{throw new ServiceError("unauthorized");}
    const tab=this.get<Tab>(`tab:${await sha256(proof!)}`);requireService(tab&&tab.principal===c.principal&&tab.session===c.generation&&tab.room===room&&!tab.detach);
    return tab!;}
  private async control(tab:Tab,l:Lobby):Promise<OnlineControl>{const s=await this.stub(l).controlStatus(tab.context);
    return {seat:tab.context.seat,generation:s.generation,controller:s.controller};}
  private async send(b:Bridge,response:OnlineResponse){
    await parseOnlineResponse(response);const c=this.valid(b.credentialDigest);requireService(c.generation===b.tab.session && this.bridges.get(b.tab.digest)===b);
    b.socket.send(JSON.stringify(response));
  }
  private snapshot(snapshot:Snapshot):OnlineResponse {const {boundary:b,timing}=snapshot;
    return version({type:"snapshot",snapshot:{gameId:b.header.gameId,...b.head,state:b.state,timing,producer:b.header.replay.engineBuild,
      sourceReplayHash:b.header.replay.game.sourceReplayHash??null,serverTime:Date.now()}}) as OnlineResponse;
  }
  private close(b:Bridge){if(this.bridges.get(b.tab.digest)!==b)return;this.bridges.delete(b.tab.digest);
    try{b.socket.close(1000,"connection ended");}catch{/*closed*/}try{b.upstream?.close(1000,"connection ended");}catch{/*closed*/}}
  private async detach(tab:Tab){const l=this.get<Lobby>(`lobby:${tab.room}`);if(l?.phase==="started")await this.stub(l).detach(tab.context);
    tab.detach=false;await this.put({[`tab:${tab.digest}`]:tab});}
  private async invalidate(digest:string,c:Credential,replacement:Record<string,Credential>={}){
    const tabs=this.list<Tab>("tab:").filter(t=>t.principal===c.principal&&t.session===c.generation);
    const values:Record<string,unknown>={...replacement,[`credential:${digest}`]:{...c,revoked:true}};
    for(const t of tabs){t.detach=true;values[`tab:${t.digest}`]=t;}
    // Rotation retirement/replacement and cleanup intent are one local commit.
    // A lost cookie response still follows the existing no-guest-recovery policy.
    await this.put(values,Date.now()+1000);
    for(const t of tabs){const b=this.bridges.get(t.digest);if(b){try{b.socket.send(JSON.stringify(version({type:"error",code:"revoked",ambiguous:false})));}catch{/*best effort*/}this.close(b);}
      try{await this.detach(t);}catch{/* durable cleanup continues on alarm */}}
  }
  private async issue(previous?:{digest:string;value:Credential}):Promise<Response>{
    const ttl=Number(this.env.GUEST_TTL_MS);requireService(Number.isSafeInteger(ttl)&&ttl>=1000&&ttl<=86400000,"unavailable");
    requireService(this.list("credential:").length<256,"capacity");const token=random(),digest=await sha256(token);
    const c:Credential={principal:previous?.value.principal??`guest:${random().slice(0,32)}`,generation:(previous?.value.generation??0)+1,
      credentialGeneration:(previous?.value.credentialGeneration??0)+1,expiresAt:Date.now()+ttl,revoked:false};
    if(previous){this.valid(previous.digest);await this.invalidate(previous.digest,previous.value,{[`credential:${digest}`]:c});}
    else await this.put({[`credential:${digest}`]:c});await this.schedule();
    return this.json(version({type:"session",principal:c.principal,generation:c.generation,expiresAt:c.expiresAt}),{"Set-Cookie":this.cookie(token,Math.ceil(ttl/1000))});
  }
  private async json(value:OnlineResponse,headers:Record<string,string>={}){await parseOnlineResponse(value);return Response.json(value,{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",...headers}});}
  private async schedule(){const times=this.list<Credential>("credential:").filter(c=>!c.revoked&&c.expiresAt>Date.now()).map(c=>c.expiresAt);
    for(const r of this.list<RematchRecord>("rematch:")){const p=r.proposals.at(-1);if(p?.phase==="pending")times.push(Math.max(Date.now()+1,p.expiresAt));}
    for(const l of this.list<Lobby>("lobby:"))if(l.phase==="creating")times.push(Math.max(Date.now()+1,l.retryAt??Date.now()+1000));
    if(this.list<Tab>("tab:").some(t=>t.detach))times.push(Date.now()+1000);if(times.length)await this.ctx.storage.setAlarm(Math.min(...times));else await this.ctx.storage.deleteAlarm();}
  async alarm(){await this.enqueue(async()=>{for(const [_,b] of this.bridges){try{this.valid(b.credentialDigest);}catch{this.close(b);}}
    for(const l of this.list<Lobby>("lobby:"))if(this.get(`rematch:${l.room}`))await this.settle(l);
    // At most one cross-object creation attempt per alarm. Frozen intent remains
    // recoverable even if every participant credential has since expired.
    const creating=this.list<Lobby>("lobby:").filter(l=>l.phase==="creating"&&(l.retryAt??0)<=Date.now()).sort((a,b)=>(a.retryAt??0)-(b.retryAt??0))[0];
    if(creating)try{await this.start(creating);}catch{
      creating.retryAttempts=(creating.retryAttempts??0)+1;
      creating.retryAt=Date.now()+Math.min(60000,1000*2**Math.min(creating.retryAttempts,6));
      await this.put({[`lobby:${creating.room}`]:creating},creating.retryAt);
    }
    for(const t of this.list<Tab>("tab:").filter(t=>t.detach)){try{await this.detach(t);}catch{/*durable retry*/}}await this.schedule();});}
  async fetch(request:Request):Promise<Response>{try{checkOnlineOrigin(request,this.env.ONLINE_ORIGIN);
    if(request.headers.get("Upgrade")?.toLowerCase()==="websocket")return await this.upgrade(request);
    requireService(this.reading<16,"capacity");this.reading++;let input:OnlineRequest;
    try{input=await readRequest(request);}finally{this.reading--;}
    return await this.enqueue(()=>this.handle(request,input));
  }catch(error){return errorResponse(error);}}
  private async handle(request:Request,input:OnlineRequest):Promise<Response>{
    if(input.type==="issue"){
      try {await this.credential(request);} catch(error){if(error instanceof ServiceError&&["expired","revoked","unauthorized"].includes(error.code))return this.issue();throw error;}
      throw new ServiceError("conflict");
    }
    const auth=await this.credential(request),c=auth.value;
    if(input.type==="session")return this.json(version({type:"session",principal:c.principal,generation:c.generation,expiresAt:c.expiresAt}));
    if(input.type==="rotate")return this.issue(auth);
    if(input.type==="revoke"){await this.invalidate(auth.digest,c);return this.json(version({type:"revoked"}),{"Set-Cookie":this.cookie("",0)});}
    if(input.type==="create"){
      const key=`create:${await sha256(`${c.principal}:${input.id}`)}`;let room=this.get<string>(key);
      if(!room){requireService(this.list("lobby:").length<64,"capacity");room=`room:${random().slice(0,32)}`;const invite=await this.invitation(room);
        const l=this.lobbyRecord(room,c.principal,await sha256(invite));
        await this.put({[key]:room,[`lobby:${room}`]:l});}
      const l=this.member(room,c.principal);return this.json(version({type:"created",lobby:this.view(l,c.principal),invitation:await this.invitation(room)}));
    }
    if(input.type==="join"){
      const digest=await sha256(input.invitation);const l=this.list<Lobby>("lobby:").find(x=>x.invitationDigest===digest);requireService(l);
      if(!l!.members.includes(c.principal)){requireService(l!.phase==="waiting"&&l!.members.length<4,"capacity");l!.members.push(c.principal);l!.revision++;await this.put({[`lobby:${l!.room}`]:l});}
      return this.json(version({type:"lobby",lobby:this.view(l!,c.principal)}));
    }
    if(!("room" in input))throw new ServiceError("invalid");
    const l=this.member(input.room,c.principal);
    if(input.type==="rematch"||input.type==="rematchPropose"||input.type==="rematchConsent"||input.type==="rematchDecline")return this.rematch(l,auth,input);
    if(input.type==="completedView"){
      requireService(l.phase==="started","replayIncomplete");
      const completed=await this.stub(l).completedEligibility({gameId:l.room,principal:c.principal,generation:c.generation,expiresAt:c.expiresAt});
      this.valid(auth.digest);if(!completed.ok)throw new ServiceError(completed.code);
      const snapshot=this.snapshot(completed.snapshot as unknown as Snapshot);requireService(snapshot.type==="snapshot","unavailable");
      const response=await this.json(version({type:"replayStatus",principal:c.principal,generation:c.generation,
        snapshot:snapshot.type==="snapshot"?snapshot.snapshot:null,seat:l.seats.indexOf(c.principal)}));
      this.valid(auth.digest);return response;
    }
    if(input.type==="replayStatus"){
      requireService(l.phase==="started","replayIncomplete");
      const completed=await this.stub(l).completedStatus({gameId:l.room,principal:c.principal,generation:c.generation,expiresAt:c.expiresAt});
      if(!completed.ok)throw new ServiceError(completed.code);
      const snapshot=completed.snapshot?this.snapshot(completed.snapshot as unknown as Snapshot):null;
      const response=await this.json(version({type:"replayStatus",principal:c.principal,generation:c.generation,
        snapshot:snapshot?.type==="snapshot"?snapshot.snapshot:null,seat:completed.snapshot?l.seats.indexOf(c.principal):null}));
      this.valid(auth.digest);this.member(l.room,c.principal);return response;
    }
    if(input.type==="replay"){
      requireService(l.phase==="started","replayIncomplete");
      const result=await this.stub(l).completedReplay({gameId:l.room,principal:c.principal,generation:c.generation,expiresAt:c.expiresAt},input.cursor);
      this.valid(auth.digest);this.member(l.room,c.principal);
      if(!result.ok)throw new ServiceError(result.code);
      const response=await this.json(version({type:"replay",page:result.page}));
      this.valid(auth.digest);return response;
    }
    if(input.type==="seat"){
      requireService(!l.rematchOf||l.seats[input.seat]===c.principal,"conflict");
      requireService(l.phase==="waiting","conflict");requireService(l.seats[input.seat]===null||l.seats[input.seat]===c.principal,"conflict");
      const old=l.seats.indexOf(c.principal);if(old!==input.seat){if(old>=0){l.seats[old]=null;l.ready[old]=false;}l.seats[input.seat]=c.principal;l.ready[input.seat]=false;l.revision++;await this.put({[`lobby:${l.room}`]:l});}
      return this.json(version({type:"lobby",lobby:this.view(l,c.principal)}));
    }
    if(input.type==="ready"){
      const seat=l.seats.indexOf(c.principal);requireService(seat>=0);if(l.phase==="waiting"){
        l.ready[seat]=input.ready;l.revision++;await this.put({[`lobby:${l.room}`]:l});if(l.ready.every(Boolean)&&l.seats.every(Boolean))await this.start(l);
      }else{requireService(input.ready,"conflict");await this.start(l);}
      return this.json(version({type:"lobby",lobby:this.view(l,c.principal)}));
    }
    if(input.type==="lobby"){if(l.phase==="creating")await this.start(l);return this.json(version({type:"lobby",lobby:this.view(l,c.principal)}));}
    requireService(l.phase==="started","unavailable");const seat=l.seats.indexOf(c.principal);requireService(seat>=0);
    if(input.type==="connection"){
      const proof=random(),digest=await sha256(proof);requireService(this.list<Tab>("tab:").filter(t=>{
        if(t.room!==l.room)return false;try{this.valid(t.credentialDigest);return true;}catch{return false;}
      }).length<8,"capacity");
      const context:ConnectionContext={gameId:l.room,principal:c.principal,seat:seat as PlayerColor,connectionId:`connection:${random().slice(0,32)}`,generation:1,expiresAt:c.expiresAt};
      const status=await this.stub(l).controlStatus(context);context.generation=status.generation;
      const tab:Tab={digest,principal:c.principal,session:c.generation,room:l.room,context,takeovers:[],detach:false,credentialDigest:auth.digest};await this.put({[`tab:${digest}`]:tab});
      return this.json(version({type:"connection",proof,control:{seat,generation:status.generation,controller:status.controller}}));
    }
    const tab=await this.tab(request.headers.get("X-Li4chess-Connection"),c,l.room);
    if(input.type==="retire"){
      tab.detach=true;await this.put({[`tab:${tab.digest}`]:tab});const b=this.bridges.get(tab.digest);if(b)this.close(b);
      await this.ctx.storage.setAlarm(Date.now()+1000);await this.detach(tab);await this.put({[`tab:${tab.digest}`]:null});return this.json(version({type:"revoked"}));
    }
    requireService(this.bridges.has(tab.digest));
    try{
      if(input.type==="resync")return this.json(this.snapshot(await this.stub(l).read(tab.context,input.expectedCommand) as unknown as Snapshot));
      if(input.type==="takeControl"){
        let takeover=tab.takeovers.find(x=>x.id===input.id);
        if(!takeover){requireService(tab.takeovers.length<64,"capacity");const current=await this.stub(l).controlStatus(tab.context);takeover={id:input.id,generation:current.generation+1};tab.takeovers.push(takeover);await this.put({[`tab:${tab.digest}`]:tab});}
        const status=await this.stub(l).controlStatus(tab.context);
        requireService(status.generation<takeover.generation||status.generation===takeover.generation&&status.controller,"conflict");
        if(status.generation<takeover.generation)await this.stub(l).takeControl(tab.context,takeover.generation);
        tab.context.generation=takeover.generation;await this.put({[`tab:${tab.digest}`]:tab});this.bridges.get(tab.digest)!.tab=tab;
        for(const b of this.bridges.values())if(b.tab.room===l.room){
          try{const control=await this.control(b.tab,l);await this.send(b,version({type:"control",control}));}
          catch{
            // A peer's expired lease or failed transport cannot become the
            // initiating guest's authentication result after a committed takeover.
            this.close(b);const peer=this.get<Tab>(`tab:${b.tab.digest}`);if(peer){peer.detach=true;
              await this.put({[`tab:${peer.digest}`]:peer});await this.ctx.storage.setAlarm(Date.now()+1000);
              try{await this.detach(peer);}catch{/* durable retry */}}
          }
        }
        return this.json(version({type:"control",control:await this.control(tab,l)}));
      }
      requireService(input.type==="command","invalid");if(input.type!=="command")throw new ServiceError("invalid");
      const a=input.action;const action=a.type==="move"?{type:"move" as const,actor:tab.context.seat,move:{from:a.from,to:a.to}}:{type:a.type,actor:tab.context.seat};
      const result=await this.stub(l).commandOutcome(tab.context,{id:input.id,expectedCommand:input.expectedCommand,action});
      if(!result.ok)throw new ServiceError(result.code,result.ambiguous);
      return this.json(version({type:"receipt",receipt:result.receipt,admittedAt:result.admittedAt}));
    }catch(error){if(error instanceof ServiceError)throw error;
      // RPC preserves message text but custom Error properties are not guaranteed.
      // Only explicit pre-admission failures are final; everything else is ambiguous.
      const message=error instanceof Error?error.message:"";
      const code=ONLINE_ERRORS.find(code=>["invalid","unauthorized","stale","terminal","conflict","capacity"].includes(code)&&new RegExp(`(?:^|Error: )${code}(?::|$)`).test(message));
      throw new ServiceError(code??"unavailable",!code);
    }
  }
  private async upgrade(request:Request):Promise<Response>{
    requireService(request.method==="GET"&&request.headers.get("Sec-WebSocket-Protocol")===ONLINE_VERSION,"invalid");
    const auth=await this.credential(request);requireService(this.handshakes<8&&this.bridges.size<128,"capacity");this.handshakes++;
    const pair=new WebSocketPair(),[client,socket]=Object.values(pair);socket.accept();let attached=false,done=false;const deadline=Date.now()+5000;
    const live=()=>{requireService(!done&&Date.now()<deadline&&socket.readyState===1,"unauthorized");this.valid(auth.digest);};
    const finish=()=>{if(!done){done=true;this.handshakes--;clearTimeout(timer);}};
    const timer=setTimeout(()=>{finish();socket.close(1008,"authentication deadline");},5000);
    socket.addEventListener("close",finish);socket.addEventListener("error",finish);
    socket.addEventListener("message",event=>{if(attached||done){socket.close(1008,"output only");return;}attached=true;
      void this.enqueue(async()=>{
        live();
        requireService(typeof event.data==="string"&&new TextEncoder().encode(event.data).length<=512,"invalid");const data=JSON.parse(event.data as string) as Record<string,unknown>;
        requireService(equalCanonical(Object.keys(data).sort(),["proof","room","type","version"]),"invalid");requireService(data.version===ONLINE_VERSION&&data.type==="attach"&&typeof data.room==="string","invalid");
        const c=this.valid(auth.digest),l=this.member(data.room as string,c.principal),tab=await this.tab(data.proof as string,c,l.room);
        requireService(l.phase==="started","unavailable");
        const old=this.bridges.get(tab.digest);if(old){this.close(old);await this.stub(l).detach(old.tab.context);}
        const status=await this.stub(l).controlStatus(tab.context);live();tab.context.generation=status.generation;await this.put({[`tab:${tab.digest}`]:tab});live();
        const b:Bridge={tab,credentialDigest:auth.digest,socket,upstream:null};this.bridges.set(tab.digest,b);
        const disconnect=()=>{if(this.bridges.get(tab.digest)!==b)return;this.close(b);void this.enqueue(async()=>{
          if(this.bridges.has(tab.digest))return;const latest=this.get<Tab>(`tab:${tab.digest}`);if(!latest)return;
          latest.detach=true;await this.put({[`tab:${latest.digest}`]:latest});await this.ctx.storage.setAlarm(Date.now()+1000);await this.detach(latest);
        }).catch(()=>undefined);};
        socket.addEventListener("close",disconnect);socket.addEventListener("error",disconnect);
        const response=await this.stub(l).fetch(new Request("https://room.internal/attach",{headers:{Upgrade:"websocket","X-Li4chess-Internal-Context":JSON.stringify(tab.context)}}));
        requireService(response.webSocket,"unavailable");b.upstream=response.webSocket!;b.upstream.accept();
        try{live();}catch(error){disconnect();throw error;}
        let publications=Promise.resolve();
        b.upstream.addEventListener("message",event=>{publications=publications.then(async()=>{const pub=JSON.parse(event.data as string) as Publication;
          if(pub.type==="resyncRequired"&&pub.suspension)await this.send(b,version({type:"suspended",suspension:pub.suspension}));
          await this.send(b,pub.type==="resyncRequired"?version({type:"resyncRequired"}):this.snapshot(pub.snapshot));
          if(pub.type==="resyncRequired")disconnect();}).catch(disconnect);});
        const upstreamEnded=()=>{publications=publications.then(()=>this.send(b,version({type:"resyncRequired"}))).catch(()=>undefined).finally(disconnect);};
        b.upstream.addEventListener("close",upstreamEnded);
        b.upstream.addEventListener("error",upstreamEnded);
        finish();await this.send(b,version({type:"control",control:await this.control(tab,l)}));await this.send(b,this.snapshot(await this.stub(l).read(tab.context,0) as unknown as Snapshot));
      }).catch(()=>{finish();const b=[...this.bridges.values()].find(b=>b.socket===socket);if(b){this.close(b);void this.enqueue(async()=>{
        if(this.bridges.has(b.tab.digest))return;b.tab.detach=true;await this.put({[`tab:${b.tab.digest}`]:b.tab});await this.ctx.storage.setAlarm(Date.now()+1000);await this.detach(b.tab);
      }).catch(()=>undefined);}try{socket.send(JSON.stringify(version({type:"resyncRequired"})));socket.close(1008,"authentication failed");}catch{/*closed*/}});
    });
    return new Response(null,{status:101,webSocket:client,headers:{"Sec-WebSocket-Protocol":ONLINE_VERSION}});
  }
}
