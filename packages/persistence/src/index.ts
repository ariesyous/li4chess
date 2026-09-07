import { canonicalJson, equalCanonical, readReplayEvents, recordReplayAction, stateHash, engineState } from "@li4chess/protocol";
import type { ReplayEventV2, RulesetStateV2, RulesetResultV2 } from "@li4chess/protocol";
import { bounded, check, creationBoundary, digest, LIMITS, opaque, PersistenceError, receiptFor,
  validateInput, validateOwner, validateRecord, verifyPrepared } from "./model.js";
import type { Boundary, CommandInput, CommandRecord, GameHeader, Head, Owner, Prepared, ReaderPolicy, Receipt, StableRequest } from "./model.js";
export * from "./model.js";

interface GameRow { id: string; header_json: string; header_hash: string; owner_namespace: string; owner_generation: number;
  command_seq: number; event_seq: number; state_hash: string; chain_hash: string; lifecycle: string; quarantine: string | null }
interface CommandRow { record_json: string; receipt_json: string; commit_hash: string; command_hash: string;
  seq: number; id: string; first_event: number; last_event: number; before_hash: string; after_hash: string;
  previous_chain: string; owner_namespace: string; owner_generation: number }
interface CheckpointRow { command_seq: number; event_seq: number; state_json: string; state_hash: string; chain_hash: string }
const headOf = (g: GameRow): Head => ({ command: g.command_seq, event: g.event_seq, stateHash: g.state_hash, chainHash: g.chain_hash });
const parse = <T>(json: string): T => { try {
  const value:unknown=JSON.parse(json);check(value!==null&&typeof value==="object"&&!Array.isArray(value),"persisted object");return value as T;
} catch { throw new PersistenceError("corrupt","invalid persisted JSON object"); } };
const same = (a: unknown, b: unknown, message: string) => check(equalCanonical(a, b), message);

/** Maintained D1 binding adapter. No Sessions: every read, especially an uncertain
 * acknowledgement lookup, goes to primary. This class is internal server code;
 * it neither authenticates callers nor exposes HTTP/admin/recovery routes. */
export class D1Persistence {
  constructor(private readonly db: D1Database, private readonly policy: ReaderPolicy) {}
  private sql(sql: string, ...values: (string | number | null)[]): D1PreparedStatement {
    return this.db.prepare(sql).bind(...values);
  }
  async schema(): Promise<void> {
    const row = await this.db.prepare("SELECT version FROM persistence_schema WHERE id = 1").first<{ version: number }>();
    check(row && [1, 2].includes(row.version), "schema version", "unsupported");
  }
  /** Primary identity/ownership fence without replay reconstruction. Absence is
   * distinct from quarantined or unsupported data, which must never be exposed. */
  async inspect(gameId: string): Promise<{ headerHash: string; owner: Owner; head: Head } | null> {
    await this.schema(); opaque(gameId);
    const g = await this.sql("SELECT * FROM games WHERE id = ?", gameId).first<GameRow>();
    if (!g) return null;
    check(g.quarantine === null, "game requires operator recovery", "quarantined");
    const boundary = await creationBoundary(parse<GameHeader>(g.header_json), this.policy);
    check(boundary.header.gameId === gameId && boundary.headerHash === g.header_hash, "canonical header");
    const owner = { namespace: g.owner_namespace, generation: g.owner_generation }; validateOwner(owner);
    const head = headOf(g);
    check(Number.isSafeInteger(head.command) && head.command >= 0 && head.command <= LIMITS.commands &&
      Number.isSafeInteger(head.event) && head.event >= head.command && head.event <= LIMITS.commands * LIMITS.effects &&
      [head.stateHash, head.chainHash].every(h => typeof h === "string" && /^sha256:[a-f0-9]{64}$/.test(h)), "canonical head");
    return { headerHash: boundary.headerHash, owner, head };
  }
  async create(header: GameHeader, owner: Owner): Promise<Boundary> {
    await this.schema(); validateOwner(owner);
    const boundary = await creationBoundary(header, this.policy);
    const { head } = boundary;
    const statements = [this.sql(`INSERT INTO games
      (id,header_json,header_hash,owner_namespace,owner_generation,state_hash,chain_hash,lifecycle) VALUES (?,?,?,?,?,?,?,?)`,
      header.gameId, bounded(header, LIMITS.stateBytes), boundary.headerHash, owner.namespace, owner.generation,
      head.stateHash, head.chainHash, header.replay.result ? "terminal" : "active"),
    this.sql("INSERT INTO checkpoints VALUES (?,?,?,?,?,?)", header.gameId, 0, 0,
      canonicalJson(boundary.state), head.stateHash, head.chainHash)];
    if (header.replay.result) statements.push(this.sql("INSERT INTO results VALUES (?,?,?,?)", header.gameId, 0,
      canonicalJson(header.replay.result), await digest(header.replay.result)));
    await this.db.batch(statements); return boundary;
  }
  private async game(gameId: string): Promise<GameRow> {
    opaque(gameId);
    const g = await this.sql("SELECT * FROM games WHERE id = ?", gameId).first<GameRow>();
    check(g, "game missing", "conflict"); check(g.quarantine === null, "game requires operator recovery", "quarantined");
    const header = parse<GameHeader>(g.header_json);
    check(header.format === "li4chess-d1-game-v1" && this.policy.accepts(header.replay.engineBuild), "producer reader unavailable", "unsupported");
    check(header.gameId === gameId && !header.replay.events.length && await digest(header) === g.header_hash, "canonical header");
    return g;
  }
  private async command(gameId: string, id: string): Promise<CommandRow | null> {
    return this.sql("SELECT * FROM commands WHERE game_id = ? AND id = ?", gameId, id).first<CommandRow>();
  }
  /** Duplicate lookup before admission. The authenticated caller knows only the
   * stable intention; recover the original server time from canonical storage.
   * Never reveal stored input for a mismatched caller/intention/control epoch. */
  async lookupReceipt(gameId: string, request: StableRequest): Promise<{ input: CommandInput; receipt: Receipt } | null> {
    await this.schema();
    check(!Object.prototype.hasOwnProperty.call(request, "admittedAt"), "lookup accepts stable request only", "invalid");
    validateInput({ ...request, admittedAt: 0 }); await this.game(gameId);
    const row = await this.command(gameId, request.id); if (!row) return null;
    const record = parse<CommandRecord>(row.record_json); validateRecord(record, this.policy);
    const { admittedAt: _admission, ...storedRequest } = record.input;
    check(equalCanonical(storedRequest, request), "command ID reused", "conflict");
    const stored = await this.readPrepared(gameId, row);
    return { input: stored.record.input, receipt: stored.receipt };
  }
  /** Caller must authenticate first. Exact input includes caller/control generation
   * and admission facts. A new control generation cannot read an old receipt by ID. */
  async receipt(gameId: string, input: CommandInput): Promise<Receipt | null> {
    await this.schema(); validateInput(input); await this.game(gameId);
    const row = await this.command(gameId, input.id); if (!row) return null;
    const record = parse<CommandRecord>(row.record_json);
    validateRecord(record, this.policy);
    check(equalCanonical(record.input, input) && row.command_hash === await digest(input), "command ID reused", "conflict");
    const stored = await this.readPrepared(gameId, row);
    return stored.receipt;
  }
  private async readPrepared(gameId: string, row: CommandRow): Promise<Omit<Prepared, "finalState">> {
    const record = parse<CommandRecord>(row.record_json);
    validateRecord(record, this.policy);
    const receipt = parse<Receipt>(row.receipt_json);
    check(row.seq === record.sequence && row.id === record.input.id && row.first_event === record.firstEvent &&
      row.last_event === record.lastEvent && row.before_hash === record.expected.stateHash && row.after_hash === record.afterHash &&
      row.previous_chain === record.expected.chainHash && row.commit_hash === receipt.commitHash && row.command_hash === record.commandHash &&
      row.owner_namespace === record.owner.namespace && row.owner_generation === record.owner.generation && record.gameId === gameId, "command columns");
    const events = await this.sql("SELECT seq,event_json FROM events WHERE game_id = ? AND command_seq = ? ORDER BY seq LIMIT ?",
      gameId, row.seq, LIMITS.effects + 1).all<{ seq: number; event_json: string }>();
    const payloads = events.results.map(e => { const event = parse<ReplayEventV2>(e.event_json); check(e.seq === event.sequence, "event column"); return event; });
    // Checkpoints may have been pruned; their immutable digest remains in record.
    const checkpoint = record.checkpointHash ? await this.sql("SELECT * FROM checkpoints WHERE game_id = ? AND command_seq = ?", gameId, row.seq).first<CheckpointRow>() : null;
    const result = record.resultHash ? await this.sql("SELECT * FROM results WHERE game_id = ?", gameId)
      .first<{ command_seq: number; result_json: string; result_hash: string }>() : null;
    check(!record.resultHash || result && result.command_seq === row.seq && result.result_hash === record.resultHash, "result row missing/divergent");
    const p: Omit<Prepared, "finalState"> = { record, events: payloads, receipt, checkpoint: checkpoint ? parse<RulesetStateV2>(checkpoint.state_json) : null,
      result: result ? parse<RulesetResultV2>(result.result_json) : null };
    // Receipt/event integrity remains independently verifiable after checkpoint pruning.
    same(receipt, await receiptFor(record, payloads), "canonical receipt integrity");
    check(await digest(record.input) === row.command_hash, "canonical input integrity");
    if (checkpoint) check(checkpoint.state_hash === record.checkpointHash && checkpoint.chain_hash === receipt.commitHash &&
      checkpoint.event_seq === record.lastEvent && await stateHash(p.checkpoint!) === record.checkpointHash, "checkpoint anchor");
    if (p.result) check(await digest(p.result) === record.resultHash, "result integrity");
    return p;
  }
  /** No action execution. Identical canonical bytes prove success after a lost ack;
   * absent at the exact predecessor permits retrying the same prepare. A divergent
   * record/head quarantines. A generation handoff fences an absent old prepare. */
  async reconcile(p: Prepared): Promise<"committed" | "absent"> {
    await this.schema(); await verifyPrepared(p, this.policy);
    const g = await this.game(p.record.gameId);
    check(g.header_hash === p.record.headerHash && this.policy.accepts(parse<GameHeader>(g.header_json).replay.engineBuild), "prepare producer/header", "unsupported");
    const row = await this.command(g.id, p.record.input.id);
    if (row) {
      const stored = await this.readPrepared(g.id, row);
      // Pruning is allowed to remove the full checkpoint but not its commitment.
      if (equalCanonical(stored.record, p.record) && equalCanonical(stored.events, p.events) && equalCanonical(stored.receipt, p.receipt) &&
        equalCanonical(stored.result, p.result) && (!stored.checkpoint || equalCanonical(stored.checkpoint, p.checkpoint)) &&
        g.command_seq >= p.record.sequence && (g.command_seq !== p.record.sequence || equalCanonical(headOf(g), {
          command: p.record.sequence, event: p.record.lastEvent, stateHash: p.record.afterHash, chainHash: p.receipt.commitHash }))) return "committed";
      await this.quarantine(g.id, "divergent-prepare");
      throw new PersistenceError("quarantined", "canonical prepared bytes diverge");
    }
    if (!equalCanonical(headOf(g), p.record.expected)) {
      await this.quarantine(g.id, "divergent-predecessor");
      throw new PersistenceError("quarantined", "canonical predecessor diverges");
    }
    check(g.owner_namespace === p.record.owner.namespace && g.owner_generation === p.record.owner.generation, "owner changed", "fenced");
    return "absent";
  }
  async commit(p: Prepared): Promise<Receipt> {
    await this.schema(); await verifyPrepared(p, this.policy);
    const r = p.record;
    const game = await this.game(r.gameId);
    check(game.header_hash === r.headerHash && this.policy.accepts(parse<GameHeader>(game.header_json).replay.engineBuild), "prepare producer/header", "unsupported");
    check(p.finalState.setupId === parse<GameHeader>(game.header_json).replay.game.setupId, "prepare setup");
    // ID lookup deliberately precedes stale/terminal checks, but conflicts do not
    // quarantine ordinary callers: only prepared-recovery divergence does.
    const prior = await this.receipt(r.gameId, r.input);
    if (prior) { check(prior.commitHash === p.receipt.commitHash, "different prepared bytes", "conflict"); return prior; }
    const statements = [this.sql(`INSERT INTO commands VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, r.gameId, r.input.id,
      r.sequence, r.firstEvent, r.lastEvent, r.expected.stateHash, r.afterHash, r.expected.chainHash,
      r.owner.namespace, r.owner.generation, r.commandHash, p.receipt.commitHash, canonicalJson(r), canonicalJson(p.receipt))];
    for (const event of p.events) statements.push(this.sql("INSERT INTO events VALUES (?,?,?,?)", r.gameId, event.sequence, r.sequence, canonicalJson(event)));
    if (p.checkpoint) statements.push(this.sql("INSERT INTO checkpoints VALUES (?,?,?,?,?,?)", r.gameId, r.sequence,
      r.lastEvent, canonicalJson(p.checkpoint), r.afterHash, p.receipt.commitHash));
    if (p.result) statements.push(this.sql("INSERT INTO results VALUES (?,?,?,?)", r.gameId, r.sequence, canonicalJson(p.result), r.resultHash));
    // Insert trigger already checked exact owner/head in this same transaction.
    statements.push(this.sql("UPDATE games SET command_seq=?,event_seq=?,state_hash=?,chain_hash=?,lifecycle=? WHERE id=?",
      r.sequence, r.lastEvent, r.afterHash, p.receipt.commitHash, p.result ? "terminal" : "active", r.gameId));
    // Only genesis and newest checkpoint survive. Events and receipts are never pruned.
    if (p.checkpoint) statements.push(this.sql("DELETE FROM checkpoints WHERE game_id=? AND command_seq>0 AND command_seq<?", r.gameId, r.sequence));
    try { await this.db.batch(statements); }
    catch (error) {
      // Transport errors and constraint errors both need canonical evidence.
      const winner = await this.command(r.gameId, r.input.id);
      if (winner) {
        const stored = await this.readPrepared(r.gameId, winner);
        if (equalCanonical(stored.record, r) && equalCanonical(stored.events, p.events) && equalCanonical(stored.receipt, p.receipt)) return stored.receipt;
        throw new PersistenceError("conflict", "competing command ID");
      }
      const current = await this.game(r.gameId);
      if (!equalCanonical(headOf(current), r.expected) || current.owner_namespace !== r.owner.namespace || current.owner_generation !== r.owner.generation)
        throw new PersistenceError("fenced", "canonical head/owner changed");
      throw new PersistenceError("uncertain", `retain prepare and reconcile (${error instanceof Error ? error.name : "write failure"})`);
    }
    return p.receipt;
  }
  /** Internal operator/room capability, never a public route. Compare the full
   * persisted marker after restoring either store. Older markers must be proven
   * by their immutable receipt; a missing or divergent anchor quarantines. */
  async verifyRestore(gameId: string, marker: Head): Promise<void> {
    await this.schema(); const g = await this.game(gameId);
    const row = marker.command === 0 ? null : await this.sql("SELECT * FROM commands WHERE game_id=? AND seq=?", gameId, marker.command).first<CommandRow>();
    const anchor = row ? { command: row.seq, event: row.last_event, stateHash: row.after_hash, chainHash: row.commit_hash } :
      marker.command === 0 ? { command: 0, event: 0, stateHash: parse<GameHeader>(g.header_json).replay.initialStateHash, chainHash: g.header_hash } : null;
    if (!anchor || !equalCanonical(anchor, marker) || marker.command > g.command_seq) {
      await this.quarantine(gameId, "divergent-restore"); throw new PersistenceError("quarantined", "restore marker not canonical");
    }
    if (row) await this.readPrepared(gameId, row);
  }
  async quarantine(gameId: string, reason: string): Promise<void> {
    opaque(reason); await this.sql("UPDATE games SET quarantine=COALESCE(quarantine,?) WHERE id=?", reason, gameId).run();
  }
  /** Explicit ownership handoff; no automatic takeover or clock recovery. */
  async transferOwner(gameId: string, expected: Head, from: Owner, to: Owner): Promise<void> {
    await this.schema(); validateOwner(from); validateOwner(to);
    check(to.generation > from.generation, "generation must increase", "invalid");
    const result = await this.sql(`UPDATE games SET owner_namespace=?,owner_generation=? WHERE id=? AND quarantine IS NULL
      AND owner_namespace=? AND owner_generation=? AND command_seq=? AND event_seq=? AND state_hash=? AND chain_hash=?`,
    to.namespace, to.generation, gameId, from.namespace, from.generation, expected.command, expected.event, expected.stateHash, expected.chainHash).run();
    check(result.meta.changes === 1, "ownership handoff", "fenced");
  }
  /** Capture header/head/checkpoint/anchor in one primary batch. Canonical rows
   * are immutable; subsequent pages are pinned to that head even during appends.
   * Checkpoint pruning cannot remove the captured bytes. */
  async recover(gameId: string): Promise<Boundary> {
    await this.schema(); opaque(gameId);
    const rows = await this.db.batch([
      this.sql("SELECT * FROM games WHERE id=?", gameId),
      this.sql("SELECT * FROM checkpoints WHERE game_id=? ORDER BY command_seq DESC LIMIT 1", gameId),
      this.sql("SELECT * FROM commands WHERE game_id=? AND seq=(SELECT max(command_seq) FROM checkpoints WHERE game_id=?)", gameId, gameId),
    ]);
    const g = rows[0].results[0] as unknown as GameRow | undefined;
    check(g, "missing game", "conflict"); check(g.quarantine === null, "recovery incident", "quarantined");
    const boundary = await creationBoundary(parse<GameHeader>(g.header_json), this.policy);
    check(boundary.headerHash === g.header_hash && boundary.header.gameId === gameId, "game header integrity");
    const cp = rows[1].results[0] as unknown as CheckpointRow | undefined;
    check(cp && cp.command_seq <= g.command_seq && cp.command_seq >= g.command_seq - LIMITS.checkpointEvery, "checkpoint missing/too old");
    const state = parse<RulesetStateV2>(cp.state_json);
    try { engineState(state); } catch { throw new PersistenceError("corrupt","invalid checkpoint state"); }
    check(state.setupId === boundary.header.replay.game.setupId && !state.pendingEffects.length && state.sequence === cp.event_seq &&
      await stateHash(state) === cp.state_hash, "checkpoint state");
    if (cp.command_seq === 0) same(state, boundary.state, "creation checkpoint");
    else {
      const anchor = rows[2].results[0] as unknown as CommandRow | undefined; check(anchor, "checkpoint anchor missing");
      const record = parse<CommandRecord>(anchor.record_json);
      check(record.headerHash === boundary.headerHash && record.checkpointHash === cp.state_hash &&
        record.lastEvent === cp.event_seq && record.sequence === cp.command_seq && anchor.commit_hash === cp.chain_hash, "checkpoint lineage");
      await this.readPrepared(gameId, anchor);
    }
    let current: Boundary = { ...boundary, state, head: { command: cp.command_seq, event: cp.event_seq, stateHash: cp.state_hash, chainHash: cp.chain_hash } };
    check(cp.command_seq !== 0 || cp.chain_hash === boundary.headerHash, "genesis chain");
    while (current.head.command < g.command_seq) current = await this.readPage(current, g.command_seq);
    same(current.head, headOf(g), "reconstructed canonical head");
    const result = current.state.position.result;
    check((g.lifecycle === "terminal") === (result !== null), "lifecycle result");
    if (result) {
      const terminal = await this.sql("SELECT * FROM results WHERE game_id=? AND command_seq<=?", gameId, g.command_seq)
        .first<{ command_seq: number; result_json: string; result_hash: string }>();
      check(terminal && terminal.command_seq === g.command_seq && await digest(parse(terminal.result_json)) === terminal.result_hash, "terminal anchor");
      same(parse<RulesetResultV2>(terminal.result_json).result, result, "terminal projection");
    }
    return current;
  }
  /** At most eight commands per call. This is also the genesis-audit continuation
   * API: retain the verified Boundary in trusted caller storage and call again in
   * a new invocation. Never accept a client-supplied continuation state. */
  async readPage(boundary: Boundary, throughCommand: number): Promise<Boundary> {
    return (await this.readAuditPage(boundary, throughCommand)).boundary;
  }
  /** Trusted genesis continuation plus exact stored events. A single-command
   * page fits authenticated replay transport; callers never supply wire states. */
  async readAuditPage(boundary: Boundary, throughCommand: number, count: number = LIMITS.commandPage): Promise<{boundary: Boundary; events: ReplayEventV2[]}> {
    await this.schema();
    check(Number.isInteger(count) && count > 0 && count <= LIMITS.commandPage, "audit page size", "invalid");
    check(this.policy.accepts(boundary.header.replay.engineBuild), "producer reader unavailable", "unsupported");
    check(Number.isSafeInteger(throughCommand) && throughCommand <= LIMITS.commands && throughCommand >= boundary.head.command, "audit head bound", "invalid");
    const gameId = boundary.header.gameId;
    const commands = await this.sql("SELECT * FROM commands WHERE game_id=? AND seq>? AND seq<=? ORDER BY seq LIMIT ?",
      gameId, boundary.head.command, throughCommand, count).all<CommandRow>();
    check(commands.results.length > 0 || throughCommand === boundary.head.command, "command gap");
    let current = boundary; const events: ReplayEventV2[] = [];
    for (const row of commands.results) {
      const p = await this.readPrepared(gameId, row); const r = p.record;
      check(p.events.length > 0 && p.events.length <= LIMITS.effects, "audit effect count");
      for (const event of p.events) bounded(event, LIMITS.eventBytes);
      validateRecord(r, this.policy);
      check(r.headerHash === boundary.headerHash && r.sequence === current.head.command + 1 &&
        equalCanonical(r.expected, current.head), "command prefix/lineage");
      validateInput(r.input);
      // Independent reducer execution binds request to the complete stored effects.
      let authored: Awaited<ReturnType<typeof recordReplayAction>>;
      try { authored = await recordReplayAction(current.state, r.input.action); }
      catch { throw new PersistenceError("corrupt", "invalid recorded action"); }
      same(authored.events, p.events, "request/effect mismatch");
      let state: RulesetStateV2;
      try { state = await readReplayEvents(current.state, p.events); }
      catch { throw new PersistenceError("corrupt", "invalid recorded effects"); }
      check(!state.pendingEffects.length && state.sequence === r.lastEvent && await stateHash(state) === r.afterHash, "incomplete effects");
      check((authored.result === null) === (r.resultHash === null), "result commitment");
      if (authored.result) same(authored.result, p.result, "terminal canonical result");
      current = { ...current, state, head: { command: r.sequence, event: r.lastEvent, stateHash: r.afterHash, chainHash: p.receipt.commitHash } };
      bounded(state, LIMITS.stateBytes); events.push(...p.events);
    }
    return {boundary: current, events};
  }
}
