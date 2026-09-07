import { isSquareOnBoard } from "@li4chess/engine";
import type { RulesetStateV2, EngineBuildIdentityV1 } from "./types.js";
import { object, requireValue as check, validateBuild, validateHash, validateState } from "./validation.js";
import { stateHash } from "./replay.js";

export const ONLINE_VERSION = "li4chess-online-v1" as const;
export const ONLINE_LIMITS = { requestBytes: 4096, snapshotBytes: 600_000, command: 2048, id: 128 } as const;
export type Intention = { type: "move"; from: number; to: number } | { type: "resign" | "claimWin" };
export type OnlineRequest = { version: typeof ONLINE_VERSION } & (
  { type: "session" | "issue" | "rotate" | "revoke" } |
  { type: "create"; id: string } | { type: "join"; invitation: string } |
  { type: "lobby" | "connection" | "retire"; room: string } |
  { type: "seat"; room: string; seat: number } | { type: "ready"; room: string; ready: boolean } |
  { type: "command"; room: string; id: string; expectedCommand: number; action: Intention } |
  { type: "takeControl"; room: string; id: string } | { type: "resync"; room: string; expectedCommand: number });
export interface OnlineReceipt { id: string; commandHash: string; sequence: number; firstEvent: number; lastEvent: number; stateHash: string; commitHash: string }
export interface OnlineTiming {
  format: "li4chess-room-clock-v1"; revision: number; phase: "running" | "suspended" | "terminal" | "incident";
  remainingMs: [number, number, number, number]; disconnectRemainingMs: [number, number, number, number];
  connected: [boolean, boolean, boolean, boolean]; activeSeat: number | null; activatedAt: number | null;
  deadline: number | null; accountedAt: number; policy: { initialMs: number; incrementMs: number; increment: "after-move" };
  previousResume: { revision: number; at: number; reason: "creation" | "commit" | "recovery" } | null;
  suspendedAt: number | null; backwards: boolean; command: number;
  incident: { reason: string; firstAt: number; attempts: number; retryAt: number | null } | null;
}
export interface OnlineSnapshot { gameId: string; command: number; event: number; stateHash: string; chainHash: string;
  state: RulesetStateV2; timing: OnlineTiming; producer: EngineBuildIdentityV1; sourceReplayHash: string | null; serverTime: number }
export interface OnlineControl { seat: number; generation: number; controller: boolean }
export interface OnlineSuspension { command:number; stateHash:string; timing:OnlineTiming }
export interface OnlineLobby { room: string; phase: "waiting" | "creating" | "started"; revision: number;
  seats: ({ mine: boolean; ready: boolean } | null)[]; policy: OnlineTiming["policy"] }
export const ONLINE_ERRORS = ["invalid", "unauthorized", "expired", "revoked", "conflict", "stale", "terminal", "unavailable", "capacity", "origin"] as const;
export type OnlineErrorCode = typeof ONLINE_ERRORS[number];
export type OnlineResponse = { version: typeof ONLINE_VERSION } & (
  { type: "session"; principal: string; generation: number; expiresAt: number } |
  { type: "revoked" } | { type: "lobby"; lobby: OnlineLobby } |
  { type: "created"; lobby: OnlineLobby; invitation: string } |
  { type: "connection"; proof: string; control: OnlineControl } |
  { type: "control"; control: OnlineControl } |
  { type: "snapshot"; snapshot: OnlineSnapshot } |
  { type: "suspended"; suspension: OnlineSuspension } |
  { type: "receipt"; receipt: OnlineReceipt; admittedAt: number } |
  { type: "error"; code: OnlineErrorCode; ambiguous: boolean } |
  { type: "resyncRequired" } );
export const wireInteger = (v: unknown, max = Number.MAX_SAFE_INTEGER): void => { check(Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= max, "wire integer"); };
export const wireId = (v: unknown): void => { check(typeof v === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v), "wire id"); };
export const wireProof = (v: unknown): void => { check(typeof v === "string" && /^[0-9a-f]{64}$/.test(v), "wire proof"); };
const bool = (v: unknown) => check(typeof v === "boolean", "wire boolean");
const bytes = (v: unknown, max: number) => check(new TextEncoder().encode(JSON.stringify(v)).length <= max, "wire size");
const envelope = (v: unknown, keys: string[]) => { const r = object(v, ["version", "type", ...keys]); check(r.version === ONLINE_VERSION, "wire version"); return r; };
export function validateIntention(value: unknown): asserts value is Intention {
  const a = value as Intention; check(a && typeof a === "object", "intention");
  if (a.type === "move") { object(a, ["type", "from", "to"]); wireInteger(a.from,195); wireInteger(a.to,195); check(isSquareOnBoard(a.from) && isSquareOnBoard(a.to) && a.from !== a.to, "move squares"); }
  else { object(a,["type"]); check(a.type === "resign" || a.type === "claimWin", "player action"); }
}
export function parseOnlineRequest(value: unknown): OnlineRequest {
  bytes(value, ONLINE_LIMITS.requestBytes); const r = value as OnlineRequest;
  check(r && typeof r === "object", "request");
  const keys: Record<OnlineRequest["type"], string[]> = { session: [], issue: [], rotate: [], revoke: [], create: ["id"], join: ["invitation"],
    lobby: ["room"], connection: ["room"], retire: ["room"], seat: ["room","seat"], ready: ["room","ready"], command: ["room","id","expectedCommand","action"],
    takeControl: ["room","id"], resync: ["room","expectedCommand"] };
  check(Object.hasOwn(keys,r.type), "request type"); envelope(r,keys[r.type]);
  if ("room" in r) wireId(r.room);
  if ("id" in r) { wireId(r.id); check(!r.id.startsWith("server:"), "reserved id"); }
  if (r.type === "join") wireProof(r.invitation);
  if (r.type === "seat") wireInteger(r.seat,3);
  if (r.type === "ready") bool(r.ready);
  if ("expectedCommand" in r) wireInteger(r.expectedCommand, r.type === "command" ? 2047 : 2048);
  if (r.type === "command") validateIntention(r.action);
  return r;
}
export function validateOnlineTiming(v: unknown): asserts v is OnlineTiming {
  const t = v as OnlineTiming;
  object(t,["format","revision","phase","remainingMs","disconnectRemainingMs","connected","activeSeat","activatedAt","deadline","accountedAt","policy","previousResume","suspendedAt","backwards","command","incident"]);
  check(t.format === "li4chess-room-clock-v1" && ["running","suspended","terminal","incident"].includes(t.phase), "timing version/phase");
  for (const n of [t.revision,t.accountedAt]) wireInteger(n);
  wireInteger(t.command,2048); bool(t.backwards);
  for (const [values,max] of [[t.remainingMs,177033600000],[t.disconnectRemainingMs,60000]] as const) {
    check(Array.isArray(values) && values.length === 4 && Object.keys(values).length === 4,"timing seats"); values.forEach(n=>wireInteger(n,max));
  }
  check(Array.isArray(t.connected) && t.connected.length === 4 && Object.keys(t.connected).length === 4,"presence"); t.connected.forEach(bool);
  if (t.activeSeat !== null) wireInteger(t.activeSeat,3);
  for (const n of [t.activatedAt,t.deadline,t.suspendedAt]) if(n!==null) wireInteger(n);
  object(t.policy,["initialMs","incrementMs","increment"]); wireInteger(t.policy.initialMs,86400000); wireInteger(t.policy.incrementMs,86400000);
  check(t.policy.initialMs>0 && t.policy.increment === "after-move","policy");
  if(t.previousResume!==null) { object(t.previousResume,["revision","at","reason"]); wireInteger(t.previousResume.revision); wireInteger(t.previousResume.at); check(["creation","commit","recovery"].includes(t.previousResume.reason),"resume"); }
  if(t.incident!==null) { object(t.incident,["reason","firstAt","attempts","retryAt"]); check(typeof t.incident.reason === "string" && t.incident.reason.length<=512,"incident"); wireInteger(t.incident.firstAt); wireInteger(t.incident.attempts); if(t.incident.retryAt!==null) wireInteger(t.incident.retryAt); }
}
function control(v: OnlineControl) { object(v,["seat","generation","controller"]); wireInteger(v.seat,3); wireInteger(v.generation); check(v.generation>0,"generation"); bool(v.controller); }
function lobby(v: OnlineLobby) {
  object(v,["room","phase","revision","seats","policy"]); wireId(v.room); wireInteger(v.revision); check(["waiting","creating","started"].includes(v.phase),"lobby phase");
  check(Array.isArray(v.seats)&&v.seats.length===4,"lobby seats"); for(const s of v.seats) if(s!==null){object(s,["mine","ready"]);bool(s.mine);bool(s.ready);}
  object(v.policy,["initialMs","incrementMs","increment"]);wireInteger(v.policy.initialMs,86400000);wireInteger(v.policy.incrementMs,86400000);check(v.policy.initialMs>0&&v.policy.increment==="after-move","policy");
}
export async function parseOnlineResponse(value: unknown): Promise<OnlineResponse> {
  bytes(value,ONLINE_LIMITS.snapshotBytes); const r=value as OnlineResponse; check(r&&typeof r==="object","response");
  switch(r.type){
    case "session": envelope(r,["principal","generation","expiresAt"]);wireId(r.principal);wireInteger(r.generation);check(r.generation>0,"session generation");wireInteger(r.expiresAt);break;
    case "revoked": case "resyncRequired": envelope(r,[]);break;
    case "created": envelope(r,["lobby","invitation"]);lobby(r.lobby);wireProof(r.invitation);break;
    case "lobby": envelope(r,["lobby"]);lobby(r.lobby);break;
    case "connection": envelope(r,["proof","control"]);wireProof(r.proof);control(r.control);break;
    case "control": envelope(r,["control"]);control(r.control);break;
    case "suspended": envelope(r,["suspension"]);object(r.suspension,["command","stateHash","timing"]);wireInteger(r.suspension.command,2048);validateHash(r.suspension.stateHash);validateOnlineTiming(r.suspension.timing);
      check(r.suspension.command===r.suspension.timing.command&&["suspended","incident"].includes(r.suspension.timing.phase),"suspended boundary");break;
    case "error": envelope(r,["code","ambiguous"]);check(ONLINE_ERRORS.includes(r.code),"error code");bool(r.ambiguous);break;
    case "receipt": {
      envelope(r,["receipt","admittedAt"]);wireInteger(r.admittedAt);const x=r.receipt;
      object(x,["id","commandHash","sequence","firstEvent","lastEvent","stateHash","commitHash"]);wireId(x.id);
      for(const h of [x.commandHash,x.stateHash,x.commitHash])validateHash(h);
      wireInteger(x.sequence,2048);wireInteger(x.firstEvent);wireInteger(x.lastEvent);check(x.sequence>0&&x.firstEvent>0&&x.lastEvent>=x.firstEvent,"receipt range");break;
    }
    case "snapshot": {
      envelope(r,["snapshot"]);const s=r.snapshot;object(s,["gameId","command","event","stateHash","chainHash","state","timing","producer","sourceReplayHash","serverTime"]);
      wireId(s.gameId);wireInteger(s.command,2048);wireInteger(s.event);wireInteger(s.serverTime);validateHash(s.stateHash);validateHash(s.chainHash);
      validateState(s.state);validateBuild(s.producer);if(s.sourceReplayHash!==null)validateHash(s.sourceReplayHash);validateOnlineTiming(s.timing);
      check(s.command===s.timing.command&&s.event===s.state.sequence&&s.state.pendingEffects.length===0,"complete boundary");
      check(await stateHash(s.state)===s.stateHash,"snapshot hash");break;
    }
    default: throw new Error("Unknown online response");
  } return r;
}
