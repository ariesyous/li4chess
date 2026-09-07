import { canonicalJson, createReplay, engineState, equalCanonical, readReplay, recordReplayAction, sha256, stateHash } from "@li4chess/protocol";
import type { ActionRequest, EngineBuildIdentityV1, ReplayEnvelopeV2, ReplayEventV2, RulesetResultV2, RulesetStateV2 } from "@li4chess/protocol";

export const LIMITS = { commands: 2048, effects: 32, checkpointEvery: 16, commandPage: 8,
  eventPage: 32, stateBytes: 512_000, eventBytes: 16_000, requestBytes: 4096, batchBytes: 1_000_000 } as const;
export class PersistenceError extends Error {
  constructor(readonly code: "invalid" | "conflict" | "fenced" | "corrupt" | "unsupported" | "quarantined" | "uncertain", message: string) {
    super(`${code}: ${message}`);
  }
}
export function check(value: unknown, message: string, code: PersistenceError["code"] = "corrupt"): asserts value {
  if (!value) throw new PersistenceError(code, message);
}
export const digest = (value: unknown) => sha256(canonicalJson(value));
export function bounded(value: unknown, max: number): string {
  const json = canonicalJson(value);
  check(new TextEncoder().encode(json).length <= max, "encoded size limit", "invalid"); return json;
}
export function opaque(value: string): void { check(typeof value === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(value), "opaque ID", "invalid"); }
export interface Owner { namespace: string; generation: number }
/** Already authenticated by the future room, not a credential or authorization API.
 * A seat retry must retain its principal and control generation. Reauthentication
 * policy belongs to the caller; persistence never grants authority from these bytes. */
export type Caller = { kind: "seat"; principal: string; seat: number; generation: number }
  | { kind: "server"; principal: string };
export interface CommandInput { id: string; caller: Caller; action: ActionRequest; admittedAt: number; expectedCommand: number }
export interface Head { command: number; event: number; stateHash: string; chainHash: string }
export interface GameHeader { format: "li4chess-d1-game-v1"; gameId: string; replay: ReplayEnvelopeV2 }
export interface Boundary { header: GameHeader; headerHash: string; head: Head; state: RulesetStateV2 }
export interface CommandRecord {
  format: "li4chess-d1-command-v1"; gameId: string; headerHash: string; owner: Owner;
  input: CommandInput; commandHash: string; expected: Head; sequence: number;
  firstEvent: number; lastEvent: number; afterHash: string;
  checkpointHash: string | null; resultHash: string | null;
}
export interface Receipt { id: string; commandHash: string; sequence: number; firstEvent: number;
  lastEvent: number; stateHash: string; commitHash: string }
/** Durable prepare DTO. Only trusted room code may author it; never accept from a
 * network caller. Persist this entire object before commit; do not recreate it. */
export interface Prepared { record: CommandRecord; events: readonly ReplayEventV2[]; receipt: Receipt; finalState: RulesetStateV2;
  checkpoint: RulesetStateV2 | null; result: RulesetResultV2 | null }
export interface ReaderPolicy { accepts(producer: EngineBuildIdentityV1): boolean }
export const exactReader = (producer: EngineBuildIdentityV1): ReaderPolicy => ({ accepts: candidate => equalCanonical(candidate, producer) });

export function validateInput(input: CommandInput): void {
  opaque(input.id); opaque(input.caller.principal);
  check(Number.isSafeInteger(input.admittedAt) && input.admittedAt >= 0, "admission time", "invalid");
  check(Number.isSafeInteger(input.expectedCommand) && input.expectedCommand >= 0 && input.expectedCommand < LIMITS.commands,
    "expected command sequence", "invalid");
  const c = input.caller;
  if (c.kind === "seat") {
    check(Number.isInteger(c.seat) && c.seat >= 0 && c.seat <= 3 && Number.isSafeInteger(c.generation) && c.generation > 0 &&
      input.action.actor === c.seat && ["move", "resign", "claimWin"].includes(input.action.type), "seat intention", "invalid");
    check(equalCanonical(c, { kind: c.kind, principal: c.principal, seat: c.seat, generation: c.generation }), "caller fields", "invalid");
  } else check(c.kind === "server" && equalCanonical(c, { kind: c.kind, principal: c.principal }), "server caller", "invalid");
  check(equalCanonical(input, { id: input.id, caller: c, action: input.action, admittedAt: input.admittedAt,
    expectedCommand: input.expectedCommand }), "input fields", "invalid");
  const a = input.action;
  let action: ActionRequest;
  switch (a.type) {
    case "move": action = { type: a.type, actor: a.actor, move: { from: a.move.from, to: a.move.to,
      ...(a.move.promotion === undefined ? {} : { promotion: a.move.promotion }) } }; break;
    case "timeout": action = { type: a.type, actor: a.actor, clock: { remainingMs: 0 } }; break;
    case "disconnectForfeit": action = { type: a.type, actor: a.actor, disconnect: { bankMs: 60000,
      cumulativeDisconnectedMs: a.disconnect.cumulativeDisconnectedMs, remainingMs: 0 } }; break;
    case "randomKingMove": case "resign": case "claimWin": action = { type: a.type, actor: a.actor }; break;
    default: throw new PersistenceError("invalid", "action type");
  }
  check(equalCanonical(a, action), "action fields", "invalid"); bounded(input, LIMITS.requestBytes);
}
export function validateOwner(owner: Owner): void {
  opaque(owner.namespace); check(Number.isSafeInteger(owner.generation) && owner.generation > 0 &&
    equalCanonical(owner, { namespace: owner.namespace, generation: owner.generation }), "owner generation", "invalid");
}
export async function verifyHeader(header: GameHeader, policy: ReaderPolicy): Promise<string> {
  check(header.format === "li4chess-d1-game-v1", "game format", "unsupported"); opaque(header.gameId);
  check(equalCanonical(header, { format: header.format, gameId: header.gameId, replay: header.replay }), "header fields");
  check(policy.accepts(header.replay.engineBuild), "producer reader unavailable", "unsupported");
  check(header.replay.engineBuild.workingTree.status !== "unreproducible", "unreproducible producer", "unsupported");
  const checked = await readReplay(header.replay);
  check(!checked.replay.events.length && !checked.state.pendingEffects.length, "creation must be a complete checkpoint");
  bounded(header, LIMITS.stateBytes); return digest(header);
}
export async function prepareCommand(boundary: Boundary, owner: Owner, input: CommandInput,
  producer: EngineBuildIdentityV1): Promise<{ prepared: Prepared; next: Boundary }> {
  validateOwner(owner); validateInput(input);
  check(equalCanonical(producer, boundary.header.replay.engineBuild), "changed writer producer", "unsupported");
  check(boundary.head.command < LIMITS.commands, "game command limit", "invalid");
  check(input.expectedCommand === boundary.head.command, "expected command head", "fenced");
  check(boundary.head.event === boundary.state.sequence && boundary.head.stateHash === await stateHash(boundary.state), "prepare boundary");
  const transition = await recordReplayAction(boundary.state, input.action);
  const sequence = boundary.head.command + 1;
  const afterHash = await stateHash(transition.state);
  const checkpoint = sequence % LIMITS.checkpointEvery === 0 || transition.result ? transition.state : null;
  // State growth is bounded even on non-checkpoint commands.
  bounded(transition.state, LIMITS.stateBytes);
  const record: CommandRecord = { format: "li4chess-d1-command-v1", gameId: boundary.header.gameId,
    headerHash: boundary.headerHash, owner, input, commandHash: await digest(input), expected: boundary.head,
    sequence, firstEvent: boundary.head.event + 1, lastEvent: transition.state.sequence, afterHash,
    checkpointHash: checkpoint ? afterHash : null, resultHash: transition.result ? await digest(transition.result) : null };
  const receipt = await receiptFor(record, transition.events);
  const prepared: Prepared = structuredClone({ record, events: transition.events, receipt, finalState: transition.state, checkpoint, result: transition.result });
  await verifyPrepared(prepared);
  return { prepared, next: { ...boundary, state: transition.state,
    head: { command: sequence, event: record.lastEvent, stateHash: afterHash, chainHash: receipt.commitHash } } };
}
export async function receiptFor(record: CommandRecord, events: readonly ReplayEventV2[]): Promise<Receipt> {
  return { id: record.input.id, commandHash: record.commandHash, sequence: record.sequence,
    firstEvent: record.firstEvent, lastEvent: record.lastEvent, stateHash: record.afterHash,
    commitHash: await digest({ record, events }) };
}
export function validateRecord(r: CommandRecord): void {
  check(r.format === "li4chess-d1-command-v1", "command format", "unsupported");
  validateOwner(r.owner); validateInput(r.input); opaque(r.gameId);
  check(equalCanonical(r, { format: r.format, gameId: r.gameId, headerHash: r.headerHash, owner: r.owner,
    input: r.input, commandHash: r.commandHash, expected: r.expected, sequence: r.sequence,
    firstEvent: r.firstEvent, lastEvent: r.lastEvent, afterHash: r.afterHash,
    checkpointHash: r.checkpointHash, resultHash: r.resultHash }), "command record fields");
  check(equalCanonical(r.expected, { command: r.expected.command, event: r.expected.event,
    stateHash: r.expected.stateHash, chainHash: r.expected.chainHash }), "head fields");
  for (const seq of [r.expected.command, r.expected.event, r.sequence, r.firstEvent, r.lastEvent])
    check(Number.isSafeInteger(seq) && seq >= 0, "sequence integer");
  for (const hash of [r.headerHash, r.commandHash, r.expected.stateHash, r.expected.chainHash, r.afterHash,
    ...(r.checkpointHash === null ? [] : [r.checkpointHash]), ...(r.resultHash === null ? [] : [r.resultHash])])
    check(typeof hash === "string" && /^sha256:[a-f0-9]{64}$/.test(hash), "record hash");
  check(r.sequence === r.expected.command + 1 && r.sequence <= LIMITS.commands && r.firstEvent === r.expected.event + 1 &&
    r.lastEvent >= r.firstEvent && r.lastEvent - r.firstEvent < LIMITS.effects, "record boundary");
  check(r.input.expectedCommand === r.expected.command, "request expected head");
}
/** Integrity verification only, deliberately no engine execution during uncertain
 * write reconciliation. Legality comes from prepareCommand and reconstruction. */
export async function verifyPrepared(p: Prepared): Promise<void> {
  const r = p.record; validateRecord(r);
  check(r.format === "li4chess-d1-command-v1", "command format", "unsupported"); opaque(r.gameId);
  check(r.sequence === r.expected.command + 1 && r.sequence <= LIMITS.commands && r.firstEvent === r.expected.event + 1 &&
    p.events.length > 0 && p.events.length <= LIMITS.effects && r.lastEvent === r.firstEvent + p.events.length - 1, "command boundary");
  check(await digest(r.input) === r.commandHash && equalCanonical(p.receipt, await receiptFor(r, p.events)), "prepared digest/receipt");
  let hash = r.expected.stateHash;
  p.events.forEach((e, i) => {
    bounded(e, LIMITS.eventBytes);
    check(e.sequence === r.firstEvent + i && e.stateHashBefore === hash, "prepared event continuity");
    check(i === 0 ? !["scoreAward", "terminal", "abort"].includes(e.type) : ["scoreAward", "terminal", "abort"].includes(e.type), "one complete action");
    hash = e.stateHashAfter;
  });
  check(hash === r.afterHash, "prepared final hash");
  engineState(p.finalState);
  check(!p.finalState.pendingEffects.length && p.finalState.sequence === r.lastEvent &&
    await stateHash(p.finalState) === r.afterHash, "complete successor state");
  check(equalCanonical(p.finalState.position.result, p.result?.result ?? null), "successor result");
  if (p.checkpoint) check(equalCanonical(p.checkpoint, p.finalState), "successor checkpoint");
  check((p.checkpoint === null) === (r.checkpointHash === null) && (p.result === null) === (r.resultHash === null), "optional payload mismatch");
  if (p.checkpoint) check(!p.checkpoint.pendingEffects.length && p.checkpoint.sequence === r.lastEvent &&
    await stateHash(p.checkpoint) === r.checkpointHash && r.checkpointHash === r.afterHash, "checkpoint hash/boundary");
  check((r.sequence % LIMITS.checkpointEvery === 0 || p.result !== null) === (p.checkpoint !== null), "checkpoint cadence");
  if (p.result) check(await digest(p.result) === r.resultHash && equalCanonical(
    (p.events.at(-1) as { result?: unknown }).result, p.result), "terminal result");
  bounded(p, LIMITS.batchBytes);
}

export async function creationBoundary(header: GameHeader, policy: ReaderPolicy): Promise<Boundary> {
  const headerHash = await verifyHeader(header, policy);
  return { header, headerHash, state: header.replay.initialState, head: { command: 0, event: 0,
    stateHash: header.replay.initialStateHash, chainHash: headerHash } };
}
// Keep the existing createReplay entry available to internal creation callers.
export { createReplay };
