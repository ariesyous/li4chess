import { ALL_COLORS, advanceWalkingKing, applyMoveRequest, assertLocalMigrationState, claimWin, createInitialState,
  disconnectForfeitPlayer, resignPlayer, timeoutPlayer } from "@li4chess/engine";
import type { GameState } from "@li4chess/engine";
import { canonicalJson, equalCanonical, sha256 } from "./canonical.js";
import { MODERN_SETUP, STANDARD_RULESET, STATE_SCHEMA } from "./types.js";
import type { ActionRequest, EngineBuildIdentityV1, ReplayAction, ReplayEffect, ReplayEnvelopeV2,
  ReplayEventV2, RulesetResultV2, RulesetStateV2 } from "./types.js";
import { object, requireValue, validateBuild, validateHash, validateState } from "./validation.js";

export function projectState(state: GameState): RulesetStateV2 {
  assertLocalMigrationState(state);
  const { rulesetId: _marker, ...position } = structuredClone(state);
  const projected: RulesetStateV2 = { stateSchemaId: STATE_SCHEMA, rulesetId: STANDARD_RULESET,
    setupId: MODERN_SETUP, sequence: 0, position, pendingEffects: [] };
  validateState(projected);
  return projected;
}
export function engineState(state: RulesetStateV2): GameState {
  validateState(state);
  return structuredClone({ ...state.position, rulesetId: STANDARD_RULESET });
}
function resultProjection(state: RulesetStateV2): RulesetResultV2 | null {
  return state.position.result === null ? null : { stateSchemaId: STATE_SCHEMA, rulesetId: STANDARD_RULESET, result: state.position.result };
}
function normalizedPosition(position: RulesetStateV2["position"]): RulesetStateV2["position"] {
  return { ...position, enPassantRights: position.enPassantRights.map(ep => ({ ...ep, eligiblePlayers: [...ep.eligiblePlayers].sort((a,b) => a-b) }))
    .sort((a,b) => a.pawnSquare-b.pawnSquare || a.target-b.target || a.pawnOwner-b.pawnOwner) };
}
export function canonicalState(state: RulesetStateV2): string {
  return canonicalJson({ ...state, position: normalizedPosition(state.position) });
}
export async function stateHash(state: RulesetStateV2): Promise<string> { return sha256(canonicalState(state)); }

/** Authoring input is an intention. Stored events always contain reducer metadata. */
export function resolveAction(before: GameState, request: ActionRequest): { action: ReplayAction; after: GameState } {
  requireValue(!before.result && ALL_COLORS.includes(request.actor), "action actor/terminal state");
  let after: GameState;
  switch (request.type) {
    case "move":
      requireValue(before.turn === request.actor && before.players[request.actor].status === "active", "move actor");
      after = applyMoveRequest(before, request.move);
      return { action: { type: "move", actor: request.actor, move: after.moveHistory.at(-1)! }, after };
    case "randomKingMove": {
      requireValue(before.turn === request.actor, "random actor");
      after = advanceWalkingKing(before);
      const recorded = after.randomActions.at(-1)!;
      // Recorded selection.move is the legal candidate; history includes resolved checks/eliminations.
      return { action: { type: "randomKingMove", actor: request.actor, causeSequence: recorded.causeSequence,
        move: after.moveHistory.at(-1)!, selection: recorded.selection }, after };
    }
    case "resign": after = resignPlayer(before, request.actor); break;
    case "timeout": after = timeoutPlayer(before, request.actor, request.clock); break;
    case "disconnectForfeit": after = disconnectForfeitPlayer(before, request.actor, request.disconnect); break;
    case "claimWin": after = claimWin(before, request.actor); break;
    default: throw new Error("Unknown replay action");
  }
  // Exact fact shapes are checked against a canonical action on read.
  const action: ReplayAction = request.type === "timeout" ? { type: "timeout", actor: request.actor, clock: { remainingMs: 0 } } :
    request.type === "disconnectForfeit" ? { type: "disconnectForfeit", actor: request.actor,
      disconnect: { bankMs: 60000, cumulativeDisconnectedMs: request.disconnect.cumulativeDisconnectedMs, remainingMs: 0 } } :
      { type: request.type, actor: request.actor };
  return { action, after };
}

function startAction(state: RulesetStateV2, request: ActionRequest): { payload: ReplayAction; state: RulesetStateV2 } {
  const before = engineState(state);
  const { action, after } = resolveAction(before, request);
  const projected = projectState(after);
  const causeSequence = state.sequence + 1;
  const pendingEffects: ReplayEffect[] = after.awardLedger.slice(before.awardLedger.length).map(award => ({ type: "scoreAward", causeSequence, award }));
  if (after.result) pendingEffects.push({ type: after.result.reason === "abort" ? "abort" : "terminal",
    causeSequence, result: { stateSchemaId: STATE_SCHEMA, rulesetId: STANDARD_RULESET, result: after.result } });
  requireValue(after.eventSequence === before.eventSequence + 1 + pendingEffects.length, "reducer event accounting");
  const players = { ...after.players };
  for (const color of ALL_COLORS) players[color] = { ...players[color], score: before.players[color].score };
  let payload = action;
  if (action.type === "randomKingMove") {
    const { causeSequence: positionCause, ...recorded } = action;
    const offset = before.eventSequence - state.sequence;
    payload = positionCause! <= offset ? { ...recorded, checkpointCause: { positionSequence: positionCause! } } :
      { ...recorded, causeSequence: positionCause! - offset };
  }
  return { payload, state: { ...projected, setupId: state.setupId, sequence: state.sequence + 1, pendingEffects, position: { ...projected.position, players,
    eventSequence: before.eventSequence + 1, awardLedger: before.awardLedger, result: null } } };
}

function consumeEffect(state: RulesetStateV2): { payload: ReplayEffect; state: RulesetStateV2 } {
  const [payload, ...pendingEffects] = state.pendingEffects;
  requireValue(payload && !state.position.result, "expected pending effect");
  let position = { ...state.position, eventSequence: state.position.eventSequence + 1 };
  if (payload.type === "scoreAward") {
    const award = payload.award;
    requireValue(award.sequence === position.eventSequence, "effect sequence");
    const total = (Math.round(position.players[award.recipient].score * 3) + Math.round(award.delta * 3)) / 3;
    requireValue(total === award.total, "effect total");
    position = { ...position, players: { ...position.players, [award.recipient]: { ...position.players[award.recipient], score: total } },
      awardLedger: [...position.awardLedger, award] };
  } else {
    requireValue(pendingEffects.length === 0, "terminal is last effect");
    position = { ...position, result: payload.result.result };
  }
  return { payload, state: { ...state, sequence: state.sequence + 1, position, pendingEffects } };
}

async function eventFor(before: RulesetStateV2, next: ReturnType<typeof startAction> | ReturnType<typeof consumeEffect>): Promise<ReplayEventV2> {
  return { ...next.payload, sequence: next.state.sequence, positionSequence: next.state.position.eventSequence,
    stateHashBefore: await stateHash(before), stateHashAfter: await stateHash(next.state) };
}

function isModernStart(position: RulesetStateV2["position"]): boolean {
  const initial = projectState(createInitialState()).position;
  const normalize = (p: typeof position) => ({ ...p, randomSeed: "00000001",
    players: Object.fromEntries(ALL_COLORS.map(color => { const { isCPU: _cpu, cpuDifficulty: _level, ...player } = p.players[color]; return [color,player]; })) });
  return equalCanonical(normalize(initial),normalize(position));
}
async function setupFor(position: RulesetStateV2["position"]): Promise<string> {
  return isModernStart(position) ? MODERN_SETUP : `li4chess-ffa-checkpoint-v1:${await sha256(canonicalJson(normalizedPosition(position)))}`;
}

/** Checkpoint logs identify their exact initial position by content, and never
 * claim the missing history is a complete game from the Modern starting board. */
export async function createReplay(initial: GameState, engineBuild: EngineBuildIdentityV1): Promise<ReplayEnvelopeV2> {
  validateBuild(engineBuild);
  const projected = projectState(initial);
  const initialState = { ...projected, setupId: await setupFor(projected.position) };
  const hash = await stateHash(initialState);
  return { format: "li4chess-replay-v2", replaySchemaVersion: 2, rulesetId: STANDARD_RULESET, stateSchemaId: STATE_SCHEMA,
    engineBuild: structuredClone(engineBuild), game: { mode: "ffa", setupId: initialState.setupId, seatOrder: [...ALL_COLORS] },
    initialState, initialStateHash: hash, events: [], result: resultProjection(initialState), finalStateHash: hash };
}

/** Untrusted input is recomputed from its initial checkpoint. Pending queues are
 * derived from actions, never accepted from an imported checkpoint or event. */
export async function readReplay(value: unknown): Promise<{ replay: ReplayEnvelopeV2; state: RulesetStateV2 }> {
  const envelope = object(value, ["format", "replaySchemaVersion", "rulesetId", "stateSchemaId", "engineBuild", "game",
    "initialState", "initialStateHash", "events", "result", "finalStateHash"]);
  requireValue(envelope.format === "li4chess-replay-v2" && envelope.replaySchemaVersion === 2 &&
    envelope.rulesetId === STANDARD_RULESET && envelope.stateSchemaId === STATE_SCHEMA, "unsupported replay/ruleset/schema; legacy-arena-v1 needs its producing reader");
  validateBuild(envelope.engineBuild);
  const game = object(envelope.game, ["mode", "setupId", "seatOrder"], ["sourceReplayHash"]);
  if (game.sourceReplayHash !== undefined) validateHash(game.sourceReplayHash);
  requireValue(game.mode === "ffa" && equalCanonical(game.seatOrder, ALL_COLORS), "game setup/seat order");
  validateState(envelope.initialState);
  requireValue(envelope.initialState.sequence === 0 && game.setupId === envelope.initialState.setupId &&
    game.setupId === await setupFor(envelope.initialState.position), "initial setup identity/content");
  validateHash(envelope.initialStateHash); validateHash(envelope.finalStateHash);
  requireValue(await stateHash(envelope.initialState) === envelope.initialStateHash, "initial hash");
  requireValue(Array.isArray(envelope.events), "events array");
  let state = structuredClone(envelope.initialState);
  for (const raw of envelope.events) {
    requireValue(raw && typeof raw === "object", "event object");
    const { sequence, positionSequence, stateHashBefore, stateHashAfter, ...payload } = raw as ReplayEventV2;
    requireValue(sequence === state.sequence + 1 && positionSequence === state.position.eventSequence + 1 && stateHashBefore === await stateHash(state), "event sequence/before hash");
    const next = state.pendingEffects.length ? consumeEffect(state) : startAction(state, payload as ActionRequest);
    requireValue(equalCanonical(payload, next.payload), "canonical event payload/action/effect mismatch");
    requireValue(stateHashAfter === await stateHash(next.state), "event after hash");
    state = next.state;
  }
  requireValue(await stateHash(state) === envelope.finalStateHash && equalCanonical(resultProjection(state), envelope.result), "final hash/result");
  if (!state.pendingEffects.length) validateState(state);
  return { replay: structuredClone(value) as ReplayEnvelopeV2, state };
}

/** Finish any verified interrupted effect transaction, then append an action.
 * Producer identity must match; a different build cannot claim the old log. */
export async function appendReplay(replay: ReplayEnvelopeV2, request: ActionRequest | undefined,
  producer: EngineBuildIdentityV1): Promise<ReplayEnvelopeV2> {
  requireValue(equalCanonical(producer, replay.engineBuild), "producer build changed; keep the original replay read-only");
  const checked = await readReplay(replay);
  let state = checked.state;
  const events = [...checked.replay.events];
  async function drain(): Promise<void> {
    while (state.pendingEffects.length) {
      const next = consumeEffect(state); events.push(await eventFor(state, next)); state = next.state;
    }
  }
  await drain();
  if (request) { const next = startAction(state, request); events.push(await eventFor(state, next)); state = next.state; await drain(); }
  validateState(state);
  return { ...checked.replay, events, result: resultProjection(state), finalStateHash: await stateHash(state) };
}

/** Batch authoring avoids quadratic replay validation on every move. The final
 * reader still independently validates the exported log before reporting. */
export async function recordReplay(initial: GameState, requests: readonly ActionRequest[],
  producer: EngineBuildIdentityV1, sourceReplayHash?: string): Promise<ReplayEnvelopeV2> {
  if (sourceReplayHash !== undefined) validateHash(sourceReplayHash);
  const replay = await createReplay(initial, producer);
  let state = replay.initialState;
  const events: ReplayEventV2[] = [];
  for (const request of requests) {
    let next: ReturnType<typeof startAction> | ReturnType<typeof consumeEffect> = startAction(state, request);
    events.push(await eventFor(state,next)); state = next.state;
    while (state.pendingEffects.length) {
      next = consumeEffect(state); events.push(await eventFor(state,next)); state = next.state;
    }
  }
  validateState(state);
  return { ...replay, game: { ...replay.game,...(sourceReplayHash ? { sourceReplayHash } : {}) },
    events, result: resultProjection(state), finalStateHash: await stateHash(state) };
}

/** Recover the deterministic remainder for a new checkpoint, without appending
 * events under an imported producer's identity. Preserve the source file/hash. */
export async function replayCheckpoint(value: unknown): Promise<{ state: GameState; sourceReplayHash: string }> {
  const checked = await readReplay(value);
  let state = checked.state;
  while (state.pendingEffects.length) state = consumeEffect(state).state;
  return { state: engineState(state), sourceReplayHash: await sha256(canonicalJson(checked.replay)) };
}
