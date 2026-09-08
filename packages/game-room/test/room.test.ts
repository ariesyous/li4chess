import { describe, expect, it } from "vitest";
import { createInitialState, legalMoves, localSquare, type PlayerColor } from "@li4chess/engine";
import { createReplay, engineState, equalCanonical, type EngineBuildIdentityV1 } from "@li4chess/protocol";
import { bounded, creationBoundary, digest, exactReader, LIMITS, PersistenceError, verifyPrepared,
  type Boundary, type GameHeader, type Head, type Owner, type Prepared, type StableRequest } from "@li4chess/persistence";
import { Room, ROOM_LIMITS, commandFailure, type ConnectionContext, type Creation, type Publication, type RoomDependencies } from "../src/room.js";
import type { RoomStorage } from "../src/storage.js";
import type { Timing } from "../src/timing.js";

// These tests exercise the maintained Room with explicitly mocked infrastructure.
// They do not establish SQLite/D1 atomicity, alarm delivery or hosted lifecycle behavior.
const producer: EngineBuildIdentityV1 = { format: "li4chess-engine-build-v1", sourceRevision: "4".repeat(40),
  workingTree: { status: "clean" }, packageVersions: { "@li4chess/engine": "0.0.0", "@li4chess/protocol": "0.0.0" } };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
class MemoryStorage implements RoomStorage {
  records = new Map<string, unknown>();
  alarmAt: number | null = null;
  writes = 0;
  failPrepare: Error | null = null;
  read<T>(key: string): T | null { return structuredClone(this.records.get(key) ?? null) as T | null; }
  async write(values: Record<string, unknown | null>, alarmAt: number | null): Promise<void> {
    if (values.pending && this.failPrepare) throw this.failPrepare;
    // Match the production adapter's pretransaction encoded-record bound.
    for (const value of Object.values(values)) if (value !== null) bounded(value, ROOM_LIMITS.recordBytes);
    const next = new Map(this.records);
    for (const [key, value] of Object.entries(values)) {
      if (value === null) next.delete(key); else next.set(key, structuredClone(value));
    }
    this.records = next; this.alarmAt = alarmAt; this.writes++;
  }
  timing(): Timing { return this.read<{ value: Timing }>("timing")!.value; }
}
type CanonicalPort = RoomDependencies["canonical"];
class CanonicalMock implements CanonicalPort {
  boundary: Boundary | null = null;
  owner: Owner | null = null;
  records = new Map<string, Prepared>();
  inspectCalls = 0;
  lookupCalls = 0;
  recoverCalls = 0;
  commitCalls = 0;
  inspectHook: (() => Promise<void>) | null = null;
  commitHook: (() => Promise<void>) | null = null;
  quarantined = false;
  async inspect(_gameId: string) {
    this.inspectCalls++;
    await this.inspectHook?.();
    if (this.quarantined) throw new PersistenceError("quarantined", "mock quarantine");
    return this.boundary && { headerHash: this.boundary.headerHash, owner: structuredClone(this.owner!), head: structuredClone(this.boundary.head) };
  }
  async create(header: GameHeader, owner: Owner) {
    this.boundary = await creationBoundary(header, exactReader(producer)); this.owner = structuredClone(owner);
    return structuredClone(this.boundary);
  }
  async lookupReceipt(_gameId: string, request: StableRequest) {
    this.lookupCalls++;
    const prepared = this.records.get(request.id); if (!prepared) return null;
    const { admittedAt: _at, ...stable } = prepared.record.input;
    if (!equalCanonical(stable, request)) throw new PersistenceError("conflict", "mock command ID reused");
    return structuredClone({ input: prepared.record.input, receipt: prepared.receipt });
  }
  async reconcile(prepared: Prepared): Promise<"committed" | "absent"> {
    const prior = this.records.get(prepared.record.input.id);
    if (prior) {
      if (!equalCanonical(prior, prepared)) throw new PersistenceError("corrupt", "mock prepare conflict");
      return "committed";
    }
    if (!equalCanonical(this.boundary!.head, prepared.record.expected)) throw new PersistenceError("conflict", "mock predecessor mismatch");
    return "absent";
  }
  async commit(prepared: Prepared) {
    this.commitCalls++; await this.commitHook?.();
    await verifyPrepared(prepared);
    if (await this.reconcile(prepared) === "committed") return structuredClone(prepared.receipt);
    this.records.set(prepared.record.input.id, structuredClone(prepared));
    this.boundary = { header: this.boundary!.header, headerHash: prepared.record.headerHash, state: structuredClone(prepared.finalState),
      head: { command: prepared.record.sequence, event: prepared.record.lastEvent,
        stateHash: prepared.record.afterHash, chainHash: prepared.receipt.commitHash } };
    return structuredClone(prepared.receipt);
  }
  async verifyRestore(_gameId: string, marker: Head) {
    const matches = equalCanonical(marker, this.boundary!.head) || [...this.records.values()].some(p => equalCanonical(marker, p.record.expected));
    if (!matches) throw new PersistenceError("corrupt", "mock restore marker mismatch");
  }
  async quarantine(_gameId: string, _reason: string) { this.quarantined = true; }
  async recover(_gameId: string) { this.recoverCalls++; return structuredClone(this.boundary!); }
}
async function fixture(initialMs = 10000) {
  const storage = new MemoryStorage(); const canonical = new CanonicalMock();
  const clock = { now: 1000, samples: [] as number[] };
  const dependencies: RoomDependencies = { storage, canonical, namespace: "mock-room", objectId: "object-1", producer, ownsGame: gameId => gameId === "mock-game",
    now: () => clock.samples.shift() ?? clock.now };
  const room = new Room(dependencies);
  const creation: Creation = { header: { format: "li4chess-d1-game-v1", gameId: "mock-game", replay: await createReplay(createInitialState(), producer) },
    owner: { namespace: "mock-room", generation: 1 },
    seats: [0, 1, 2, 3].map(seat => ({ principal: `principal-${seat}`, generation: 1 })) as Creation["seats"],
    policy: { initialMs, incrementMs: 500, increment: "after-move" } };
  await room.create(creation);
  const context = (seat: PlayerColor = 0, id = `tab-${seat}`, generation = 1): ConnectionContext =>
    ({ gameId: "mock-game", principal: `principal-${seat}`, seat, connectionId: id, generation });
  const messages: Publication[] = []; const closed: string[] = [];
  const channel = (id = "tab") => ({ send: (publication: Publication) => { messages.push(structuredClone(publication)); }, close: () => { closed.push(id); } });
  const request = (id = "move-1") => {
    const state = engineState(canonical.boundary!.state); const move = legalMoves(state)[0];
    return { id, expectedCommand: canonical.boundary!.head.command,
      action: { type: "move" as const, actor: state.turn, move: { from: move.from, to: move.to } } };
  };
  return { room, dependencies, creation, storage, canonical, clock, context, channel, messages, closed, request };
}

describe("Room state machine with mocked storage and canonical I/O", () => {
  it("keeps completed history readable when a sibling tab has already closed during disconnect publication",async()=>{
    const f=await fixture();let fail=false;
    const controller=f.context(),observer=f.context(0,"closed-observer");
    await f.room.connect(controller,f.channel());await f.room.connect(observer,{send:()=>{if(fail)throw new Error("closed transport");},close:()=>undefined});
    await f.room.command(controller,{id:"abort",expectedCommand:0,action:{type:"resign",actor:0}});
    const canonical=structuredClone(f.canonical.boundary),before=f.storage.timing(),controls=f.storage.read("controls");fail=true;
    await f.room.disconnect(controller);
    expect(f.canonical.boundary).toEqual(canonical);expect(f.storage.timing()).toMatchObject({phase:"terminal",incident:null,remainingMs:before.remainingMs,disconnectRemainingMs:before.disconnectRemainingMs,connected:[false,false,false,false]});
    expect(f.storage.read("controls")).toEqual(controls);expect(f.storage.read("incident")).toBeNull();
    await f.room.connect(f.context(1),f.channel());expect((await f.room.read(f.context(1))).boundary).toEqual(canonical);
  });
  it("retains active-game ambiguous publication recovery",async()=>{
    const f=await fixture();let fail=false;const context=f.context();
    await f.room.connect(context,{send:()=>{if(fail)throw new Error("closed transport");},close:()=>undefined});fail=true;
    await expect(f.room.command(context,f.request())).rejects.toMatchObject({code:"unavailable"});
    expect(f.storage.timing().phase).toBe("suspended");expect(f.canonical.boundary?.head.command).toBe(1);
  });
  it("expires leases at their exact presence boundary without moving earlier chess deadlines",async()=>{
    const f=await fixture(10000);await f.room.connect({...f.context(),expiresAt:20000},f.channel());
    f.clock.now=30000;await f.room.alarm();const prepared=[...f.canonical.records.values()][0];
    expect(prepared.record.input.action.type).toBe("timeout");expect(prepared.record.input.admittedAt).toBe(11000);
    await f.room.alarm();expect(f.storage.timing().connected[0]).toBe(false);expect(f.storage.timing().phase).toBe("terminal");
  });
  it("accounts a late credential expiry once and rejects an expired controller without an infrastructure incident",async()=>{
    const f=await fixture(100000);const context={...f.context(),expiresAt:3000};await f.room.connect(context,f.channel());
    f.clock.now=5000;await f.room.alarm();expect(f.storage.timing().connected[0]).toBe(false);expect(f.storage.timing().accountedAt).toBe(3000);
    expect(f.storage.alarmAt).toBe(61000);const before=f.storage.timing();await expect(f.room.command(context,f.request())).rejects.toMatchObject({code:"unauthorized"});expect(f.storage.timing()).toEqual(before);
  });
  it("does not mutate control if a lease expires during canonical validation",async()=>{
    const f=await fixture();const context={...f.context(),expiresAt:2000};await f.room.connect(context,f.channel());
    f.canonical.inspectHook=async()=>{f.clock.now=2001;};await expect(f.room.takeControl(context,2)).rejects.toMatchObject({code:"unauthorized"});
    expect(f.storage.read<Creation>("identity")!.seats[0].generation).toBe(1);
    expect(f.storage.timing().phase).toBe("running");
  });
  it("requires explicit observer takeover and does not promote on controller disconnect", async () => {
    const f = await fixture(); const controller = f.context(); const observer = f.context(0, "observer");
    await f.room.connect(controller, f.channel()); await f.room.connect(observer, f.channel("observer"));
    const lookup = f.canonical.lookupCalls;
    await expect(f.room.command(observer, f.request())).rejects.toMatchObject({ code: "unauthorized" });
    await f.room.disconnect(controller);
    expect(f.storage.timing().connected[0]).toBe(true);
    await expect(f.room.command(observer, f.request())).rejects.toMatchObject({ code: "unauthorized" });
    expect(f.canonical.lookupCalls).toBe(lookup);
    await f.room.takeControl(observer, 2);
    await expect(f.room.command(observer, f.request())).rejects.toMatchObject({ code: "unauthorized" });
    const result = await f.room.command({ ...observer, generation: 2 }, f.request());
    expect(result.receipt.sequence).toBe(1);
    await expect(f.room.command(controller, f.request())).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("uses transport identity for close after takeover and ignores the replaced transport's late close", async () => {
    const f = await fixture(); const originalContext = f.context(); const originalChannel = f.channel("original");
    await f.room.connect(originalContext, originalChannel);
    await f.room.takeControl(originalContext, 2);
    const currentContext = { ...originalContext, generation: 2 };
    f.clock.now = 1500;
    await f.room.disconnect(originalContext, originalChannel);
    expect(f.storage.timing().connected[0]).toBe(false);
    await expect(f.room.read(currentContext)).rejects.toMatchObject({ code: "unauthorized" });
    const replacementChannel = f.channel("replacement");
    f.clock.now = 2000; await f.room.connect(currentContext, replacementChannel);
    const timing = f.storage.timing(); const writes = f.storage.writes;
    expect(timing.connected[0]).toBe(true); expect(timing.disconnectRemainingMs[0]).toBe(59500);
    await f.room.disconnect(originalContext, originalChannel);
    expect(f.storage.timing()).toEqual(timing); expect(f.storage.writes).toBe(writes);
    expect((await f.room.read(currentContext)).boundary.head.command).toBe(0);
    await f.room.disconnect(originalContext, replacementChannel);
    expect(f.storage.timing().connected[0]).toBe(false);
  });

  it("freezes and rearms a failed takeover fence without changing control generation", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    const identity = f.storage.read("identity"); const controls = f.storage.read("controls"); const timing = f.storage.timing();
    const publications = f.messages.length;
    f.clock.now = 1500; f.canonical.inspectHook = async () => { throw new Error("mock takeover fence unavailable"); };
    await expect(f.room.takeControl(context, 2)).rejects.toThrow(/mock takeover fence unavailable/);
    expect(f.storage.read("identity")).toEqual(identity); expect(f.storage.read("controls")).toEqual(controls);
    expect(f.storage.timing()).toMatchObject({ phase: "suspended", remainingMs: timing.remainingMs,
      disconnectRemainingMs: timing.disconnectRemainingMs, incident: { reason: "infrastructure", firstAt: 1500, attempts: 1, retryAt: 2500 } });
    expect(f.storage.alarmAt).toBe(2500); expect(f.closed).toHaveLength(1);
    expect(f.messages.slice(publications)).toEqual([{ type: "resyncRequired" }]);
    const inspections = f.canonical.inspectCalls; f.clock.now = 2000; await f.room.alarm();
    expect(f.canonical.inspectCalls).toBe(inspections); expect(f.storage.alarmAt).toBe(2500);
    expect(f.storage.read("identity")).toEqual(identity); expect(f.canonical.commitCalls).toBe(0);
  });

  it("rejects reserved server IDs before receipt lookup or timing writes", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    const timing = f.storage.timing(); const writes = f.storage.writes; const lookups = f.canonical.lookupCalls;
    await expect(f.room.command(context, f.request("server:1:timeout:0"))).rejects.toMatchObject({ code: "invalid" });
    expect(f.canonical.lookupCalls).toBe(lookups); expect(f.storage.writes).toBe(writes); expect(f.storage.timing()).toEqual(timing);
  });

  it("returns exact duplicate receipt/admission after later commands and never authorizes retries by ID", async () => {
    const f = await fixture(); const red = f.context(); const blue = f.context(1);
    await f.room.connect(red, f.channel()); await f.room.connect(blue, f.channel());
    f.clock.now = 1500; const redRequest = f.request(); const first = await f.room.command(red, redRequest);
    f.clock.now = 1800; await f.room.command(blue, f.request("move-2"));
    const timing = f.storage.timing(); const writes = f.storage.writes;
    f.clock.now = 50000;
    expect(await f.room.command(red, redRequest)).toEqual(first);
    expect(f.storage.timing()).toEqual(timing); expect(f.storage.writes).toBe(writes);
    const lookups = f.canonical.lookupCalls;
    await expect(f.room.command({ ...red, principal: "intruder" }, redRequest)).rejects.toMatchObject({ code: "unauthorized" });
    expect(f.canonical.lookupCalls).toBe(lookups);
  });

  it("rechecks time after legality and admits deadline facts instead of a crossing move", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    const deadline = f.storage.timing().deadline!;
    f.clock.now = deadline; f.clock.samples = [deadline - 1, deadline];
    await expect(f.room.command(context, f.request())).rejects.toMatchObject({ code: "stale" });
    expect(f.canonical.records.size).toBe(1);
    const prepared = [...f.canonical.records.values()][0];
    expect(prepared.record.input).toMatchObject({ id: "server:1:timeout:0", admittedAt: deadline,
      caller: { kind: "server", principal: "mock-room" }, action: { type: "timeout", actor: 0, clock: { remainingMs: 0 } } });
    expect(prepared.record.format).toBe("li4chess-d1-command-v2");
    expect(f.storage.timing().remainingMs[0]).toBe(0);
    expect(f.canonical.boundary!.state.position.result?.reason).toBe("abort");
  });

  it("returns terminal retries exactly, rejects conflicting reuse, and fences transferred ownership before lookup", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    const request = { id: "terminal", expectedCommand: 0, action: { type: "resign" as const, actor: 0 as PlayerColor } };
    f.clock.now = 1500; const receipt = await f.room.command(context, request);
    const terminal = structuredClone(f.canonical.boundary); const timing = f.storage.timing(); const writes = f.storage.writes;
    f.clock.now = 100000;
    expect(await f.room.command(context, request)).toEqual(receipt);
    await expect(f.room.command(context, { ...request, action: { type: "claimWin", actor: 0 } }))
      .rejects.toMatchObject({ code: "conflict" });
    expect(f.canonical.boundary).toEqual(terminal); expect(f.storage.timing()).toEqual(timing); expect(f.storage.writes).toBe(writes);
    f.canonical.owner = { namespace: "new-owner", generation: 2 }; const lookups = f.canonical.lookupCalls;
    await expect(f.room.command(context, request)).rejects.toMatchObject({ code: "unauthorized" });
    expect(f.canonical.lookupCalls).toBe(lookups); expect(f.storage.timing().phase).toBe("incident");
  });

  it("reports a post-commit owner fence as ambiguous without undoing canonical work", async () => {
    const f=await fixture();const context=f.context();await f.room.connect(context,f.channel());
    f.canonical.inspectHook=async()=>{if(f.canonical.records.size)f.canonical.owner={namespace:"replacement",generation:2};};
    const result=await f.room.command(context,{id:"committed-fence",expectedCommand:0,action:{type:"resign",actor:0}}).catch(commandFailure);
    expect(result).toEqual({ok:false,code:"unavailable",ambiguous:true});
    expect(f.canonical.records.has("committed-fence")).toBe(true);expect(f.canonical.boundary!.head.command).toBe(1);
  });

  it("reserves and coalesces an alarm when all 16 ordinary queue slots are occupied", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    // Room's queue bookkeeping settles after the public promise, before the next event-loop turn.
    await new Promise<void>(resolve => setImmediate(resolve));
    const entered = deferred(); const release = deferred(); let blocked = false;
    f.canonical.inspectHook = async () => { if (!blocked) { blocked = true; entered.resolve(); await release.promise; } };
    const reads = Array.from({ length: ROOM_LIMITS.queued }, () => f.room.read(context));
    const joined = Promise.allSettled(reads); await entered.promise;
    await expect(f.room.read(context)).rejects.toMatchObject({ code: "capacity" });
    const alarm = f.room.alarm(); expect(f.room.alarm()).toBe(alarm);
    f.clock.now = 11000; release.resolve();
    expect((await joined).every(result => result.status === "fulfilled")).toBe(true); await alarm;
    expect(f.canonical.commitCalls).toBe(1);
    expect(f.canonical.boundary!.state.position.result?.reason).toBe("abort");
  });

  it("keeps initial publication inside the queue before a concurrently submitted command", async () => {
    const f = await fixture(); const context = f.context(); const entered = deferred(); const release = deferred();
    let fences = 0;
    f.canonical.inspectHook = async () => { if (++fences === 2) { entered.resolve(); await release.promise; } };
    const connecting = f.room.connect(context, f.channel()); await entered.promise;
    const command = f.room.command(context, f.request());
    expect(f.messages).toEqual([]); expect(f.canonical.lookupCalls).toBe(0);
    release.resolve(); await connecting; await command;
    const publications = f.messages.filter(m => m.type === "committed");
    expect(publications.map(p => p.snapshot.boundary.head.command)).toEqual([0, 1]);
    expect(publications.map(p => p.receipt?.sequence ?? null)).toEqual([null, 1]);
  });

  it("retains exact prepared bytes and increment across failed commit and cold recovery", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    const request = f.request(); const before = f.messages.length;
    f.clock.now = 1500; f.canonical.commitHook = async () => { throw new Error("mock canonical unavailable"); };
    await expect(f.room.command(context, request)).rejects.toThrow(/mock canonical unavailable/);
    const pending = f.storage.read<Prepared>("pending")!; const frozen = f.storage.timing();
    expect(pending.record.input).toMatchObject({ id: request.id, admittedAt: 1500 });
    expect(frozen.remainingMs).toEqual([10000, 10000, 10000, 10000]);
    expect(frozen.phase).toBe("suspended"); expect(frozen.incident?.retryAt).toBe(2500);
    expect(f.canonical.records.size).toBe(0); expect(f.canonical.boundary!.head.command).toBe(0);
    expect(f.messages.slice(before).filter(m => m.type === "committed")).toEqual([]);
    f.clock.now = 100000; f.canonical.commitHook = null;
    const recovered = new Room(f.dependencies); await recovered.alarm();
    expect(f.canonical.records.get(request.id)).toEqual(pending); expect(f.storage.read("pending")).toBeNull();
    expect(f.storage.timing().remainingMs).toEqual(frozen.remainingMs);
    expect(f.storage.timing().disconnectRemainingMs).toEqual(frozen.disconnectRemainingMs);
    expect(f.storage.timing()).toMatchObject({ phase: "running", command: 1, accountedAt: 100000 });
    // Trusted integration reattaches the same control identity; a new tab would observe until takeover.
    const reconnect = f.context(); await recovered.connect(reconnect, f.channel());
    expect(await recovered.command(reconnect, request)).toEqual({ receipt: pending.receipt, admittedAt: 1500 });
    expect(f.canonical.commitCalls).toBe(2);
  });

  it("quarantines a valid older pending restore when canonical commands already advanced beyond it", async () => {
    const f = await fixture(); const red = f.context(); const blue = f.context(1);
    await f.room.connect(red, f.channel()); await f.room.connect(blue, f.channel());
    f.clock.now = 1500; f.canonical.commitHook = async () => { throw new Error("mock first commit failure"); };
    await expect(f.room.command(red, f.request())).rejects.toThrow(/mock first commit failure/);
    const restoredRecords = structuredClone(f.storage.records); const pending = f.storage.read<Prepared>("pending")!;
    f.canonical.commitHook = null; f.clock.now = 2500; await f.room.alarm();
    await f.room.connect(blue, f.channel()); await f.room.command(blue, f.request("move-2"));
    const canonical = structuredClone(f.canonical.boundary); const commits = f.canonical.commitCalls;
    expect(canonical!.head.command).toBe(2);
    f.storage.records = restoredRecords;
    f.clock.now = 3000; const restored = new Room(f.dependencies); await restored.alarm();
    expect(f.canonical.quarantined).toBe(true); expect(f.canonical.boundary).toEqual(canonical);
    expect(f.canonical.commitCalls).toBe(commits); expect(f.storage.read("pending")).toEqual(pending);
    expect(f.storage.read<Boundary>("cache")!.head.command).toBe(0);
    expect(f.storage.timing()).toMatchObject({ phase: "incident", incident: { reason: "quarantined", retryAt: null } });
    expect(f.storage.alarmAt).toBeNull();
    await expect(restored.connect(red, f.channel())).rejects.toMatchObject({ code: "unavailable" });
  });

  it("limits recovery alarm to one canonical action before scheduling its walking successor", async () => {
    const f = await fixture(100000);
    for (const seat of [0, 1, 2, 3] as const) await f.room.connect(f.context(seat), f.channel());
    // Reach the opening guard with real engine-generated moves, avoiding synthetic history.
    for (let index = 0; index < 12; index++) {
      const state = engineState(f.canonical.boundary!.state);
      // Open the King's forward squares so resignation leaves a movable walking King.
      const moves = legalMoves(state);
      const move = index < 4 ? moves.find(candidate => candidate.from === localSquare(state.turn, 4, 1)) ?? moves[0] : moves[0];
      await f.room.command(f.context(state.turn), { id: `opening-${index}`, expectedCommand: index,
        action: { type: "move", actor: state.turn, move: { from: move.from, to: move.to } } });
    }
    expect(f.canonical.boundary!.state.position.completedMoves).toEqual({ 0: 3, 1: 3, 2: 3, 3: 3 });
    f.clock.now = 1500; f.canonical.commitHook = async () => { throw new Error("mock resign commit failure"); };
    await expect(f.room.command(f.context(), { id: "resign", expectedCommand: 12, action: { type: "resign", actor: 0 } }))
      .rejects.toThrow(/mock resign commit failure/);
    const pending = f.storage.read<Prepared>("pending")!;
    expect(pending.finalState.position.players[0].kingStatus).toBe("walking");
    expect(pending.finalState.position.turn).toBe(0);
    f.clock.now = 2500; f.canonical.commitHook = null;
    const restored = new Room(f.dependencies); await restored.alarm();
    expect(f.canonical.boundary!.head.command).toBe(13); expect(f.canonical.records.get("resign")).toEqual(pending);
    expect(f.canonical.boundary!.state.position.randomDrawIndex).toBe(0);
    expect(f.storage.alarmAt).toBe(2500);
    await restored.alarm();
    expect(f.canonical.boundary!.head.command).toBe(14);
    expect(f.canonical.records.get("server:14:randomKingMove:0")!.record.input.action).toEqual({ type: "randomKingMove", actor: 0 });
    expect(f.canonical.boundary!.state.position.randomDrawIndex).toBeGreaterThan(0);
  });

  it("cannot reconnect away an exhausted bank when recovery committed an earlier tied forfeit", async () => {
    const f = await fixture(100000);
    for (const seat of [0, 1, 2, 3] as const) await f.room.connect(f.context(seat), f.channel());
    for (let index = 0; index < 12; index++) {
      const state = engineState(f.canonical.boundary!.state); const moves = legalMoves(state);
      const move = index < 4 ? moves.find(candidate => candidate.from === localSquare(state.turn, 4, 1)) ?? moves[0] : moves[0];
      await f.room.command(f.context(state.turn), { id: `opening-${index}`, expectedCommand: index,
        action: { type: "move", actor: state.turn, move: { from: move.from, to: move.to } } });
    }
    await f.room.disconnect(f.context()); await f.room.disconnect(f.context(1));
    f.clock.now = 61000; f.canonical.commitHook = async () => { throw new Error("mock forfeit commit failure"); };
    await f.room.alarm();
    const pending = f.storage.read<Prepared>("pending")!;
    expect(pending.record.input.action).toMatchObject({ type: "disconnectForfeit", actor: 0 });
    expect(f.storage.timing().disconnectRemainingMs.slice(0, 2)).toEqual([0, 0]);
    f.clock.now = 62000; f.canonical.commitHook = null;
    const restored = new Room(f.dependencies);
    await expect(restored.connect(f.context(1), f.channel("reconnecting-blue"))).rejects.toMatchObject({ code: "stale" });
    expect(f.canonical.boundary!.head.command).toBe(13);
    expect(f.storage.timing().connected[1]).toBe(false); expect(f.storage.timing().disconnectRemainingMs[1]).toBe(0);
    expect(f.storage.alarmAt).toBe(62000);
    await restored.alarm();
    expect(f.canonical.boundary!.head.command).toBe(14);
    expect(f.canonical.records.get("server:14:disconnectForfeit:1")!.record.input.action)
      .toEqual({ type: "disconnectForfeit", actor: 1, disconnect: { bankMs: 60000, cumulativeDisconnectedMs: 60000, remainingMs: 0 } });
  });

  it.each(["missing", "hash", "schema"])("never auto-resumes %s timing on repeated cold alarms", async damage => {
    const f = await fixture();
    if (damage === "missing") f.storage.records.delete("timing");
    else {
      const record = f.storage.read<{ value: Timing; hash: string }>("timing")!;
      if (damage === "hash") record.hash = "sha256:" + "0".repeat(64);
      else record.value.remainingMs[0] = -1;
      f.storage.records.set("timing", record);
    }
    const recoveries = f.canonical.recoverCalls; const inspections = f.canonical.inspectCalls;
    const recovered = new Room(f.dependencies); await recovered.alarm();
    f.clock.now += 100000; await recovered.alarm(); await recovered.alarm();
    expect(f.storage.read("incident")).not.toBeNull(); expect(f.storage.alarmAt).toBeNull();
    expect(f.canonical.recoverCalls).toBe(recoveries); expect(f.canonical.inspectCalls).toBe(inspections);
    await expect(recovered.connect(f.context(), f.channel())).rejects.toMatchObject({ code: "unavailable" });
    expect(f.messages.filter(m => m.type === "committed")).toEqual([]);
  });

  it.each(["invalid", "conflict"] as const)("treats post-prepare %s as unresolved and immediately invalidates transports", async code => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    const before = f.messages.length; f.clock.now = 1500;
    f.canonical.commitHook = async () => { throw new PersistenceError(code, "post-prepare failure"); };
    await expect(f.room.command(context, f.request())).rejects.toMatchObject({ code: "unavailable" });
    const pending = f.storage.read<Prepared>("pending"); expect(pending).not.toBeNull();
    expect(f.canonical.records.size).toBe(0); expect(f.canonical.boundary!.head.command).toBe(0);
    expect(f.storage.timing()).toMatchObject({ phase: "suspended", remainingMs: [10000, 10000, 10000, 10000] });
    expect(f.storage.alarmAt).toBe(2500);
    expect(f.messages.slice(before)).toEqual([{ type: "resyncRequired" }]); expect(f.closed.length).toBe(1);
  });

  it.each(["commands", "prepare-bytes"])("keeps server alarm %s capacity permanently suspended", async bound => {
    const f = await fixture(); await f.room.connect(f.context(), f.channel());
    if (bound === "commands") {
      const boundary = structuredClone(f.canonical.boundary!); boundary.head.command = LIMITS.commands;
      f.canonical.boundary = boundary; f.storage.records.set("cache", structuredClone(boundary));
      f.storage.records.set("marker", structuredClone(boundary.head));
      const timing = f.storage.timing(); timing.command = LIMITS.commands;
      f.storage.records.set("timing", { value: timing, hash: await digest(timing) });
    } else f.storage.failPrepare = new PersistenceError("invalid", "encoded size limit");
    const balances = f.storage.timing().remainingMs; const banks = f.storage.timing().disconnectRemainingMs;
    const before = f.messages.length; f.clock.now = 11000; await f.room.alarm();
    const stopped = f.storage.timing();
    expect(stopped).toMatchObject({ phase: "incident", incident: { reason: "capacity", retryAt: null } });
    expect(stopped.remainingMs).toEqual(balances); expect(stopped.disconnectRemainingMs).toEqual(banks);
    expect(f.storage.alarmAt).toBeNull(); expect(f.storage.read("pending")).toBeNull(); expect(f.canonical.commitCalls).toBe(0);
    expect(f.messages.slice(before).filter(message => message.type === "committed")).toEqual([]);
    f.clock.now += 100000; await f.room.alarm(); await f.room.alarm();
    expect(f.storage.timing()).toEqual(stopped); expect(f.storage.alarmAt).toBeNull();
  });

  it("durably suspends when storage reports an oversized eligible complete prepare", async () => {
    const f = await fixture(); const context = f.context(); await f.room.connect(context, f.channel());
    f.storage.failPrepare = new PersistenceError("invalid", "encoded size limit");
    f.clock.now = 1500; const before = f.messages.length; const balances = f.storage.timing().remainingMs;
    const banks = f.storage.timing().disconnectRemainingMs;
    await expect(f.room.command(context, f.request())).rejects.toMatchObject({ code: "capacity" });
    expect(f.canonical.commitCalls).toBe(0); expect(f.storage.read("pending")).toBeNull();
    expect(f.messages.slice(before).filter(m => m.type === "committed")).toEqual([]);
    expect(f.storage.timing().phase).toBe("incident");
    expect(f.storage.timing().incident).toMatchObject({ reason: "capacity", retryAt: null });
    expect(f.storage.timing().remainingMs).toEqual(balances); expect(f.storage.timing().disconnectRemainingMs).toEqual(banks);
    f.clock.now += 100000; await f.room.alarm();
    expect(f.storage.timing().remainingMs).toEqual(balances); expect(f.storage.timing().disconnectRemainingMs).toEqual(banks);
    expect(f.storage.alarmAt).toBeNull(); expect(f.canonical.commitCalls).toBe(0);
    await expect(f.room.read(context)).rejects.toMatchObject({ code: "unauthorized" });
    await expect(f.room.connect(f.context(0, "new-tab"), f.channel())).rejects.toMatchObject({ code: "unavailable" });
  });
});
