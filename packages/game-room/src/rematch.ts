import { equalCanonical, REMATCH_LIMITS } from "@li4chess/protocol";
import type { OnlineRematch, RematchMutation, RematchReceipt } from "@li4chess/protocol";

/** Lobby metadata only. GuestService owns authentication, admission and atomic
 * persistence; this reducer never writes a game's canonical history. */
export interface RematchRecord {
  revision: number;
  proposals: { phase: Exclude<OnlineRematch["phase"], "none">; expiresAt: number; consents: boolean[]; successor: string | null }[];
  receipts: { principal: string; request: RematchMutation; receipt: RematchReceipt }[];
}
export class RematchError extends Error {
  constructor(readonly code: "conflict" | "stale" | "capacity") { super(code); }
}
export const emptyRematch = (): RematchRecord => ({ revision: 0, proposals: [], receipts: [] });
export function settleRematch(record: RematchRecord, now: number, allPresent: boolean): RematchRecord {
  const next = structuredClone(record), proposal = next.proposals.at(-1);
  if (proposal?.phase === "pending" && (now >= proposal.expiresAt || !allPresent)) {
    proposal.phase = now >= proposal.expiresAt ? "expired" : "participantUnavailable";
    next.revision++;
  }
  return next;
}
export function rematchView(record: RematchRecord, room: string, seat: number): OnlineRematch {
  const p = record.proposals.at(-1);
  return { room, seat, revision: record.revision, proposal: record.proposals.length, phase: p?.phase ?? "none",
    expiresAt: p?.expiresAt ?? null, consents: p ? [...p.consents] : [false,false,false,false], successor: p?.successor ?? null };
}
export function rematchReceipt(record: RematchRecord, principal: string, request: RematchMutation): RematchReceipt | null {
  const old = record.receipts.find(r => r.principal === principal && r.request.id === request.id);
  if (old && !equalCanonical(old.request, request)) throw new RematchError("conflict");
  return old?.receipt ?? null;
}
/** Call after fresh eligibility/credential checks. The returned fourth-consent
 * record MUST be persisted in the same transaction as its successor lobby. */
export function mutateRematch(record: RematchRecord, principal: string, seat: number, request: RematchMutation,
  now: number, successor: string): { record: RematchRecord; receipt: RematchReceipt; allocated: boolean } {
  if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new RematchError("conflict");
  const old = rematchReceipt(record, principal, request);
  if (old) return { record, receipt: old, allocated: false };
  if (request.expectedRevision !== record.revision) throw new RematchError("stale");
  const next = structuredClone(record); let p = next.proposals.at(-1);
  const limit = request.type === "rematchDecline" ? REMATCH_LIMITS.receipts : REMATCH_LIMITS.ordinaryReceipts;
  if (next.receipts.length >= limit) throw new RematchError("capacity");
  let outcome: RematchReceipt["outcome"], allocated = false;
  if (request.type === "rematchPropose") {
    if (p?.phase === "pending" || p?.phase === "created") throw new RematchError("conflict");
    if (next.proposals.length >= REMATCH_LIMITS.proposals) throw new RematchError("capacity");
    p = { phase: "pending", expiresAt: now + REMATCH_LIMITS.lifetimeMs, consents: [false,false,false,false], successor: null };
    next.proposals.push(p); outcome = "proposed";
  } else {
    if (request.proposal !== next.proposals.length || p?.phase !== "pending") throw new RematchError("conflict");
    if (now >= p.expiresAt) throw new RematchError("stale");
    if (request.type === "rematchDecline") { p.phase = "declined"; outcome = "declined"; }
    else {
      p.consents[seat] = true; outcome = "consented";
      if (p.consents.every(Boolean)) { p.phase = "created"; p.successor = successor; outcome = "created"; allocated = true; }
    }
  }
  next.revision++;
  const receipt = { id: request.id, revision: next.revision, outcome };
  next.receipts.push({ principal, request: structuredClone(request), receipt });
  return { record: next, receipt, allocated };
}
