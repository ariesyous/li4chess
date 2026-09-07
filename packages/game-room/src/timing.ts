import { ALL_COLORS, type PlayerColor } from "@li4chess/engine";
import { check, LIMITS, validateAdmissionTiming, type AdmissionTiming } from "@li4chess/persistence";
import type { ActionRequest, RulesetStateV2 } from "@li4chess/protocol";

export type TimingPolicy = AdmissionTiming["policy"];
type Position = RulesetStateV2["position"];
export interface Timing {
  format: "li4chess-room-clock-v1";
  revision: number;
  phase: "running" | "suspended" | "terminal" | "incident";
  remainingMs: [number, number, number, number];
  disconnectRemainingMs: [number, number, number, number];
  connected: [boolean, boolean, boolean, boolean];
  activeSeat: number | null;
  activatedAt: number | null;
  deadline: number | null;
  accountedAt: number;
  policy: TimingPolicy;
  previousResume: AdmissionTiming["previousResume"];
  suspendedAt: number | null;
  backwards: boolean;
  command: number;
  incident: { reason: string; firstAt: number; attempts: number; retryAt: number | null } | null;
}
export interface Deadline { at: number; seat: PlayerColor; kind: "timeout" | "disconnectForfeit" | "randomKingMove" }
const MAX_DURATION = 86_400_000;
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const copy = (timing: Timing): Timing => structuredClone(timing);
function sum(a: number, b: number): number {
  check(integer(a + b), "room clock integer overflow", "invalid"); return a + b;
}
function floor(t: Timing): number {
  return Math.max(t.accountedAt, t.activatedAt ?? 0, t.suspendedAt ?? 0, t.previousResume?.at ?? 0);
}
function time(t: Timing, now: number): number {
  check(integer(now), "room clock timestamp", "invalid");
  if (now < floor(t)) t.backwards = true;
  return Math.max(now, floor(t));
}
function snapshot(t: Timing, suspendedAt: number): AdmissionTiming {
  return { format: "li4chess-room-admission-v1", revision: t.revision, accountedAt: t.accountedAt,
    activeSeat: t.activeSeat, activatedAt: t.activatedAt, deadline: t.deadline,
    remainingMs: [...t.remainingMs], disconnectRemainingMs: [...t.disconnectRemainingMs], connected: [...t.connected],
    policy: { ...t.policy }, previousResume: t.previousResume && { ...t.previousResume }, suspendedAt, backwards: t.backwards };
}
/** Reject malformed restored operational records; canonical admission validation is shared with D1. */
export function validateTiming(value: unknown): asserts value is Timing {
  check(value !== null && typeof value === "object" && !Array.isArray(value), "room clock record", "invalid");
  const t = value as Timing;
  const keys = ["format", "revision", "phase", "remainingMs", "disconnectRemainingMs", "connected", "activeSeat",
    "activatedAt", "deadline", "accountedAt", "policy", "previousResume", "suspendedAt", "backwards", "command", "incident"];
  check(Object.keys(t).length === keys.length && keys.every(k => Object.hasOwn(t, k)), "room clock fields", "invalid");
  check(t.format === "li4chess-room-clock-v1", "room clock format", "unsupported");
  check(["running", "suspended", "terminal", "incident"].includes(t.phase), "room clock phase", "invalid");
  // Validate original arrays and nested objects before copying, so sparse arrays/extra policy fields cannot disappear.
  const { phase: _phase, command: _command, incident: _incident, ...admission } = t;
  validateAdmissionTiming({ ...admission, format: "li4chess-room-admission-v1", suspendedAt: t.suspendedAt ?? t.accountedAt });
  check(t.policy.initialMs <= MAX_DURATION && t.policy.incrementMs <= MAX_DURATION, "room clock policy bound", "invalid");
  const maximum = t.policy.initialMs + LIMITS.commands * t.policy.incrementMs;
  check(t.remainingMs.every(n => n <= maximum) && t.disconnectRemainingMs.every(n => n <= 60000), "room clock balance bound", "invalid");
  check(integer(t.command) && t.command <= LIMITS.commands, "room clock command", "invalid");
  check(t.suspendedAt === null || integer(t.suspendedAt) && t.suspendedAt >= t.accountedAt, "room clock suspension", "invalid");
  check(t.activatedAt === null || t.activatedAt <= t.accountedAt, "room clock activation order", "invalid");
  check(t.previousResume === null || t.previousResume.revision <= t.revision && t.previousResume.at <= t.accountedAt,
    "room clock resume order", "invalid");
  check(t.activeSeat !== null || t.deadline === null, "room clock deadline seat", "invalid");
  check(t.deadline === null || t.activatedAt !== null && t.deadline >= t.activatedAt, "room clock deadline order", "invalid");
  if (t.phase === "running") check(t.activeSeat !== null && t.activatedAt !== null && t.suspendedAt === null,
    "running clock activation", "invalid");
  if (t.phase === "suspended" || t.phase === "incident") check(t.suspendedAt !== null, "suspended clock marker", "invalid");
  if (t.phase === "terminal") check(t.activeSeat === null && t.deadline === null && t.activatedAt === null, "terminal clock", "invalid");
  if (t.incident !== null) {
    const i = t.incident;
    check(typeof i === "object" && Object.keys(i).length === 4 &&
      ["reason", "firstAt", "attempts", "retryAt"].every(k => Object.hasOwn(i, k)), "room clock incident fields", "invalid");
    check(typeof i.reason === "string" && i.reason.length > 0 && i.reason.length <= 512 && integer(i.firstAt) &&
      integer(i.attempts) && (i.retryAt === null || integer(i.retryAt)), "room clock incident", "invalid");
  }
}

export function initialTiming(policy: TimingPolicy, now: number): Timing {
  const t: Timing = { format: "li4chess-room-clock-v1", revision: 0, phase: "suspended",
    remainingMs: [policy.initialMs, policy.initialMs, policy.initialMs, policy.initialMs],
    disconnectRemainingMs: [60000, 60000, 60000, 60000], connected: [false, false, false, false],
    activeSeat: null, activatedAt: null, deadline: null, accountedAt: now, policy: { ...policy },
    previousResume: null, suspendedAt: now, backwards: false, command: 0, incident: null };
  validateTiming(t); return t;
}

/** Debit one elapsed interval. Callers resolve due work using earliestDeadline BEFORE accounting a late alarm. */
export function account(timing: Timing, position: Position, now: number): Timing {
  const t = copy(timing); const at = time(t, now);
  if (t.phase !== "running" || position.result !== null) return t;
  const elapsed = at - t.accountedAt;
  if (t.activeSeat !== null && position.players[t.activeSeat as PlayerColor].status === "active")
    t.remainingMs[t.activeSeat as PlayerColor] = Math.max(0, t.remainingMs[t.activeSeat as PlayerColor] - elapsed);
  for (const seat of ALL_COLORS) if (!t.connected[seat] && position.players[seat].status === "active")
    t.disconnectRemainingMs[seat] = Math.max(0, t.disconnectRemainingMs[seat] - elapsed);
  t.accountedAt = at; return t;
}

export function admissionTiming(timing: Timing): AdmissionTiming {
  validateTiming(timing);
  check(timing.phase === "suspended" && timing.suspendedAt !== null, "admission requires suspended timing", "invalid");
  const result = snapshot(timing, timing.suspendedAt); validateAdmissionTiming(result); return result;
}

export function suspend(timing: Timing, position: Position, now: number): Timing {
  const t = account(timing, position, now);
  t.suspendedAt = time(t, now); t.phase = "suspended"; t.revision = sum(t.revision, 1); return t;
}

/** Durable activation starts from stored balances; unavailable infrastructure time is never debited. */
export function activate(timing: Timing, position: Position, now: number, command: number,
  reason: "creation" | "commit" | "recovery"): Timing {
  const t = copy(timing); const at = time(t, now);
  check(integer(command) && command <= LIMITS.commands, "room clock command", "invalid");
  t.command = command; t.accountedAt = at; t.suspendedAt = null; t.incident = null;
  t.previousResume = { revision: t.revision, at, reason };
  t.phase = position.result === null ? "running" : "terminal";
  t.activeSeat = position.result === null ? position.turn : null;
  t.activatedAt = position.result === null ? at : null;
  t.deadline = t.activeSeat !== null && position.players[position.turn].status === "active"
    ? sum(at, t.remainingMs[position.turn]) : null;
  return t;
}

/** The admission/legality boundary guarantees ordinary moves belong to an active player. */
export function increment(timing: Timing, action: ActionRequest): Timing {
  const t = copy(timing);
  if (action.type === "move") t.remainingMs[action.actor] = Math.min(
    t.policy.initialMs + LIMITS.commands * t.policy.incrementMs, sum(t.remainingMs[action.actor], t.policy.incrementMs));
  return t;
}

export function earliestDeadline(t: Timing, position: Position): Deadline | null {
  if (t.phase !== "running" || position.result !== null) return null;
  const candidates: Deadline[] = [];
  if (t.activeSeat !== null && position.players[t.activeSeat as PlayerColor].status === "active" && t.deadline !== null)
    candidates.push({ at: t.deadline, seat: t.activeSeat as PlayerColor, kind: "timeout" });
  for (const seat of ALL_COLORS) if (!t.connected[seat] && position.players[seat].status === "active")
    candidates.push({ at: sum(t.accountedAt, t.disconnectRemainingMs[seat]), seat, kind: "disconnectForfeit" });
  if (position.players[position.turn].kingStatus === "walking")
    candidates.push({ at: t.accountedAt, seat: position.turn, kind: "randomKingMove" });
  const priority = { timeout: 0, disconnectForfeit: 1, randomKingMove: 2 };
  candidates.sort((a, b) => a.at - b.at || priority[a.kind] - priority[b.kind] || a.seat - b.seat);
  return candidates[0] ?? null;
}
