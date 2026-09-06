import { ALL_COLORS, PieceType, boardToLocal, fileOf, rankOf, computeGameResult, isSquareOnBoard, isInsufficientMaterial, positionKey } from "@li4chess/engine";
import type { GameState, Move, ScoreAward } from "@li4chess/engine";
import { canonicalJson, equalCanonical } from "./canonical.js";
import { MODERN_SETUP, STANDARD_RULESET, STATE_SCHEMA } from "./types.js";
import type { EngineBuildIdentityV1, RulesetStateV2 } from "./types.js";

export function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid v2 migration data: ${message}`);
}
export function object(value: unknown, required: string[], optional: string[] = []): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value), "expected object");
  const record = value as Record<string, unknown>;
  requireValue(required.every(key => Object.hasOwn(record, key) && record[key] !== undefined), `missing ${required.join("/")}`);
  requireValue(Object.keys(record).every(key => required.includes(key) || optional.includes(key)), "unknown field");
  return record;
}
function integer(value: unknown, min = 0): asserts value is number {
  requireValue(Number.isSafeInteger(value) && (value as number) >= min, "integer out of range");
}
function color(value: unknown): void { requireValue(ALL_COLORS.includes(value as number), "seat"); }
function points(value: unknown, positive = false): void {
  requireValue(typeof value === "number" && Number.isFinite(value) && (positive ? value > 0 : value >= 0) &&
    Number.isSafeInteger(Math.round(value * 3)) && Math.abs(value * 3 - Math.round(value * 3)) < 1e-8, "points");
}
function array(value: unknown): asserts value is unknown[] { requireValue(Array.isArray(value), "array"); }
function seats(value: unknown, validate: (item: unknown, seat: number) => void): void {
  const record = object(value, ["0", "1", "2", "3"]);
  for (const seat of ALL_COLORS) validate(record[seat], seat);
}
function square(value: unknown): void { integer(value); requireValue(isSquareOnBoard(value), "playable square"); }
function boolean(value: unknown): void { requireValue(typeof value === "boolean", "boolean"); }
function piece(value: unknown): void {
  const p = object(value, ["type", "owner", "hasMoved"], ["promotedFrom"]);
  requireValue(Object.values(PieceType).includes(p.type as PieceType), "piece type");
  color(p.owner); boolean(p.hasMoved);
  if (p.promotedFrom !== undefined) requireValue(p.promotedFrom === "P" && p.type === "Q" && p.hasMoved, "promotion provenance");
}
function colorList(value: unknown): void {
  array(value); value.forEach(color); requireValue(new Set(value).size === value.length, "duplicate seat");
}
export function validateMove(value: unknown): asserts value is Move {
  const move = object(value, ["from", "to", "piece", "isCheck", "eliminates"], ["captured", "promotion", "castle", "enPassantCapture"]);
  square(move.from); square(move.to); requireValue(move.from !== move.to, "stationary move"); piece(move.piece);
  if (move.captured !== undefined) piece(move.captured);
  if (move.promotion !== undefined) requireValue(move.promotion === "Q", "automatic Queen promotion");
  if (move.castle !== undefined) requireValue(move.castle === "kingside" || move.castle === "queenside", "castle side");
  if (move.enPassantCapture !== undefined) square(move.enPassantCapture);
  colorList(move.isCheck); colorList(move.eliminates);
}
function clock(value: unknown): void {
  const fact = object(value, ["remainingMs"]); requireValue(fact.remainingMs === 0, "zero clock fact");
}
function disconnect(value: unknown): void {
  const fact = object(value, ["bankMs", "cumulativeDisconnectedMs", "remainingMs"]);
  requireValue(fact.bankMs === 60000 && fact.remainingMs === 0, "disconnect bank");
  integer(fact.cumulativeDisconnectedMs, 60000);
}
const awardRules: ScoreAward["rule"][] = ["capture", "multi-check", "walking-stalemate", "mate", "self-stalemate",
  "opponent-stalemate", "survivor", "claim-win", "repetition", "insufficient-material", "fifty-move"];
export function validateAward(value: unknown): asserts value is ScoreAward {
  const award = object(value, ["sequence", "causeSequence", "rule", "recipient", "delta", "total"], ["subject"]);
  integer(award.sequence, 1); integer(award.causeSequence, 1);
  requireValue(award.causeSequence < award.sequence, "award cause precedes award");
  requireValue(awardRules.includes(award.rule as ScoreAward["rule"]), "award rule");
  color(award.recipient); if (award.subject !== undefined) color(award.subject);
  points(award.delta, true); points(award.total, true);
}
function selection(value: unknown): void {
  const s = object(value, ["algorithmId", "seed", "drawIndex", "drawsUsed", "candidateMovesHash"]);
  requireValue(s.algorithmId === "splitmix32-rejection-v1" && typeof s.seed === "string" && /^[0-9a-f]{8}$/.test(s.seed), "random identity");
  integer(s.drawIndex); integer(s.drawsUsed, 1);
  requireValue(Number.isSafeInteger(s.drawIndex + s.drawsUsed), "random cursor overflow");
  requireValue(typeof s.candidateMovesHash === "string" && /^fnv1a64:[0-9a-f]{16}$/.test(s.candidateMovesHash), "candidate hash");
}

/** Checkpoint validation checks every field's shape and cross-field invariants.
 * Reachability before a checkpoint is established only by its source replay. */
export function validatePosition(value: unknown, pending = false): asserts value is Omit<GameState, "rulesetId"> {
  const s = object(value, ["reversibleMoves", "completedMoves", "randomSeed", "randomDrawIndex", "randomActions",
    "eventSequence", "awardLedger", "board", "players", "turn", "turnNumber", "castlingRights", "enPassantRights",
    "moveHistory", "result", "positionCounts"]);
  canonicalJson(s);
  integer(s.reversibleMoves); integer(s.eventSequence); integer(s.turnNumber, 1); color(s.turn);
  const eventSequence = s.eventSequence, turnNumber = s.turnNumber;
  seats(s.completedMoves, count => integer(count));
  requireValue(typeof s.randomSeed === "string" && /^[0-9a-f]{8}$/.test(s.randomSeed), "seed"); integer(s.randomDrawIndex);
  array(s.board); requireValue(s.board.length === 196, "196 board cells");
  s.board.forEach((p, index) => { if (p !== null) { square(index); piece(p); } });
  seats(s.players, (value, seat) => {
    const p = object(value, ["color", "status", "isCPU", "score"], ["cpuDifficulty", "eliminatedOnTurn", "kingStatus", "forfeit", "noMoveCause"]);
    requireValue(p.color === seat && ["active", "checkmated", "stalemated", "resigned", "timed-out"].includes(p.status as string), "player status");
    boolean(p.isCPU); points(p.score);
    if (p.cpuDifficulty !== undefined) { integer(p.cpuDifficulty,1); requireValue(p.cpuDifficulty <= 5,"CPU difficulty"); }
    if (p.eliminatedOnTurn !== undefined) { integer(p.eliminatedOnTurn, 1); requireValue(p.eliminatedOnTurn <= turnNumber, "elimination turn"); }
    if (p.kingStatus !== undefined) requireValue(["walking", "checkmated", "stalemated", "surrendered"].includes(p.kingStatus as string) && p.status !== "active", "king status");
    const kings = (s.board as GameState["board"]).filter(piece => piece?.owner === seat && piece.type === "K").length;
    requireValue(kings <= 1 && (p.status !== "active" && p.kingStatus !== "walking" || kings === 1), "one live King per live seat");
    if (p.noMoveCause !== undefined) {
      const cause = object(p.noMoveCause, ["actor", "sequence"]); color(cause.actor); integer(cause.sequence, 1);
      requireValue(cause.sequence <= eventSequence, "no-move cause sequence");
    }
    if (p.forfeit !== undefined) {
      const f = object(p.forfeit, ["reason", "sequence"], ["clock", "disconnect"]); integer(f.sequence, 1);
      requireValue(f.sequence <= eventSequence, "forfeit sequence");
      requireValue(f.reason === "resign" ? p.status === "resigned" && f.clock === undefined && f.disconnect === undefined :
        p.status === "timed-out" && (f.reason === "timeout" || f.reason === "disconnect"), "forfeit status/reason");
      if (f.reason === "timeout") { clock(f.clock); requireValue(f.disconnect === undefined, "timeout facts"); }
      if (f.reason === "disconnect") { disconnect(f.disconnect); requireValue(f.clock === undefined, "disconnect facts"); }
    }
    if (p.kingStatus === "walking") requireValue(p.forfeit !== undefined, "walking forfeit cause");
  });
  seats(s.castlingRights, value => { const r = object(value, ["kingside", "queenside"]); boolean(r.kingside); boolean(r.queenside); });
  array(s.enPassantRights);
  const epSquares = new Set<number>();
  for (const value of s.enPassantRights) {
    const ep = object(value, ["target", "pawnSquare", "pawnOwner", "eligiblePlayers"]);
    square(ep.target); square(ep.pawnSquare); color(ep.pawnOwner); colorList(ep.eligiblePlayers);
    requireValue((ep.eligiblePlayers as number[]).length > 0 && !(ep.eligiblePlayers as number[]).includes(ep.pawnOwner as number), "EP eligibility");
    const pawn = (s.board as GameState["board"])[ep.pawnSquare as number];
    requireValue(pawn?.type === "P" && pawn.owner === ep.pawnOwner && !epSquares.has(ep.pawnSquare as number), "EP pawn");
    const [pawnFile,pawnRank] = boardToLocal(pawn.owner,fileOf(ep.pawnSquare as number),rankOf(ep.pawnSquare as number));
    const [targetFile,targetRank] = boardToLocal(pawn.owner,fileOf(ep.target as number),rankOf(ep.target as number));
    requireValue(pawn.hasMoved && pawnRank === 3 && targetRank === 2 && targetFile === pawnFile &&
      (ep.eligiblePlayers as number[]).every(seat => (s.players as GameState["players"])[seat as keyof GameState["players"]].status === "active"), "EP geometry/active eligibility");
    epSquares.add(ep.pawnSquare as number);
  }
  requireValue(s.positionCounts && typeof s.positionCounts === "object" && !Array.isArray(s.positionCounts), "position counts");
  Object.values(s.positionCounts).forEach(count => integer(count, 1));
  array(s.moveHistory); s.moveHistory.forEach(validateMove);
  array(s.awardLedger);
  let previous = 0;
  const totals = new Map<number, number>();
  for (const value of s.awardLedger) {
    validateAward(value); requireValue(value.sequence > previous && value.sequence <= s.eventSequence, "ordered award ledger"); previous = value.sequence;
    const total = totals.get(value.recipient);
    if (total !== undefined) requireValue((Math.round(total * 3) + Math.round(value.delta * 3)) / 3 === value.total, "award running total");
    requireValue(value.total >= value.delta, "award total"); totals.set(value.recipient, value.total);
  }
  const players = s.players as GameState["players"];
  if (s.result === null && !pending) requireValue(players[s.turn as keyof typeof players].status === "active" ||
    players[s.turn as keyof typeof players].kingStatus === "walking", "current turn must have a live seat");
  for (const [seat, total] of totals) requireValue(players[seat as keyof typeof players].score === total, "ledger/player total");
  array(s.randomActions); previous = 0; let cursor = 0;
  for (const value of s.randomActions) {
    const action = object(value, ["sequence", "causeSequence", "actor", "move", "selection"]);
    integer(action.sequence, 1); integer(action.causeSequence, 1); color(action.actor); validateMove(action.move); selection(action.selection);
    const selected = action.selection as GameState["randomActions"][number]["selection"];
    requireValue(action.sequence > previous && action.sequence <= s.eventSequence && action.causeSequence < action.sequence, "random sequence");
    requireValue(selected.seed === s.randomSeed && selected.drawIndex === cursor, "random cursor history");
    requireValue(action.move.piece.owner === action.actor && action.move.piece.type === "K" &&
      players[action.actor as keyof typeof players].forfeit?.sequence === action.causeSequence, "random actor/cause");
    previous = action.sequence; cursor += selected.drawsUsed;
  }
  requireValue(cursor === s.randomDrawIndex, "random cursor total");
  if (s.result !== null) {
    requireValue(!pending, "terminal pending effects");
    const result = object(s.result, ["placements", "winner", "reason"], ["claim", "abort"]);
    requireValue(["elimination", "claim-win", "repetition", "insufficient-material", "fifty-move", "abort"].includes(result.reason as string), "terminal reason");
    if (result.reason === "abort") {
      const abort = object(result.abort, ["classification", "actor", "causeSequence", "completedMoves", "ratingLiable"], ["clock", "disconnect"]);
      color(abort.actor); requireValue(abort.actor === abort.ratingLiable, "abort liability"); integer(abort.causeSequence, 1);
      requireValue(abort.causeSequence === s.eventSequence - 1 && equalCanonical(abort.completedMoves, s.completedMoves) &&
        Object.values(s.completedMoves as object).some(count => count < 3), "abort counters/cause");
      requireValue(abort.classification === "early-resign" || abort.classification === "early-timeout", "abort class");
      if (abort.classification === "early-resign") requireValue(abort.clock === undefined && abort.disconnect === undefined, "resign facts");
      else { requireValue((abort.clock === undefined) !== (abort.disconnect === undefined), "one timeout cause");
        if (abort.clock !== undefined) clock(abort.clock); else disconnect(abort.disconnect); }
      requireValue(equalCanonical(result.placements, []) && result.winner === null && result.claim === undefined, "abort has no standings");
    } else {
      const expected = computeGameResult(players);
      requireValue(equalCanonical(result.placements, expected.placements) && result.winner === expected.winner && result.abort === undefined, "points placements/winner");
      const active = ALL_COLORS.filter(color=>players[color].status === "active");
      const position = { ...s, rulesetId: STANDARD_RULESET } as unknown as GameState;
      if (result.reason === "elimination") requireValue(active.length <= 1, "elimination active count");
      if (result.reason === "fifty-move") requireValue(active.length >= 2 && s.reversibleMoves >= 200, "fifty-move counter");
      if (result.reason === "insufficient-material") requireValue(active.length >= 2 && isInsufficientMaterial(position), "material predicate");
      if (result.reason === "repetition") requireValue(active.length >= 2 && (position.positionCounts[positionKey(position)] ?? 0) >= 3, "repetition predicate");
      if (result.reason === "claim-win") {
        const claim = object(result.claim, ["actor", "trailer", "lead", "causeSequence"]); color(claim.actor); color(claim.trailer);
        points(claim.lead); integer(claim.causeSequence, 1);
        requireValue(claim.actor !== claim.trailer && (claim.lead as number) >= 21 && claim.causeSequence === s.eventSequence - 2 &&
          players[claim.actor as keyof typeof players].kingStatus === "surrendered", "claim facts");
        requireValue(active.length === 1 && active[0] === claim.trailer &&
          Math.round((claim.lead as number)*3) === Math.round(players[claim.actor as keyof typeof players].score*3) -
            Math.round(players[claim.trailer as keyof typeof players].score*3) + 60, "claim trailer/lead consistency");
      } else requireValue(result.claim === undefined, "unexpected claim");
    }
  }
}

export function validateState(value: unknown, allowPending = false): asserts value is RulesetStateV2 {
  const state = object(value, ["stateSchemaId", "rulesetId", "setupId", "sequence", "position", "pendingEffects"]);
  requireValue(state.stateSchemaId === STATE_SCHEMA && state.rulesetId === STANDARD_RULESET &&
    (state.setupId === MODERN_SETUP || typeof state.setupId === "string" && /^li4chess-ffa-checkpoint-v1:sha256:[0-9a-f]{64}$/.test(state.setupId)), "unsupported state/ruleset/setup identity");
  integer(state.sequence);
  array(state.pendingEffects);
  requireValue(allowPending || state.pendingEffects.length === 0, "pending effects need their source replay");
  validatePosition(state.position, state.pendingEffects.length > 0);
}

export function validateBuild(value: unknown): asserts value is EngineBuildIdentityV1 {
  const build = object(value, ["format", "sourceRevision", "packageVersions", "workingTree"], ["buildFingerprint"]);
  requireValue(build.format === "li4chess-engine-build-v1" && typeof build.sourceRevision === "string" && /^[0-9a-f]{40}$/.test(build.sourceRevision), "immutable build revision");
  requireValue(build.packageVersions && typeof build.packageVersions === "object" && !Array.isArray(build.packageVersions), "package versions");
  const versions = build.packageVersions as Record<string, unknown>;
  requireValue(["@li4chess/engine", "@li4chess/protocol"].every(name => typeof versions[name] === "string" && versions[name] !== "") &&
    Object.values(versions).every(version => typeof version === "string" && /^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(version)), "engine/protocol package versions");
  const tree = object(build.workingTree, ["status"], ["contentHash", "reason"]);
  if (tree.status === "clean") requireValue(tree.contentHash === undefined && tree.reason === undefined, "clean identity");
  else if (tree.status === "dirty") { validateHash(tree.contentHash); requireValue(tree.reason === undefined, "dirty identity"); }
  else requireValue(tree.status === "unreproducible" && typeof tree.reason === "string" && tree.reason.trim() !== "" && tree.contentHash === undefined, "unreproducible identity");
  if (build.buildFingerprint !== undefined) validateHash(build.buildFingerprint);
}
export function validateHash(value: unknown): void { requireValue(typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value), "SHA-256 identity"); }
