import { equalCanonical, REPLAY_LIMITS, stateHash, replayJsonBytes, replayArtifactBytes } from "@li4chess/protocol";
import type { OnlineErrorCode, OnlineReplayPage, EngineBuildIdentityV1 } from "@li4chess/protocol";
import { creationBoundary, digest, PersistenceError } from "@li4chess/persistence";
import type { Boundary, D1Persistence, Head, ReaderPolicy } from "@li4chess/persistence";
import type { Creation } from "./room.js";
import type { RoomStorage } from "./storage.js";
import { validateTiming } from "./timing.js";
import type { Timing } from "./timing.js";

/** Read compatibility is established by full genesis replay, never by changing
 * the writer's exact producer policy. verifyHeader validates build/schema/rules. */
export const completedReplayReader: ReaderPolicy = {
  accepts: producer => producer.format === "li4chess-engine-build-v1" && producer.workingTree.status !== "unreproducible",
};
export interface ReplayMember { gameId: string; principal: string; generation: number; expiresAt: number }
class ReplayFailure extends Error { constructor(readonly code: OnlineErrorCode) { super(code); } }
function failureCode(error:unknown):OnlineErrorCode {
  return error instanceof ReplayFailure ? error.code : error instanceof PersistenceError ?
    error.code === "unsupported" ? "replayIncompatible" : error.code === "conflict" ? "replayMissing" :
      ["corrupt","quarantined","fenced","invalid"].includes(error.code) ? "replayIntegrity" : "unavailable" : "unavailable";
}
function check(value: unknown, code: OnlineErrorCode = "replayIntegrity"): asserts value { if (!value) throw new ReplayFailure(code); }
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2,"0")).join("");
interface Audit { member: ReplayMember; boundary: Boundary; target: Boundary; bytes: number; expires: number;
  next: string | null; previous: string | null; response: OnlineReplayPage }

/** Disposable bounded audit state. No storage writes, gameplay boot, connection
 * changes, incident clearance, clock accounting, or durable export history. */
export class CompletedReplay {
  private audits = new Map<string, Audit>();
  constructor(private readonly storage: RoomStorage, private readonly namespace: string, private readonly objectId: string,
    private readonly owns: (game: string) => boolean, private readonly now: () => number) {}
  async eligibility(member: ReplayMember, db: D1Persistence) {
    try {
      const boundary = await this.fence(member, db);
      const identity = this.storage.read<Creation>("identity")!;
      const timing = this.storage.read<{value: Timing}>("timing")!.value;
      check(equalCanonical(identity.policy, timing.policy));
      check(identity.seats.length === 4 && new Set(identity.seats.map(s => s.principal)).size === 4);
      return { ok: true as const, snapshot: { boundary, timing }, principals: identity.seats.map(s => s.principal),
        policy: identity.policy, seed: boundary.header.replay.initialState.position.randomSeed };
    } catch (error) { return { ok: false as const, code: failureCode(error) }; }
  }
  async status(member: ReplayMember, db: D1Persistence, producer: EngineBuildIdentityV1) {
    try {
    const id=this.storage.read<Creation>("identity");
    check(id,"replayMissing");check(id.header.gameId===member.gameId&&id.seats.some(s=>s.principal===member.principal),"unauthorized");
    if(equalCanonical(id.header.replay.engineBuild,producer))return {ok:true as const,snapshot:null};
    const boundary=await this.fence(member,db);
    return {ok:true as const,snapshot:{boundary,timing:this.storage.read<{value:Timing}>("timing")!.value}};
    }catch(error){return {ok:false as const,code:failureCode(error)};}
  }
  private async fence(member: ReplayMember, db: D1Persistence): Promise<Boundary> {
    check(member.expiresAt > this.now(), "expired");
    const id = this.storage.read<Creation & {format: string; objectId: string}>("identity");
    check(id, "replayMissing");
    check(id.header.gameId === member.gameId && id.seats.some(s => s.principal === member.principal), "unauthorized");
    check(id.format === "li4chess-room-v1" && id.objectId === this.objectId && this.owns(member.gameId) && id.owner.namespace === this.namespace);
    check(!this.storage.read("incident") && !this.storage.read("pending") && !this.storage.read("creating"), "unavailable");
    const primary = await db.inspect(member.gameId); check(primary, "replayMissing");
    check(equalCanonical(primary.owner,id.owner) && primary.headerHash === await digest(id.header));
    const canonical = await db.recover(member.gameId);
    check(equalCanonical(canonical.head,primary.head));
    check(canonical.state.position.result !== null, "replayIncomplete");
    const marker = this.storage.read<Head>("marker"), cache = this.storage.read<Boundary>("cache");
    const clock = this.storage.read<{value: Timing; hash: string}>("timing");
    check(marker && cache && clock, "unavailable");
    validateTiming(clock.value);
    check(await digest(clock.value) === clock.hash && clock.value.command === primary.head.command);
    check(clock.value.phase === "terminal","unavailable");
    check(clock.value.incident === null,"unavailable");
    check(equalCanonical(marker,primary.head) && equalCanonical(cache,canonical) && await stateHash(cache.state) === primary.head.stateHash);
    check(member.expiresAt > this.now(), "expired");
    return canonical;
  }
  async page(member: ReplayMember, cursor: string | null, db: D1Persistence): Promise<
    {ok:true;page:OnlineReplayPage} | {ok:false;code:OnlineErrorCode}> {
    try {
      for (const [key,a] of this.audits) if (a.expires <= this.now()) this.audits.delete(key);
      const target = await this.fence(member,db);
      const key = member.principal;
      if (cursor === null) {
        check(this.audits.has(key) || this.audits.size < REPLAY_LIMITS.readers, "capacity");
        const boundary = await creationBoundary(target.header,completedReplayReader);
        const next = target.head.command === 0 ? null : token();
        const response: OnlineReplayPage = {room:member.gameId,principal:member.principal,generation:member.generation,
          head:target.head,command:0,header:target.header.replay,events:[],next};
        this.audits.set(key,{member:{...member},boundary,target,bytes:0,expires:this.now()+REPLAY_LIMITS.cursorMs,next,previous:null,response});
        return {ok:true,page:response};
      }
      const audit = this.audits.get(key);
      check(audit && audit.member.gameId === member.gameId && audit.member.generation === member.generation, "replayRestart");
      check(equalCanonical(audit.target,target));
      if (cursor === audit.previous) return {ok:true,page:audit.response};
      check(cursor === audit.next, "replayRestart");
      const page = await db.readAuditPage(audit.boundary,target.head.command,1);
      const size = audit.bytes + page.events.reduce((n,event) => n + replayJsonBytes(event),0);
      check(replayArtifactBytes(target.header.replay,{stateSchemaId:target.state.stateSchemaId,rulesetId:target.state.rulesetId,result:target.state.position.result!},
        page.boundary.head.event,size) <= REPLAY_LIMITS.bytes, "replayLimit");
      const done = page.boundary.head.command === target.head.command;
      if (done) check(equalCanonical(page.boundary,target));
      // Recheck both stores after awaited reconstruction, even on the final page.
      check(equalCanonical(await this.fence(member,db),target));
      const response: OnlineReplayPage = {room:member.gameId,principal:member.principal,generation:member.generation,
        head:target.head,command:page.boundary.head.command,header:null,events:page.events,next:done?null:token()};
      this.audits.set(key,{...audit,boundary:page.boundary,bytes:size,previous:cursor,next:response.next,response});
      return {ok:true,page:response};
    } catch(error) {
      return {ok:false,code:failureCode(error)};
    }
  }
}
