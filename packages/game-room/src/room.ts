import { ALL_COLORS } from "@li4chess/engine";
import type { PlayerColor } from "@li4chess/engine";
import { equalCanonical, engineState, resolveAction, stateHash } from "@li4chess/protocol";
import type { ActionRequest, EngineBuildIdentityV1, OnlineSuspension } from "@li4chess/protocol";
import { creationBoundary, digest, exactReader, LIMITS, opaque, PersistenceError, prepareCommand, validateInput, validateOwner } from "@li4chess/persistence";
import type { Boundary, D1Persistence, GameHeader, Head, Owner, Prepared, Receipt, StableRequest } from "@li4chess/persistence";
import { activate, admissionTiming, earliestDeadline, increment, initialTiming, suspend, validateTiming } from "./timing.js";
import type { Timing, TimingPolicy } from "./timing.js";
import type { RoomStorage } from "./storage.js";
import { CompletedReplay } from "./completed-replay.js";
import type { ReplayMember } from "./completed-replay.js";

export const ROOM_LIMITS = { queued: 16, connections: 8, recordBytes: 1_100_000, retryMinMs: 1000, retryMaxMs: 60000 } as const;
export class RoomError extends Error {
  constructor(readonly code: "unauthorized" | "invalid" | "stale" | "terminal" | "unavailable" | "capacity", message = code as string) { super(message); }
}
class RoomFenceError extends RoomError {}
/** Binding serialization must preserve uncertainty even if an owner fence fails
 * after canonical commit. A fence failure is never proof of rejection. */
export function commandFailure(error:unknown) {
  const code = error instanceof RoomFenceError ? "unavailable" : error instanceof RoomError ? error.code :
    error instanceof PersistenceError && ["invalid","conflict"].includes(error.code) ? error.code as "invalid" | "conflict" : "unavailable";
  return { ok:false as const, code, ambiguous:code === "unavailable" };
}
function requireRoom(value: unknown, code: RoomError["code"], message?: string): asserts value {
  if (!value) throw new RoomError(code, message);
}
export interface SeatGrant { principal: string; generation: number }
/** Supplied by a trusted credential-verifying service, never by a public body. */
export interface ConnectionContext { gameId: string; principal: string; seat: PlayerColor; connectionId: string; generation: number; expiresAt?: number }
export interface Creation { header: GameHeader; owner: Owner; seats: [SeatGrant, SeatGrant, SeatGrant, SeatGrant]; policy: TimingPolicy }
interface Identity extends Creation { format: "li4chess-room-v1"; objectId: string }
interface ClockRecord { value: Timing; hash: string }
export interface Snapshot { boundary: Boundary; timing: Timing }
export type Publication = { type: "committed"; snapshot: Snapshot; receipt: Receipt | null } | { type: "resyncRequired"; suspension?:OnlineSuspension };
/** Room owns connection membership and publication order. Adapter delivery failure
 * is ambiguous, never permission to undo canonical state or invent a new ID. */
export interface Connection { send(message: Publication): void; close(): void }
type CanonicalStore = Pick<D1Persistence, "inspect" | "create" | "recover" | "lookupReceipt" | "verifyRestore" | "reconcile" | "commit" | "quarantine">;
export interface RoomDependencies { storage: RoomStorage; canonical: CanonicalStore; objectId: string; namespace: string;
  producer: EngineBuildIdentityV1; ownsGame(gameId: string): boolean; now(): number }

/** Maintained authoritative state machine. No fetch, fixture credentials, SQL
 * administration, fault switches, guest lifecycle or public protocol in this class. */
export class Room {
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private booted = false;
  private expiring = false;
  private alarmTask: Promise<void> | null = null;
  private connections = new Map<string, { context: ConnectionContext; channel: Connection }>();
  private readonly replay: CompletedReplay;
  constructor(private readonly deps: RoomDependencies) {
    this.replay = new CompletedReplay(deps.storage,deps.namespace,deps.objectId,deps.ownsGame,deps.now);
  }
  completedReplay(member: ReplayMember, cursor: string | null, canonical: D1Persistence) {
    return this.enqueue(() => this.replay.page(member,cursor,canonical));
  }
  completedStatus(member: ReplayMember, canonical: D1Persistence) {
    return this.enqueue(() => this.replay.status(member,canonical,this.deps.producer));
  }
  private get storage() { return this.deps.storage; }
  private get db() { return this.deps.canonical; }
  private identity(): Identity { const value = this.storage.read<Identity>("identity"); requireRoom(value, "unavailable", "room not created"); return value; }
  private cache(): Boundary { const value = this.storage.read<Boundary>("cache"); requireRoom(value, "unavailable", "cache unavailable"); return value; }
  private clock(): Timing {
    const record = this.storage.read<ClockRecord>("timing"); requireRoom(record, "unavailable", "timing missing");
    validateTiming(record.value); return record.value;
  }
  private time(): number {
    const now = this.deps.now(); requireRoom(Number.isSafeInteger(now) && now >= 0 && now <= Number.MAX_SAFE_INTEGER - 200_000_000_000,
      "unavailable", "invalid server time"); return now;
  }
  private async save(values: Record<string, unknown | null>, timing: Timing, alarm?: number | null) {
    validateTiming(timing);
    let scheduled = alarm === undefined ? timing.incident?.retryAt ?? (timing.phase === "running"
      ? earliestDeadline(timing, this.cache().state.position)?.at ?? null : null) : alarm;
    for (const { context } of this.connections.values()) if (context.expiresAt !== undefined)
      scheduled = Math.min(scheduled ?? Infinity, context.expiresAt);
    await this.storage.write({ ...values, timing: { value: timing, hash: await digest(timing) } }, scheduled);
  }
  private enqueue<T>(operation: () => Promise<T>, reservedAlarm = false): Promise<T> {
    if (!reservedAlarm && this.queued >= ROOM_LIMITS.queued) return Promise.reject(new RoomError("capacity", "room queue full"));
    this.queued++;
    const task = this.tail.then(operation);
    this.tail = task.catch(() => undefined).finally(() => { this.queued--; }); return task;
  }
  private async fence(checkHead = false): Promise<void> {
    const id = this.identity();
    if (!(id.format === "li4chess-room-v1" && id.objectId === this.deps.objectId && id.owner.namespace === this.deps.namespace))
      throw new RoomFenceError("unauthorized", "room namespace/object fence");
    if (!this.deps.ownsGame(id.header.gameId)) throw new RoomFenceError("unauthorized", "game/object identity fence");
    requireRoom(equalCanonical(id.header.replay.engineBuild, this.deps.producer), "unavailable", "producer requires explicit source-linked continuation");
    const current = await this.db.inspect(id.header.gameId);
    if (!(current && equalCanonical(current.owner, id.owner) && current.headerHash === await digest(id.header))) throw new RoomFenceError("unauthorized", "canonical owner fence");
    if (checkHead && !equalCanonical(current.head, this.storage.read<Head>("marker"))) {
      await this.db.quarantine(id.header.gameId, "room-head-divergence");
      throw new PersistenceError("quarantined", "local head is not current canonical head");
    }
  }
  private authorize(context: ConnectionContext, control: boolean, requireConnection = true, allowExpired = false): void {
    const id = this.identity();
    requireRoom(context && context.gameId === id.header.gameId && ALL_COLORS.includes(context.seat), "unauthorized");
    const grant = id.seats[context.seat];
    requireRoom(grant.principal === context.principal && Number.isSafeInteger(context.generation) && context.generation > 0 &&
      (!control || context.generation === grant.generation), "unauthorized");
    opaque(context.connectionId);
    requireRoom(context.expiresAt === undefined || Number.isSafeInteger(context.expiresAt) && context.expiresAt >= 0 &&
      (allowExpired || context.expiresAt > this.time()), "unauthorized", "connection lease expired");
    if (requireConnection) {
      const connection = this.connections.get(context.connectionId);
      requireRoom(connection && equalCanonical(connection.context, context), "unauthorized", "connection not current");
    }
    if (control && requireConnection) requireRoom(this.storage.read<(string | null)[]>("controls")?.[context.seat] === context.connectionId,
      "unauthorized", "connection is observing");
  }
  /** Account credential presence at exact expiry, even for late alarms. */
  private async expireConnections(): Promise<void> {
    if (this.expiring) return;
    this.expiring = true;
    try {
    const now = this.time();
    const expired = [...this.connections.values()].filter(x => x.context.expiresAt !== undefined && x.context.expiresAt <= now)
      .sort((a,b) => a.context.expiresAt! - b.context.expiresAt!);
    for (const item of expired) {
      const deadline = earliestDeadline(this.clock(), this.cache().state.position);
      if (deadline && deadline.at <= item.context.expiresAt!) {
        await this.due(item.context.expiresAt!); return;
      }
      this.connections.delete(item.context.connectionId);
      try { item.channel.send({ type: "resyncRequired" }); item.channel.close(); } catch { /* best effort */ }
      const boundary = this.cache(); let timing = this.clock();
      const at = Math.max(timing.accountedAt, item.context.expiresAt!);
      const running = timing.phase === "running";
      if (running) timing = suspend(timing, boundary.state.position, at);
      else timing = { ...timing, revision: timing.revision + 1 };
      timing.connected[item.context.seat] = [...this.connections.values()].some(x => x.context.seat === item.context.seat);
      if (running) timing = activate(timing, boundary.state.position, at, boundary.head.command, "commit");
      await this.save({}, timing);
    }
    } finally { this.expiring = false; }
  }
  private async incident(error: unknown): Promise<void> {
    const identity=this.storage.read<Identity>("identity");
    if(identity&&!equalCanonical(identity.header.replay.engineBuild,this.deps.producer)){this.invalidateConnections();return;}
    if (this.storage.read("incident")) { this.invalidateConnections(); return; }
    const record = this.storage.read<ClockRecord>("timing");
    if (!record) { await this.storage.write({ incident: { reason: "missing-timing", at: this.time() } }, null); return; }
    let timing = record.value;
    if (timing.phase === "incident") { this.invalidateConnections(); return; }
    if (error instanceof RoomError && error.code === "unavailable" && timing.incident) {
      this.invalidateConnections(); return; // Traffic cannot extend the durable recovery backoff.
    }
    const fatal = error instanceof PersistenceError && ["corrupt", "quarantined", "unsupported", "fenced"].includes(error.code)
      || error instanceof RoomError && error.code === "unauthorized";
    const now = Math.max(this.time(), timing.accountedAt);
    // An external failure may have occurred before admission. Do not charge the
    // external wait: conservatively retain the last durable accounted balances.
    const previous = timing.incident;
    const attempts = Math.min((previous?.attempts ?? 0) + 1, 1000000);
    timing = { ...timing, phase: fatal ? "incident" : "suspended", suspendedAt: timing.suspendedAt ?? now,
      revision: timing.revision + 1, incident: { reason: error instanceof PersistenceError ? error.code : error instanceof RoomError ? error.code : "infrastructure",
        firstAt: previous?.firstAt ?? now, attempts, retryAt: fatal ? null : now + Math.min(ROOM_LIMITS.retryMaxMs, ROOM_LIMITS.retryMinMs * 2 ** Math.min(attempts - 1, 6)) } };
    await this.save({}, timing, timing.incident!.retryAt);
    this.invalidateConnections();
  }
  private invalidateConnections() {
    let suspension:OnlineSuspension|undefined;
    try {
      const timing=this.clock(),marker=this.storage.read<Head>("marker"),pending=this.storage.read<Prepared>("pending");
      if(marker && timing.command===marker.command && ["suspended","incident"].includes(timing.phase)) {
        // Pending increment belongs to an unfinalized command. Expose its persisted
        // pre-increment admission balances, never its speculative successor state.
        const admission=pending?.record.format==="li4chess-d1-command-v2"?pending.record.timing:null;
        const safe=admission?{...timing,remainingMs:[...admission.remainingMs] as Timing["remainingMs"]}:timing;
        validateTiming(safe);suspension={command:marker.command,stateHash:marker.stateHash,timing:safe};
      }
    } catch { /* Invalid/missing operational records reveal no invented timing. */ }
    for (const { channel,context } of this.connections.values()) { try {
      // Legacy internal connections retain their original control envelope.
      channel.send({ type: "resyncRequired",...(context.expiresAt!==undefined&&suspension?{suspension}: {}) }); channel.close();
    } catch { /* delivery is best effort */ } }
    this.connections.clear();
  }
  private async boot(): Promise<void> {
    if (this.booted) return;
    const existing=this.storage.read<Identity>("identity");
    requireRoom(!existing||equalCanonical(existing.header.replay.engineBuild,this.deps.producer),"unavailable","writer producer unavailable");
    this.booted = true;
    const id = this.storage.read<Identity>("identity"); if (!id || this.storage.read("incident")) return;
    const record = this.storage.read<ClockRecord>("timing");
    if (!record) { await this.incident(new RoomError("unavailable", "missing timing")); return; }
    try {
      validateTiming(record.value);
      if (record.hash !== await digest(record.value)) throw new PersistenceError("corrupt", "divergent timing hash");
      let timing = record.value;
      if (timing.phase === "incident") return;
      const now = Math.max(this.time(), timing.accountedAt);
      timing = { ...timing, connected: [false, false, false, false], phase: "suspended", suspendedAt: timing.suspendedAt ?? now,
        revision: timing.revision + 1, incident: timing.incident ?? { reason: "cold-recovery", firstAt: now, attempts: 0, retryAt: now + ROOM_LIMITS.retryMinMs } };
      await this.save({}, timing, timing.incident!.retryAt);
      await this.recover();
    } catch (error) {
      if (error instanceof PersistenceError && ["invalid", "corrupt", "unsupported"].includes(error.code)) {
        await this.storage.write({ incident: { reason: "invalid-operational-record", at: this.time() } }, null);
      } else await this.incident(error);
    }
  }
  private async recover(): Promise<void> {
    const id = this.identity(); const timing = this.clock();
    requireRoom(timing.phase !== "incident", "unavailable", "operator incident");
    const creation = this.storage.read<boolean>("creating");
    if (creation) {
      requireRoom(id.objectId === this.deps.objectId && this.deps.ownsGame(id.header.gameId) && id.owner.namespace === this.deps.namespace && equalCanonical(id.header.replay.engineBuild, this.deps.producer), "unauthorized");
      const existing = await this.db.inspect(id.header.gameId);
      if (!existing) await this.db.create(id.header, id.owner);
      else requireRoom(existing.headerHash === await digest(id.header) && equalCanonical(existing.owner, id.owner) && existing.head.command === 0,
        "unauthorized", "creation identity conflict");
      await this.fence();
      const boundary = await creationBoundary(id.header, exactReader(this.deps.producer));
      await this.save({ cache: boundary, marker: boundary.head, creating: null }, timing, this.time() + ROOM_LIMITS.retryMinMs);
      await this.resume("creation"); return;
    }
    await this.fence();
    const marker = this.storage.read<Head>("marker"); requireRoom(marker, "unavailable", "canonical marker missing");
    await this.db.verifyRestore(id.header.gameId, marker);
    const pending = this.storage.read<Prepared>("pending");
    if (pending) {
      const facts = pending.record.format === "li4chess-d1-command-v2" ? pending.record.timing : null;
      const expectedBalances = facts && [...facts.remainingMs];
      if (expectedBalances && pending.record.input.action.type === "move") expectedBalances[pending.record.input.action.actor] += facts!.policy.incrementMs;
      if (!equalCanonical(marker, pending.record.expected) || timing.command !== marker.command || !facts ||
        !equalCanonical(timing.remainingMs, expectedBalances) || !equalCanonical(timing.disconnectRemainingMs, facts.disconnectRemainingMs) ||
        !equalCanonical(timing.policy, facts.policy) || timing.accountedAt !== facts.accountedAt) {
        await this.db.quarantine(id.header.gameId, "room-timing-divergence");
        throw new PersistenceError("quarantined", "prepare/timing boundary mismatch");
      }
      await this.finish(pending); return;
    }
    const canonical = await this.db.recover(id.header.gameId);
    if (!equalCanonical(marker, canonical.head) || timing.command !== marker.command) {
      await this.db.quarantine(id.header.gameId, "room-restore-divergence");
      throw new PersistenceError("quarantined", "operational/canonical prefixes diverge");
    }
    const cached = this.storage.read<Boundary>("cache");
    if (cached && (!equalCanonical(cached, canonical) || await stateHash(cached.state) !== marker.stateHash)) {
      await this.db.quarantine(id.header.gameId, "room-cache-divergence"); throw new PersistenceError("quarantined", "cache diverges");
    }
    await this.save({ cache: canonical }, timing, this.time() + ROOM_LIMITS.retryMinMs);
    await this.resume("recovery");
  }
  private async ready(): Promise<void> {
    await this.boot();
    requireRoom(!this.storage.read("incident"), "unavailable", "operational record requires operator recovery");
    const timing = this.clock();
    if (timing.phase === "suspended") {
      requireRoom(!timing.incident?.retryAt || this.time() >= timing.incident.retryAt, "unavailable", "recovery backoff");
      await this.recover();
    }
    requireRoom(this.clock().phase !== "incident", "unavailable", "operator recovery required");
    await this.fence();
    await this.expireConnections();
  }
  private async resume(reason: "creation" | "commit" | "recovery") {
    const cache = this.cache();
    const previous = this.clock();
    const timing = activate(previous, cache.state.position, this.time(), cache.head.command, reason);
    timing.connected = ALL_COLORS.map(seat => [...this.connections.values()].some(item => item.context.seat === seat)) as Timing["connected"];
    await this.save(previous.incident ? { lastIncident: { ...previous.incident, resumedAt: timing.accountedAt, resumeRevision: timing.revision } } : {}, timing);
  }
  private async finish(prepared: Prepared): Promise<void> {
    if (await this.db.reconcile(prepared) === "absent") await this.db.commit(prepared);
    await this.fence();
    const id = this.identity();
    const boundary: Boundary = { header: id.header, headerHash: prepared.record.headerHash, state: prepared.finalState,
      head: { command: prepared.record.sequence, event: prepared.record.lastEvent, stateHash: prepared.record.afterHash, chainHash: prepared.receipt.commitHash } };
    const canonical = await this.db.inspect(id.header.gameId);
    if (!canonical || !equalCanonical(canonical.head, boundary.head)) {
      await this.db.quarantine(id.header.gameId, "room-pending-restore-divergence");
      throw new PersistenceError("quarantined", "canonical head advanced beyond pending room timing");
    }
    const timing = { ...this.clock(), command: boundary.head.command };
    await this.save({ cache: boundary, marker: boundary.head, pending: null }, timing, this.time() + ROOM_LIMITS.retryMinMs);
    await this.resume("commit");
  }
  private async accept(request: StableRequest, at: number): Promise<Receipt> {
    const boundary = this.cache();
    const timing = suspend(this.clock(), boundary.state.position, at);
    // Engine legality was checked before admission. The full deterministic action
    // is authored once here; recovery only verifies/reuses these prepared bytes.
    let prepared: Prepared;
    try {
      if (boundary.head.command >= LIMITS.commands) throw new PersistenceError("invalid", "game command limit");
      ({ prepared } = await prepareCommand(boundary, this.identity().owner,
        { ...request, admittedAt: timing.accountedAt }, this.deps.producer, admissionTiming(timing)));
    } catch (error) {
      if (error instanceof PersistenceError && /encoded size limit|game command limit/.test(error.message)) {
        const stopped: Timing = { ...this.clock(), phase: "incident", suspendedAt: timing.suspendedAt,
          revision: timing.revision, incident: { reason: "capacity", firstAt: at, attempts: 0, retryAt: null } };
        await this.save({}, stopped, null); this.invalidateConnections(); throw new RoomError("capacity", "durable game capacity reached");
      }
      throw error;
    }
    const after = increment(timing, request.action);
    try { await this.save({ pending: prepared }, after, this.time() + ROOM_LIMITS.retryMinMs); }
    catch (error) {
      if (error instanceof PersistenceError && /encoded size limit/.test(error.message)) {
        const stopped: Timing = { ...this.clock(), phase: "incident", suspendedAt: timing.suspendedAt,
          revision: timing.revision, incident: { reason: "capacity", firstAt: at, attempts: 0, retryAt: null } };
        await this.save({}, stopped, null); this.invalidateConnections(); throw new RoomError("capacity", "durable room capacity reached");
      }
      throw error;
    }
    await this.finish(prepared);
    await this.publish(prepared.receipt);
    return prepared.receipt;
  }
  private async due(at = this.time()): Promise<boolean> {
    const cache = this.cache(); const timing = this.clock();
    const deadline = earliestDeadline(timing, cache.state.position);
    if (!deadline || deadline.at > Math.max(at, timing.accountedAt)) return false;
    const action: ActionRequest = deadline.kind === "timeout" ? { type: "timeout", actor: deadline.seat, clock: { remainingMs: 0 } }
      : deadline.kind === "disconnectForfeit" ? { type: "disconnectForfeit", actor: deadline.seat,
        disconnect: { bankMs: 60000, cumulativeDisconnectedMs: 60000, remainingMs: 0 } }
      : { type: "randomKingMove", actor: deadline.seat };
    await this.accept({ id: `server:${cache.head.command + 1}:${deadline.kind}:${deadline.seat}`, expectedCommand: cache.head.command,
      caller: { kind: "server", principal: this.deps.namespace }, action }, deadline.at);
    return true;
  }
  private async publish(receipt: Receipt | null) {
    await this.expireConnections();
    await this.fence(true);
    let snapshot = this.snapshot();
    // Each failed terminal round removes a connection, so at most eight pruning
    // rounds plus one corrected publication are possible. No gameplay retry.
    for(let round=0;round<=ROOM_LIMITS.connections;round++){
    let terminalDeliveryLost = false;
    for (const [id, item] of this.connections) {
      if (item.context.expiresAt !== undefined && item.context.expiresAt <= this.time()) continue;
      try { item.channel.send({ type: "committed", snapshot: structuredClone(snapshot), receipt }); }
      catch { this.connections.delete(id); try { item.channel.close(); } catch { /* best effort */ }
        if(snapshot.boundary.state.position.result!==null){terminalDeliveryLost=true;continue;}
        throw new RoomError("unavailable", "publication failed; resync required"); }
    }
    if(terminalDeliveryLost){
      const timing=this.clock();
      await this.save({}, {...timing,revision:timing.revision+1,
        connected:ALL_COLORS.map(seat=>[...this.connections.values()].some(item=>item.context.seat===seat)) as Timing["connected"]});
      snapshot=this.snapshot();
    }else return;
    }
    throw new RoomError("unavailable","terminal publication bound");
  }
  private snapshot(): Snapshot {
    const timing = this.clock(); requireRoom(["running", "terminal"].includes(timing.phase), "unavailable");
    requireRoom(!this.storage.read("pending") && !this.storage.read("creating"), "unavailable");
    return { boundary: this.cache(), timing };
  }
  create(creation: Creation): Promise<Snapshot> {
    creation = structuredClone(creation);
    return this.enqueue(async () => {
      await this.boot(); validateOwner(creation.owner);
      requireRoom(!this.storage.read("incident"), "unavailable", "operator recovery required");
      requireRoom(this.deps.ownsGame(creation.header.gameId), "unauthorized", "game/object identity fence");
      requireRoom(creation.owner.namespace === this.deps.namespace && equalCanonical(creation.header.replay.engineBuild, this.deps.producer), "unauthorized");
      requireRoom(creation.seats.length === 4 && new Set(creation.seats.map(s => s.principal)).size === 4, "invalid");
      for (const seat of creation.seats) { opaque(seat.principal); requireRoom(Number.isSafeInteger(seat.generation) && seat.generation > 0, "invalid"); }
      const identity: Identity = { ...structuredClone(creation), format: "li4chess-room-v1", objectId: this.deps.objectId };
      const prior = this.storage.read<Identity>("identity");
      requireRoom(!prior || equalCanonical(prior, identity), "invalid", "room identity immutable");
      try {
        if (!prior) {
          await creationBoundary(creation.header, exactReader(this.deps.producer));
          // Existing D1 without a local creation intent means operational state
          // was lost. Recreating initial balances here would replenish clocks.
          if (await this.db.inspect(creation.header.gameId)) {
            await this.storage.write({ incident: { reason: "canonical-game-without-local-intent", at: this.time() } }, null);
            throw new RoomError("unavailable", "canonical game requires preserved operational state");
          }
          const timing = initialTiming(creation.policy, this.time());
          await this.save({ identity, creating: true, controls: [null, null, null, null] }, timing, this.time() + ROOM_LIMITS.retryMinMs);
          await this.recover();
        } else await this.ready();
        await this.fence(true);
        return this.snapshot();
      } catch (error) { if (this.storage.read("identity")) await this.incident(error); throw error; }
    });
  }
  connect(context: ConnectionContext, channel: Connection): Promise<Snapshot> {
    context = structuredClone(context);
    return this.enqueue(async () => {
      this.authorize(context, true, false);
      requireRoom(this.connections.size < ROOM_LIMITS.connections && !this.connections.has(context.connectionId), "capacity");
      try {
        const priorCommand = this.storage.read<Head>("marker")?.command;
        await this.ready(); const admittedAt = this.time();
        if (priorCommand !== this.cache().head.command) {
          const pendingDeadline = earliestDeadline(this.clock(), this.cache().state.position);
          requireRoom(!pendingDeadline || pendingDeadline.at > Math.max(admittedAt, this.clock().accountedAt), "stale", "recovery has due work; reconnect after alarm");
        } else if (await this.due(admittedAt)) throw new RoomError("stale", "deadline advanced game; reconnect");
        const boundary = this.cache(); let timing = this.clock();
        this.authorize(context, true, false);
        if (timing.phase !== "terminal") timing = suspend(timing, boundary.state.position, admittedAt);
        else timing = { ...timing, revision: timing.revision + 1 };
        this.connections.set(context.connectionId, { context: structuredClone(context), channel });
        const controls = this.storage.read<(string | null)[]>("controls");
        requireRoom(controls?.length === 4, "unavailable", "control storage missing");
        if (controls[context.seat] === null) controls[context.seat] = context.connectionId;
        timing.connected[context.seat] = true;
        if (timing.phase !== "terminal") timing = activate(timing, boundary.state.position, this.time(), boundary.head.command, "commit");
        await this.save({ controls }, timing);
        await this.fence(true);
        const snapshot = this.snapshot();
        await this.publish(null);
        return snapshot;
      } catch (error) { if (!(error instanceof RoomError && !(error instanceof RoomFenceError) && ["stale", "capacity", "invalid", "unauthorized"].includes(error.code))) await this.incident(error); throw error; }
    });
  }
  disconnect(context: ConnectionContext, channel?: Connection): Promise<void> {
    context = structuredClone(context);
    return this.enqueue(async () => {
      const connection = this.connections.get(context.connectionId); if (!connection) return;
      // Room-owned close callbacks retain the transport instance across control
      // changes. A late close from an older transport cannot remove its replacement.
      if (channel) {
        if (connection.channel !== channel) return;
        this.authorize(connection.context, false, true, true);
      } else this.authorize(context, false, true, true);
      try {
        const priorCommand = this.storage.read<Head>("marker")?.command;
        await this.ready(); const admittedAt = this.time();
        if (priorCommand === this.cache().head.command) await this.due(admittedAt);
        let timing = this.clock(); const boundary = this.cache();
        if (timing.phase !== "terminal") timing = suspend(timing, boundary.state.position, admittedAt);
        else timing = { ...timing, revision: timing.revision + 1 };
        this.connections.delete(context.connectionId);
        timing.connected[context.seat] = [...this.connections.values()].some(item => item.context.seat === context.seat);
        if (timing.phase !== "terminal") timing = activate(timing, boundary.state.position, this.time(), boundary.head.command, "commit");
        await this.save({}, timing);
        await this.publish(null);
      } catch (error) { await this.incident(error); throw error; }
    });
  }
  /** Trusted service explicitly authorizes takeover; principal binding is immutable.
   * Old tabs retain observation only and cannot retrieve old-generation receipts. */
  takeControl(context: ConnectionContext, nextGeneration: number): Promise<void> {
    context = structuredClone(context);
    return this.enqueue(async () => {
      this.authorize(context, false);
      if (nextGeneration === this.identity().seats[context.seat].generation &&
        this.storage.read<(string | null)[]>("controls")?.[context.seat] === context.connectionId) return;
      requireRoom(nextGeneration === this.identity().seats[context.seat].generation + 1, "invalid");
      try {
        await this.ready(); this.authorize(context, false); const identity = this.identity(); identity.seats[context.seat].generation = nextGeneration;
        const controls = this.storage.read<(string | null)[]>("controls"); requireRoom(controls?.length === 4, "unavailable");
        controls[context.seat] = context.connectionId;
        await this.save({ identity, controls }, this.clock());
        this.connections.get(context.connectionId)!.context = { ...context, generation: nextGeneration };
      } catch (error) { if (!(error instanceof RoomError && !(error instanceof RoomFenceError) && error.code === "unauthorized")) await this.incident(error); throw error; }
    });
  }
  /** Privileged service reconciliation after an uncertain takeover response. */
  controlStatus(context: ConnectionContext): Promise<{ generation: number; connectionGeneration: number; controller: boolean }> {
    context = structuredClone(context);
    return this.enqueue(async () => {
      this.authorize(context, false, false); await this.ready(); this.authorize(context, false, false);
      return { generation: this.identity().seats[context.seat].generation,
        connectionGeneration: this.connections.get(context.connectionId)?.context.generation ?? this.identity().seats[context.seat].generation,
        controller: this.storage.read<(string | null)[]>("controls")?.[context.seat] === context.connectionId };
    });
  }
  command(context: ConnectionContext, request: Omit<StableRequest, "caller">): Promise<{ receipt: Receipt; admittedAt: number }> {
    // Clone at entry: a trusted asynchronous caller cannot mutate queued intentions.
    const input = structuredClone(request); const caller = structuredClone(context);
    return this.enqueue(async () => {
      this.authorize(caller, true);
      requireRoom(typeof input.id === "string" && !input.id.startsWith("server:"), "invalid", "reserved server command ID");
      const stable: StableRequest = { ...input, caller: { kind: "seat", principal: caller.principal, seat: caller.seat, generation: caller.generation } };
      validateInput({ ...stable, admittedAt: 0 });
      try {
        const priorCommand = this.storage.read<Head>("marker")?.command;
        await this.ready();
        const prior = await this.db.lookupReceipt(caller.gameId, stable);
        this.authorize(caller, true);
        if (prior) { await this.fence(true); return { receipt: prior.receipt, admittedAt: prior.input.admittedAt }; }
        requireRoom(priorCommand === this.cache().head.command, "stale", "recovery advanced canonical state; resync");
        if (await this.due()) throw new RoomError("stale", "deadline advanced canonical state");
        const boundary = this.cache();
        requireRoom(input.expectedCommand === boundary.head.command, "stale");
        requireRoom(!boundary.state.position.result, "terminal");
        try { resolveAction(engineState(boundary.state), input.action); } catch { throw new RoomError("invalid", "engine rejected intention"); }
        // Legality may consume enough CPU to cross a deadline. Admission samples
        // server time again after validation and never admits a deadline-edge move.
        const admittedAt = this.time();
        if (await this.due(admittedAt)) throw new RoomError("stale", "deadline reached during validation");
        this.authorize(caller, true);
        requireRoom(boundary.head.command < LIMITS.commands, "capacity");
        const receipt = await this.accept(stable, admittedAt);
        const committed = await this.db.lookupReceipt(caller.gameId, stable);
        requireRoom(committed, "unavailable"); await this.fence(true); return { receipt, admittedAt: committed.input.admittedAt };
      } catch (error) {
        if (this.storage.read("pending") && error instanceof PersistenceError && ["invalid", "conflict"].includes(error.code)) {
          await this.incident(error);
          throw new RoomError("unavailable", "prepared command requires reconciliation; retain the same ID");
        }
        if (!(error instanceof RoomError && !(error instanceof RoomFenceError) && ["stale", "terminal", "invalid", "capacity", "unauthorized"].includes(error.code)) &&
          !(error instanceof PersistenceError && ["invalid", "conflict"].includes(error.code))) await this.incident(error);
        throw error;
      }
    });
  }
  read(context: ConnectionContext, expectedCommand = 0): Promise<Snapshot> {
    context = structuredClone(context);
    return this.enqueue(async () => {
      this.authorize(context, false);
      try { await this.ready(); requireRoom(Number.isSafeInteger(expectedCommand) && expectedCommand <= this.cache().head.command && expectedCommand >= 0, "stale"); await this.fence(true); this.authorize(context, false); return this.snapshot(); }
      catch (error) { if (!(error instanceof RoomError && !(error instanceof RoomFenceError) && ["stale", "unauthorized"].includes(error.code))) await this.incident(error); throw error; }
    });
  }
  alarm(): Promise<void> {
    if (this.alarmTask) return this.alarmTask;
    this.alarmTask = this.enqueue(async () => {
      try {
        const priorCommand = this.storage.read<Head>("marker")?.command;
        await this.boot(); if (!this.storage.read("identity")) return;
        if (this.storage.read("incident")) return;
        const timing = this.clock(); if (timing.phase === "incident") return;
        await this.expireConnections();
        if (timing.phase === "suspended" && timing.incident?.retryAt && this.time() < timing.incident.retryAt) {
          await this.save({}, timing, timing.incident.retryAt); return;
        }
        await this.ready();
        if (priorCommand === this.cache().head.command) await this.due();
        await this.save({}, this.clock());
      } catch (error) { await this.incident(error); }
    }, true).finally(() => { this.alarmTask = null; });
    return this.alarmTask;
  }
}
